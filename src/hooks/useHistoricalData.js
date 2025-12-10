import { useState, useCallback, useRef } from 'react';

let histDataReqCounter = 7000;

const debug = (...args) => {
  if (process.argv.includes('--debug')) {
    console.error('[HISTORICAL-DATA]', ...args);
  }
};

// Períodos disponibles
export const PERIODS = {
  '1W': { duration: '1 W', barSize: '1 hour', label: '1 semana' },
  '1M': { duration: '1 M', barSize: '1 day', label: '1 mes' },
  '3M': { duration: '3 M', barSize: '1 day', label: '3 meses' },
  '6M': { duration: '6 M', barSize: '1 day', label: '6 meses' },
  '1Y': { duration: '1 Y', barSize: '1 day', label: '1 año' },
};

export const PERIOD_KEYS = ['1W', '1M', '3M', '6M', '1Y'];
export const DEFAULT_PERIOD = '3M';

export function useHistoricalData(getClient, isConnected) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState({});
  const [error, setError] = useState({});
  const cacheRef = useRef({}); // Cache: { "GOOG-3M": { bars: [...], timestamp: Date } }
  const activeRequestsRef = useRef({});

  const getCacheKey = (symbol, period) => `${symbol}-${period}`;

  const fetchHistorical = useCallback((symbol, period = DEFAULT_PERIOD, exchange = 'SMART', currency = 'USD') => {
    const client = getClient();
    const cacheKey = getCacheKey(symbol, period);

    debug(`fetchHistorical called: ${symbol} period=${period}`);

    if (!client || !isConnected) {
      debug('Not connected, rejecting');
      return Promise.reject(new Error('No conectado'));
    }

    // Check cache (5 min TTL)
    const cached = cacheRef.current[cacheKey];
    if (cached && (Date.now() - cached.timestamp) < 5 * 60 * 1000) {
      debug(`Using cached data for ${cacheKey}`);
      setData(prev => ({ ...prev, [cacheKey]: cached.bars }));
      return Promise.resolve(cached.bars);
    }

    // Check if already requesting
    if (activeRequestsRef.current[cacheKey]) {
      debug(`Already fetching ${cacheKey}, returning existing promise`);
      return activeRequestsRef.current[cacheKey];
    }

    const reqId = ++histDataReqCounter;
    const periodConfig = PERIODS[period];

    debug(`Requesting historical data: reqId=${reqId} duration=${periodConfig.duration} barSize=${periodConfig.barSize}`);

    setLoading(prev => ({ ...prev, [cacheKey]: true }));
    setError(prev => ({ ...prev, [cacheKey]: null }));

    const promise = new Promise((resolve, reject) => {
      const contract = client.contract.stock(symbol, exchange, currency);
      const bars = [];
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          debug(`Timeout for ${cacheKey}`);
          cleanup();
          setLoading(prev => ({ ...prev, [cacheKey]: false }));
          setError(prev => ({ ...prev, [cacheKey]: 'Timeout obteniendo histórico' }));
          reject(new Error('Timeout obteniendo histórico'));
        }
      }, 15000);

      const finishRequest = () => {
        if (resolved) return;
        resolved = true;
        cleanup();

        debug(`Finishing request for ${cacheKey}: ${bars.length} bars`);

        // Sort by date and cache
        bars.sort((a, b) => a.date.localeCompare(b.date));

        cacheRef.current[cacheKey] = {
          bars,
          timestamp: Date.now(),
        };

        setData(prev => ({ ...prev, [cacheKey]: bars }));
        setLoading(prev => ({ ...prev, [cacheKey]: false }));
        resolve(bars);
      };

      const onHistoricalData = (id, date, open, high, low, close, volume, count, WAP, hasGaps) => {
        if (id !== reqId) return;

        // IB sends a final bar with date = "finished-..." to signal completion
        if (date && date.startsWith('finished')) {
          debug(`Historical data complete signal for ${cacheKey}: ${bars.length} bars`);
          finishRequest();
          return;
        }

        bars.push({
          date,
          open,
          high,
          low,
          close,
          volume,
        });
      };

      // Some IB library versions use a separate event
      const onHistoricalDataEnd = (id, start, end) => {
        if (id !== reqId) return;
        debug(`historicalDataEnd event for ${cacheKey}: ${bars.length} bars from ${start} to ${end}`);
        finishRequest();
      };

      const onError = (err, errData) => {
        if (resolved) return;
        const code = errData?.code;
        const id = errData?.id;

        // Ignore info/warning messages:
        // 2104, 2106, 2158 = connection info
        // 2176 = "fractional share size rules" warning (safe to ignore)
        // 10089 = "requires additional API subscriptions" (delayed data still comes)
        // 10167, 10168 = delayed data info
        // 300, 354 = ticker ID not found / not subscribed
        if (code && [300, 354, 2104, 2106, 2158, 2176, 10089, 10167, 10168].includes(code)) {
          debug(`Ignoring info/warning code ${code}`);
          return;
        }
        if (id !== undefined && id !== -1 && id !== reqId) return;

        debug(`Error for ${cacheKey}: code=${code} message=${err?.message}`);

        // Only treat as error if it's for our request
        if (id === reqId || id === -1) {
          resolved = true;
          cleanup();
          setLoading(prev => ({ ...prev, [cacheKey]: false }));
          setError(prev => ({ ...prev, [cacheKey]: err?.message || 'Error desconocido' }));
          reject(new Error(err?.message || 'Error obteniendo histórico'));
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        delete activeRequestsRef.current[cacheKey];
        client.removeListener('historicalData', onHistoricalData);
        client.removeListener('historicalDataEnd', onHistoricalDataEnd);
        client.removeListener('error', onError);
      };

      client.on('historicalData', onHistoricalData);
      client.on('historicalDataEnd', onHistoricalDataEnd);
      client.on('error', onError);

      // Log ALL events for debugging
      const debugAllEvents = (eventName) => (...args) => {
        debug(`[EVENT] ${eventName}:`, JSON.stringify(args).slice(0, 200));
      };

      // Temporarily listen to all events
      client.on('historicalData', debugAllEvents('historicalData'));

      debug(`Calling reqHistoricalData: reqId=${reqId}`);

      // Request historical data
      // endDateTime = '' means now
      // useRTH = 1 (regular trading hours only)
      // formatDate = 1 (yyyyMMdd format for day bars)
      client.reqHistoricalData(
        reqId,
        contract,
        '',  // endDateTime (empty = now)
        periodConfig.duration,
        periodConfig.barSize,
        'TRADES',  // whatToShow
        1,  // useRTH
        1,  // formatDate
        false  // keepUpToDate
      );
    });

    activeRequestsRef.current[cacheKey] = promise;
    return promise;
  }, [getClient, isConnected]);

  const getData = useCallback((symbol, period = DEFAULT_PERIOD) => {
    const cacheKey = getCacheKey(symbol, period);
    return data[cacheKey] || null;
  }, [data]);

  const isLoading = useCallback((symbol, period = DEFAULT_PERIOD) => {
    const cacheKey = getCacheKey(symbol, period);
    return loading[cacheKey] || false;
  }, [loading]);

  const getError = useCallback((symbol, period = DEFAULT_PERIOD) => {
    const cacheKey = getCacheKey(symbol, period);
    return error[cacheKey] || null;
  }, [error]);

  const prefetch = useCallback((symbol, period = DEFAULT_PERIOD) => {
    debug(`Prefetching ${symbol} period=${period}`);
    fetchHistorical(symbol, period).catch(() => {
      // Silently ignore prefetch errors
      debug(`Prefetch failed for ${symbol} - will retry on demand`);
    });
  }, [fetchHistorical]);

  return {
    fetchHistorical,
    getData,
    isLoading,
    getError,
    prefetch,
    PERIODS,
    PERIOD_KEYS,
    DEFAULT_PERIOD,
  };
}

export default useHistoricalData;
