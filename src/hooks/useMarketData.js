import { useState, useCallback, useRef } from 'react';

let marketDataReqCounter = 6000;

const debug = (...args) => {
  if (process.argv.includes('--debug')) {
    console.error('[MARKET-DATA]', ...args);
  }
};

export function useMarketData(getClient, isConnected) {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState({});
  const activeRequestsRef = useRef({});

  const fetchPrice = useCallback((symbol, exchange = 'SMART', currency = 'USD') => {
    debug(`fetchPrice called for ${symbol} (${exchange}, ${currency})`);
    const client = getClient();
    if (!client || !isConnected) {
      debug(`Rejected: client=${!!client} isConnected=${isConnected}`);
      return Promise.reject(new Error('No conectado'));
    }

    if (activeRequestsRef.current[symbol]) {
      debug(`Using cached request for ${symbol}`);
      return activeRequestsRef.current[symbol];
    }

    const reqId = ++marketDataReqCounter;
    debug(`Requesting market data for ${symbol} with reqId=${reqId}`);
    setLoading(prev => ({ ...prev, [symbol]: true }));

    const promise = new Promise((resolve, reject) => {
      const contract = client.contract.stock(symbol, exchange, currency);
      debug(`Contract created:`, contract);
      let resolved = false;

      const interestingFields = new Set([
        client.TICK_TYPE.LAST,
        client.TICK_TYPE.DELAYED_LAST,
        client.TICK_TYPE.MARK_PRICE,
        client.TICK_TYPE.BID,
        client.TICK_TYPE.ASK,
        client.TICK_TYPE.CLOSE,
        client.TICK_TYPE.DELAYED_CLOSE,
      ]);

      const timeout = setTimeout(() => {
        if (!resolved) {
          debug(`⏱️  TIMEOUT for ${symbol} (reqId=${reqId}) - no price data received in 8s`);
          cleanup();
          setLoading(prev => ({ ...prev, [symbol]: false }));
          reject(new Error(`Timeout obteniendo precio de ${symbol}`));
        }
      }, 8000);

      const onTickPrice = (tickerId, field, price) => {
        debug(`tickPrice event: tickerId=${tickerId} reqId=${reqId} field=${field} (${client.util.tickTypeToString(field)}) price=${price}`);

        if (tickerId !== reqId) {
          debug(`  ↳ Ignored: different tickerId`);
          return;
        }
        if (!interestingFields.has(field)) {
          debug(`  ↳ Ignored: not interesting field`);
          return;
        }
        if (price <= 0) {
          debug(`  ↳ Ignored: invalid price (${price})`);
          return;
        }
        if (resolved) {
          debug(`  ↳ Ignored: already resolved`);
          return;
        }

        debug(`✅ PRICE RECEIVED for ${symbol}: $${price} (${client.util.tickTypeToString(field)})`);
        resolved = true;
        cleanup();

        const priceData = {
          price,
          field,
          fieldLabel: client.util.tickTypeToString(field),
          timestamp: Date.now(),
        };

        setPrices(prev => ({ ...prev, [symbol]: priceData }));
        setLoading(prev => ({ ...prev, [symbol]: false }));
        resolve(priceData);
      };

      const onError = (err, data) => {
        if (resolved) return;
        const code = data?.code;
        debug(`Error event for reqId=${reqId}: code=${code} message=${err?.message}`);

        // Info/warning codes to ignore:
        // 2104, 2106, 2158 = connection info
        // 10167 = "No live subscription, showing delayed data" (NOT an error!)
        // 10168 = "Delayed market data" info
        if (code && [2104, 2106, 2158, 10167, 10168].includes(code)) {
          debug(`  ↳ Ignored: info message (code ${code})`);
          return;
        }

        debug(`❌ ERROR for ${symbol}: ${err?.message || 'Unknown error'}`);
        cleanup();
        setLoading(prev => ({ ...prev, [symbol]: false }));
        reject(new Error(err?.message || `Error obteniendo precio de ${symbol}`));
      };

      const cleanup = () => {
        clearTimeout(timeout);
        delete activeRequestsRef.current[symbol];
        client.removeListener('tickPrice', onTickPrice);
        client.removeListener('error', onError);
        try {
          client.cancelMktData(reqId);
        } catch (e) {
          // ignore
        }
      };

      client.on('tickPrice', onTickPrice);
      client.on('error', onError);

      debug(`Setting market data type to 3 (delayed)`);
      client.reqMarketDataType(3); // delayed data si no hay realtime

      debug(`Calling reqMktData(${reqId}, contract, '', true, false)`);
      client.reqMktData(reqId, contract, '', true, false);
      debug(`reqMktData called successfully, waiting for tickPrice events...`);
    });

    activeRequestsRef.current[symbol] = promise;
    return promise;
  }, [getClient, isConnected]);

  const getPrice = useCallback((symbol) => {
    return prices[symbol]?.price || null;
  }, [prices]);

  const isLoading = useCallback((symbol) => {
    return loading[symbol] || false;
  }, [loading]);

  return {
    prices,
    fetchPrice,
    getPrice,
    isLoading,
  };
}

export default useMarketData;
