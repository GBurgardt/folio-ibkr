import { useState, useCallback, useRef } from 'react';

/**
 * useMarketData - Hook para obtener precios de mercado
 *
 * IMPORTANTE: Para posiciones que ya tenemos, el precio viene directamente
 * de updatePortfolio (en usePortfolio). Este hook solo se usa como
 * fuente secundaria para símbolos que NO están en el portfolio.
 *
 * Dado que no tenemos suscripción de market data en IB, este hook
 * simplemente marca los símbolos como "no disponible" y la UI
 * usa los precios históricos como fallback.
 */

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

    const promise = new Promise((resolve) => {
      const contract = client.contract.stock(symbol, exchange, currency);
      debug(`Contract created:`, contract);
      let resolved = false;

      // Tick types we care about (both live and delayed)
      const interestingFields = new Set([
        1, 2, 4, 6, 7, 9, 14, 37,  // Live
        66, 67, 68, 72, 73, 75, 76  // Delayed
      ]);

      const tickTypeNames = {
        1: 'BID', 2: 'ASK', 4: 'LAST', 6: 'HIGH', 7: 'LOW', 9: 'CLOSE', 14: 'OPEN',
        37: 'MARK_PRICE', 66: 'DELAYED_BID', 67: 'DELAYED_ASK', 68: 'DELAYED_LAST',
        72: 'DELAYED_HIGH', 73: 'DELAYED_LOW', 75: 'DELAYED_CLOSE', 76: 'DELAYED_OPEN'
      };

      // Timeout corto - si no hay market data, resolvemos null
      // La UI usará el precio histórico como fallback
      const timeout = setTimeout(() => {
        if (!resolved) {
          debug(`⏱️ TIMEOUT for ${symbol} - no market data available (no subscription)`);
          cleanup();
          setLoading(prev => ({ ...prev, [symbol]: false }));
          resolve(null);
        }
      }, 3000); // 3 segundos es suficiente para saber si hay datos

      const onTickPrice = (tickerId, field, price) => {
        const fieldName = tickTypeNames[field] || `UNKNOWN(${field})`;
        debug(`tickPrice event: tickerId=${tickerId} field=${field} (${fieldName}) price=${price}`);

        if (tickerId !== reqId) return;
        if (!interestingFields.has(field)) return;
        if (price <= 0) return;
        if (resolved) return;

        debug(`✅ PRICE RECEIVED for ${symbol}: $${price} (${fieldName})`);
        resolved = true;
        cleanup();

        const priceData = {
          price,
          field,
          fieldLabel: fieldName,
          timestamp: Date.now(),
        };

        setPrices(prev => ({ ...prev, [symbol]: priceData }));
        setLoading(prev => ({ ...prev, [symbol]: false }));
        resolve(priceData);
      };

      const onError = (err, data) => {
        if (resolved) return;
        const code = data?.code;

        // Códigos informativos a ignorar
        const ignoreCodes = [300, 354, 2104, 2106, 2158, 2176, 10089, 10167, 10168];
        if (code && ignoreCodes.includes(code)) {
          debug(`Info message (code ${code}): ${err?.message}`);
          return;
        }

        debug(`Error for ${symbol} (code ${code}): ${err?.message}`);
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

      // Intentar con tipo 4 (delayed-frozen)
      debug(`Setting market data type to 4 (delayed-frozen)`);
      client.reqMarketDataType(4);

      debug(`Calling reqMktData(${reqId}, contract, '', true, false)`);
      client.reqMktData(reqId, contract, '', true, false);
      debug(`reqMktData called, waiting for tickPrice events...`);
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
