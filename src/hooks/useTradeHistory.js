import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'ib_trade_history';

const debug = (...args) => {
  if (process.argv.includes('--debug')) {
    console.error('[TRADE-HISTORY]', ...args);
  }
};

/**
 * Hook for persisting and retrieving trade history from localStorage
 *
 * Trade structure:
 * {
 *   id: string,           // Unique ID (timestamp-based)
 *   type: 'BUY' | 'SELL', // Trade type
 *   symbol: string,       // Stock symbol
 *   quantity: number,     // Number of shares
 *   price: number,        // Price per share at execution
 *   total: number,        // Total value (quantity * price)
 *   timestamp: number,    // Unix timestamp
 *   orderId: number,      // IB order ID (for reference)
 *   avgCostAtTrade: number // Average cost at time of trade (for sells, to calculate P&L)
 * }
 */
export function useTradeHistory() {
  const [trades, setTrades] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // Load trades from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Sort by timestamp descending (newest first)
          const sorted = parsed.sort((a, b) => b.timestamp - a.timestamp);
          setTrades(sorted);
          debug(`Loaded ${sorted.length} trades from localStorage`);
        }
      }
    } catch (err) {
      debug('Error loading trades from localStorage:', err.message);
    }
    setLoaded(true);
  }, []);

  // Save trades to localStorage whenever they change
  useEffect(() => {
    if (loaded && trades.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
        debug(`Saved ${trades.length} trades to localStorage`);
      } catch (err) {
        debug('Error saving trades to localStorage:', err.message);
      }
    }
  }, [trades, loaded]);

  /**
   * Add a new trade to history
   */
  const addTrade = useCallback((trade) => {
    const newTrade = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ...trade,
    };

    debug('Adding trade:', newTrade);

    setTrades(prev => {
      const updated = [newTrade, ...prev];
      // Keep only last 100 trades to avoid localStorage bloat
      return updated.slice(0, 100);
    });

    return newTrade;
  }, []);

  /**
   * Record a BUY trade
   */
  const recordBuy = useCallback((symbol, quantity, price, orderId) => {
    return addTrade({
      type: 'BUY',
      symbol,
      quantity,
      price,
      total: quantity * price,
      orderId,
    });
  }, [addTrade]);

  /**
   * Record a SELL trade
   */
  const recordSell = useCallback((symbol, quantity, price, orderId, avgCostAtTrade) => {
    return addTrade({
      type: 'SELL',
      symbol,
      quantity,
      price,
      total: quantity * price,
      orderId,
      avgCostAtTrade,
    });
  }, [addTrade]);

  /**
   * Get all trades, optionally filtered by symbol
   */
  const getTrades = useCallback((symbol = null) => {
    if (symbol) {
      return trades.filter(t => t.symbol === symbol);
    }
    return trades;
  }, [trades]);

  /**
   * Get trades for a specific symbol
   */
  const getTradesForSymbol = useCallback((symbol) => {
    return trades.filter(t => t.symbol === symbol);
  }, [trades]);

  /**
   * Get the timestamp of the first BUY for a symbol
   * This is used to determine the start date for performance charts
   */
  const getFirstPurchaseDate = useCallback((symbol) => {
    const buys = trades
      .filter(t => t.symbol === symbol && t.type === 'BUY')
      .sort((a, b) => a.timestamp - b.timestamp); // oldest first

    if (buys.length === 0) return null;

    debug(`First purchase of ${symbol}: ${new Date(buys[0].timestamp).toISOString()}`);
    return buys[0].timestamp;
  }, [trades]);

  /**
   * Calculate current performance for a BUY trade
   * Returns { gain, gainPercent } based on current price
   */
  const calculateBuyPerformance = useCallback((trade, currentPrice) => {
    if (!trade || trade.type !== 'BUY' || !currentPrice) {
      return { gain: 0, gainPercent: 0 };
    }

    const currentValue = trade.quantity * currentPrice;
    const originalValue = trade.total;
    const gain = currentValue - originalValue;
    const gainPercent = originalValue > 0 ? (gain / originalValue) * 100 : 0;

    return { gain, gainPercent };
  }, []);

  /**
   * Calculate performance for a SELL trade
   * Returns { gain, gainPercent } based on avgCost at time of sale
   */
  const calculateSellPerformance = useCallback((trade) => {
    if (!trade || trade.type !== 'SELL') {
      return { gain: 0, gainPercent: 0 };
    }

    // If we have avgCostAtTrade, calculate actual P&L
    if (trade.avgCostAtTrade) {
      const costBasis = trade.quantity * trade.avgCostAtTrade;
      const saleValue = trade.total;
      const gain = saleValue - costBasis;
      const gainPercent = costBasis > 0 ? (gain / costBasis) * 100 : 0;
      return { gain, gainPercent };
    }

    // Fallback: no P&L calculation possible
    return { gain: 0, gainPercent: 0 };
  }, []);

  /**
   * Clear all trade history
   */
  const clearHistory = useCallback(() => {
    debug('Clearing all trade history');
    setTrades([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      debug('Error clearing localStorage:', err.message);
    }
  }, []);

  return {
    trades,
    loaded,
    addTrade,
    recordBuy,
    recordSell,
    getTrades,
    getTradesForSymbol,
    getFirstPurchaseDate,
    calculateBuyPerformance,
    calculateSellPerformance,
    clearHistory,
  };
}

export default useTradeHistory;
