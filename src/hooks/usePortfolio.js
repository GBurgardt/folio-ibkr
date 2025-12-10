import { useState, useEffect, useCallback, useRef } from 'react';

const ACCOUNT_SUMMARY_REQ_ID = 9001;

const debug = (...args) => {
  if (process.argv.includes('--debug')) {
    console.error('[PORTFOLIO]', ...args);
  }
};

export function usePortfolio(getClient, isConnected, accountId) {
  const [positions, setPositions] = useState([]);
  const [accountData, setAccountData] = useState({
    netLiquidation: 0,
    totalCashValue: 0,
    settledCash: 0,
    availableFunds: 0,
    buyingPower: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const positionsRef = useRef([]);
  const accountDataRef = useRef({});
  const subscribedRef = useRef(false);

  const fetchPortfolio = useCallback(() => {
    const client = getClient();
    if (!client || !isConnected) {
      debug('fetchPortfolio: not connected');
      return;
    }

    debug('fetchPortfolio: starting, accountId:', accountId);
    setLoading(true);
    setError(null);
    positionsRef.current = [];
    accountDataRef.current = {
      netLiquidation: 0,
      totalCashValue: 0,
      settledCash: 0,
      availableFunds: 0,
      buyingPower: 0,
    };

    let accountSummaryDone = false;
    let portfolioDone = false;

    const checkComplete = () => {
      if (accountSummaryDone && portfolioDone) {
        debug('checkComplete: both done, positions:', positionsRef.current.length);
        setPositions([...positionsRef.current]);
        setAccountData({ ...accountDataRef.current });
        setLoading(false);
        cleanup();
      }
    };

    const onAccountSummary = (reqId, account, tag, value, currency) => {
      if (reqId !== ACCOUNT_SUMMARY_REQ_ID) return;

      const numValue = parseFloat(value);
      debug('accountSummary:', tag, '=', numValue);

      switch (tag) {
        case 'NetLiquidation':
          accountDataRef.current.netLiquidation = numValue;
          break;
        case 'TotalCashValue':
          accountDataRef.current.totalCashValue = numValue;
          break;
        case 'SettledCash':
          accountDataRef.current.settledCash = numValue;
          break;
        case 'AvailableFunds':
          accountDataRef.current.availableFunds = numValue;
          break;
        case 'BuyingPower':
          accountDataRef.current.buyingPower = numValue;
          break;
      }
    };

    const onAccountSummaryEnd = (reqId) => {
      if (reqId !== ACCOUNT_SUMMARY_REQ_ID) return;
      debug('accountSummaryEnd');
      accountSummaryDone = true;
      checkComplete();
    };

    // updatePortfolio gives us marketPrice and unrealizedPNL directly from IB!
    const onUpdatePortfolio = (contract, position, marketPrice, marketValue, avgCost, unrealizedPNL, realizedPNL, accountName) => {
      debug('updatePortfolio:', contract.symbol, 'pos:', position, 'price:', marketPrice, 'value:', marketValue, 'avgCost:', avgCost, 'unrealizedPNL:', unrealizedPNL);

      if (position !== 0) {
        const existingIndex = positionsRef.current.findIndex(
          p => p.symbol === contract.symbol
        );

        const positionData = {
          symbol: contract.symbol,
          secType: contract.secType,
          quantity: position,
          avgCost: avgCost,
          marketPrice: marketPrice,  // THIS IS THE CURRENT PRICE!
          marketValue: marketValue,
          unrealizedPNL: unrealizedPNL,
          realizedPNL: realizedPNL,
          currency: contract.currency || 'USD',
        };

        if (existingIndex >= 0) {
          positionsRef.current[existingIndex] = positionData;
        } else {
          positionsRef.current.push(positionData);
        }
      }
    };

    const onAccountDownloadEnd = (accountName) => {
      debug('accountDownloadEnd:', accountName);
      portfolioDone = true;
      checkComplete();
    };

    const cleanup = () => {
      debug('cleanup: removing listeners');
      client.removeListener('accountSummary', onAccountSummary);
      client.removeListener('accountSummaryEnd', onAccountSummaryEnd);
      client.removeListener('updatePortfolio', onUpdatePortfolio);
      client.removeListener('accountDownloadEnd', onAccountDownloadEnd);
      try {
        client.cancelAccountSummary(ACCOUNT_SUMMARY_REQ_ID);
      } catch (e) {
        // ignore
      }
      // NO cancelamos reqAccountUpdates - mantenerlo activo no causa problemas
      // y cancelarlo puede interferir con otras llamadas a la API
    };

    const timeout = setTimeout(() => {
      debug('TIMEOUT fetching portfolio');
      setError('Timeout obteniendo datos del portfolio');
      setLoading(false);
      cleanup();
    }, 15000);

    client.on('accountSummary', onAccountSummary);
    client.on('accountSummaryEnd', onAccountSummaryEnd);
    client.on('updatePortfolio', onUpdatePortfolio);
    client.on('accountDownloadEnd', onAccountDownloadEnd);

    debug('Requesting account summary...');
    client.reqAccountSummary(
      ACCOUNT_SUMMARY_REQ_ID,
      'All',
      ['NetLiquidation', 'TotalCashValue', 'SettledCash', 'AvailableFunds', 'BuyingPower']
    );

    // Use reqAccountUpdates instead of reqPositions - this gives us marketPrice!
    if (accountId) {
      debug('Requesting account updates for:', accountId);
      client.reqAccountUpdates(true, accountId);
      subscribedRef.current = true;
    } else {
      debug('No accountId, falling back to reqPositions');
      // Fallback to reqPositions if no accountId
      client.reqPositions();
      client.on('position', (account, contract, position, avgCost) => {
        if (position !== 0) {
          const existingIndex = positionsRef.current.findIndex(
            p => p.symbol === contract.symbol
          );
          const positionData = {
            symbol: contract.symbol,
            secType: contract.secType,
            quantity: position,
            avgCost: avgCost,
            marketPrice: null,  // Not available from reqPositions
            marketValue: position * avgCost,
            unrealizedPNL: null,
            realizedPNL: null,
            currency: contract.currency || 'USD',
          };
          if (existingIndex >= 0) {
            positionsRef.current[existingIndex] = positionData;
          } else {
            positionsRef.current.push(positionData);
          }
        }
      });
      client.on('positionEnd', () => {
        portfolioDone = true;
        checkComplete();
      });
    }

    return () => {
      clearTimeout(timeout);
      cleanup();
    };
  }, [getClient, isConnected, accountId]);

  useEffect(() => {
    if (isConnected) {
      fetchPortfolio();
    }
  }, [isConnected, fetchPortfolio]);

  const totalInvested = positions.reduce((sum, p) => sum + p.marketValue, 0);
  const totalGain = accountData.netLiquidation - totalInvested - accountData.totalCashValue;
  const gainPercent = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

  return {
    positions,
    accountData,
    loading,
    error,
    refresh: fetchPortfolio,
    computed: {
      totalInvested,
      totalGain,
      gainPercent,
      // Use SettledCash for buying power in Cash accounts (what IB actually validates against)
      cash: accountData.settledCash || accountData.totalCashValue || accountData.availableFunds,
    },
  };
}

export default usePortfolio;
