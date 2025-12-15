import { useState, useCallback, useEffect, useRef } from 'react';

const EXECUTIONS_REQ_ID = 8001;

const debug = (...args) => {
  if (process.argv.includes('--debug')) {
    console.error('[EXECUTIONS]', ...args);
  }
};

/**
 * Hook to fetch execution history from IB
 *
 * Uses reqExecutions() which returns trades since midnight (default)
 * or up to 7 days if TWS Trade Log is configured.
 *
 * Each execution contains:
 * - symbol: Stock symbol
 * - side: 'BOT' (buy) or 'SLD' (sell)
 * - quantity: Number of shares
 * - price: Execution price
 * - time: Execution time string
 */
export function useExecutions(getClient, isConnected) {
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fetchedRef = useRef(false);

  const fetchExecutions = useCallback(() => {
    const client = getClient();
    if (!client || !isConnected) {
      debug('fetchExecutions: not connected');
      return;
    }

    debug('fetchExecutions: starting');
    setLoading(true);
    setError(null);

    const executionsList = [];

    const onExecDetails = (reqId, contract, execution) => {
      if (reqId !== EXECUTIONS_REQ_ID) return;

      debug('execDetails:', {
        symbol: contract.symbol,
        side: execution.side,
        shares: execution.shares,
        price: execution.price,
        time: execution.time,
      });

      executionsList.push({
        id: execution.execId,
        symbol: contract.symbol,
        side: execution.side, // 'BOT' or 'SLD'
        quantity: parseFloat(execution.shares) || parseInt(execution.shares, 10),
        price: execution.price,
        avgPrice: execution.avgPrice,
        time: execution.time, // "YYYYMMDD HH:MM:SS"
        orderId: execution.orderId,
      });
    };

    const onExecDetailsEnd = (reqId) => {
      if (reqId !== EXECUTIONS_REQ_ID) return;

      debug('execDetailsEnd:', executionsList.length, 'executions');
      cleanup();

      // Sort by time descending (most recent first)
      executionsList.sort((a, b) => {
        // Time format: "YYYYMMDD HH:MM:SS"
        return b.time.localeCompare(a.time);
      });

      setExecutions(executionsList);
      setLoading(false);
    };

    const onError = (err, data) => {
      // Ignore info/warning codes
      const code = data?.code;
      if (code && [2104, 2106, 2158, 2176, 10167, 10168].includes(code)) {
        return;
      }

      // Only handle errors for our request
      if (data?.id === EXECUTIONS_REQ_ID || data?.id === -1) {
        debug('Error fetching executions:', err?.message, 'code:', code);
        cleanup();
        setError(err?.message || 'Error fetching activity');
        setLoading(false);
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      client.removeListener('execDetails', onExecDetails);
      client.removeListener('execDetailsEnd', onExecDetailsEnd);
      client.removeListener('error', onError);
    };

    const timeout = setTimeout(() => {
      debug('Timeout fetching executions');
      cleanup();
      // If we got some executions before timeout, use them
      if (executionsList.length > 0) {
        executionsList.sort((a, b) => b.time.localeCompare(a.time));
        setExecutions(executionsList);
      }
      setLoading(false);
    }, 10000);

    client.on('execDetails', onExecDetails);
    client.on('execDetailsEnd', onExecDetailsEnd);
    client.on('error', onError);

    // Request executions with empty filter (get all)
    debug('Calling reqExecutions');
    client.reqExecutions(EXECUTIONS_REQ_ID, {});

  }, [getClient, isConnected]);

  // Fetch on connect (once)
  useEffect(() => {
    if (isConnected && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchExecutions();
    }
  }, [isConnected, fetchExecutions]);

  // Reset fetched flag on disconnect
  useEffect(() => {
    if (!isConnected) {
      fetchedRef.current = false;
    }
  }, [isConnected]);

  return {
    executions,
    loading,
    error,
    refresh: fetchExecutions,
  };
}

export default useExecutions;
