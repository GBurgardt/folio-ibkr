import { useState, useCallback, useRef } from 'react';

// Messages that should be completely ignored (no user notification needed)
const IGNORABLE_MESSAGES = [
  'Order TIF was set to DAY based on order preset',
];

// Messages that are warnings (order still works, but user should know)
const WARNING_PATTERNS = [
  { pattern: /no se enviará al mercado hasta el (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/, type: 'market_closed' },
  { pattern: /will not be sent to the market until (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/, type: 'market_closed' },
  { pattern: /order will not be active until/, type: 'market_closed' },
  { pattern: /order is being held/, type: 'order_held' },
];

// Rejection patterns - these mean the order was rejected
const REJECTION_PATTERNS = [
  { pattern: /Orden rechazada\. Motivo:(.+)/, type: 'rejected' },
  { pattern: /Order rejected\. Reason:(.+)/, type: 'rejected' },
  { pattern: /Efectivo liquidado disponible/, type: 'insufficient_funds' },
  { pattern: /Insufficient funds/, type: 'insufficient_funds' },
];

function extractRejection(message) {
  if (!message) return null;

  for (const { pattern, type } of REJECTION_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      // Clean up HTML tags like <br>
      let reason = match[1] || message;
      reason = reason.replace(/<br\s*\/?>/gi, ' ').trim();
      return {
        type,
        reason,
        rawMessage: message,
      };
    }
  }
  return null;
}

function isIgnorableMessage(message) {
  if (!message) return false;
  return IGNORABLE_MESSAGES.some((text) => message.includes(text));
}

function extractWarning(message) {
  if (!message) return null;

  for (const { pattern, type } of WARNING_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      return {
        type,
        rawMessage: message,
        timestamp: match[1] || null,
      };
    }
  }
  return null;
}

/**
 * Humanize a warning for display to user
 */
export function humanizeWarning(warning) {
  if (!warning) return null;

  if (warning.type === 'market_closed') {
    // Parse the timestamp and make it human-readable
    if (warning.timestamp) {
      try {
        const date = new Date(warning.timestamp.replace(' ', 'T'));
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const isToday = date.toDateString() === now.toDateString();
        const isTomorrow = date.toDateString() === tomorrow.toDateString();

        const hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const timeStr = `${hours}:${minutes}`;

        if (isToday) {
          return `Executes today ${timeStr} (market closed)`;
        } else if (isTomorrow) {
          return `Executes tomorrow ${timeStr} (market closed)`;
        } else {
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          return `Executes ${dayNames[date.getDay()]} ${timeStr}`;
        }
      } catch {
        return 'Executes when the market opens';
      }
    }
    return 'Executes when the market opens';
  }

  if (warning.type === 'order_held') {
    return 'Order held';
  }

  return null;
}

export function useTrade(getClient, isConnected) {
  const [orderStatus, setOrderStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const nextOrderIdRef = useRef(null);

  const getNextOrderId = useCallback(() => {
    return new Promise((resolve, reject) => {
      const client = getClient();
      if (!client || !isConnected) {
        reject(new Error('Not connected'));
        return;
      }

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout getting order ID'));
      }, 5000);

      const onNextValidId = (orderId) => {
        cleanup();
        nextOrderIdRef.current = orderId;
        resolve(orderId);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        client.removeListener('nextValidId', onNextValidId);
      };

      client.once('nextValidId', onNextValidId);
      client.reqIds(1);
    });
  }, [getClient, isConnected]);

  const submitOrder = useCallback(async ({
    symbol,
    action, // 'BUY' or 'SELL'
    quantity,
    orderType = 'MKT',
    exchange = 'SMART',
    currency = 'USD',
  }) => {
    const client = getClient();
    if (!client || !isConnected) {
      throw new Error('Not connected');
    }

    setLoading(true);
    setError(null);
    setOrderStatus(null);

    try {
      const orderId = await getNextOrderId();
      const contract = client.contract.stock(symbol, exchange, currency);
      const order = client.order.market(action, quantity);
      order.tif = 'DAY';

      return new Promise((resolve, reject) => {
        let lastStatus = 'Submitting';
        let resolved = false;
        let orderWarning = null; // Store warning if any
        let orderRejection = null; // Store rejection reason if any
        const terminalStatuses = new Set(['Filled', 'Cancelled', 'Inactive']);
        // Also consider Submitted/PreSubmitted as success (order accepted)
        const acceptedStatuses = new Set(['Submitted', 'PreSubmitted', 'Filled']);

        const timeout = setTimeout(() => {
          if (!resolved) {
            cleanup();
            setLoading(false);
            // If we have a warning and reached timeout, order was likely accepted
            resolve({
              orderId,
              status: orderRejection ? 'Inactive' : (orderWarning ? 'Submitted' : lastStatus),
              filled: null,
              avgFillPrice: null,
              warning: orderWarning,
              rejectionReason: orderRejection?.reason,
            });
          }
        }, 30000);

        const onOrderStatus = (id, status, filled, remaining, avgFillPrice) => {
          if (id !== orderId) return;
          lastStatus = status;

          setOrderStatus({
            orderId: id,
            status,
            filled,
            remaining,
            avgFillPrice,
          });

          // Resolve on terminal status OR on accepted status (for market-closed orders)
          if (!resolved && (terminalStatuses.has(status) || acceptedStatuses.has(status))) {
            resolved = true;
            cleanup();
            setLoading(false);
            resolve({
              orderId: id,
              status,
              filled,
              avgFillPrice,
              warning: orderWarning,
              rejectionReason: orderRejection?.reason,
            });
          }
        };

        const onError = (err, data) => {
          if (resolved) return;

          const message = err?.message || 'Error submitting order';
          const errorId = data?.id;

          // Ignore errors for other orders
          if (errorId !== undefined && errorId !== -1 && errorId !== orderId) {
            return;
          }

          // Check if this is completely ignorable
          if (isIgnorableMessage(message)) {
            return;
          }

          // Check if this is a rejection
          const rejection = extractRejection(message);
          if (rejection) {
            // Store rejection - order will be marked as Inactive
            orderRejection = rejection;
            return;
          }

          // Check if this is a warning (not a fatal error)
          const warning = extractWarning(message);
          if (warning) {
            // Store warning but don't reject - order is still being processed
            orderWarning = warning;
            return;
          }

          // This is a real error - reject
          resolved = true;
          cleanup();
          setLoading(false);
          setError(message);
          reject(new Error(message));
        };

        const cleanup = () => {
          clearTimeout(timeout);
          client.removeListener('orderStatus', onOrderStatus);
          client.removeListener('error', onError);
        };

        client.on('orderStatus', onOrderStatus);
        client.on('error', onError);
        client.placeOrder(orderId, contract, order);
      });
    } catch (err) {
      setLoading(false);
      setError(err.message);
      throw err;
    }
  }, [getClient, isConnected, getNextOrderId]);

  const buy = useCallback((symbol, quantity) => {
    return submitOrder({ symbol, action: 'BUY', quantity });
  }, [submitOrder]);

  const sell = useCallback((symbol, quantity) => {
    return submitOrder({ symbol, action: 'SELL', quantity });
  }, [submitOrder]);

  return {
    buy,
    sell,
    submitOrder,
    orderStatus,
    loading,
    error,
  };
}

export default useTrade;
