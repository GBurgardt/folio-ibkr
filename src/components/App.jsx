import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, useApp, useInput } from 'ink';

function debug(...args) {
  if (global.DEBUG_MODE) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    console.log(`[${timestamp}] [APP]`, ...args);
  }
}

/**
 * Calculate cash reserved by pending BUY orders
 * This prevents users from placing orders they can't afford
 *
 * We use a 1.05 (5%) buffer because:
 * - IB may use different prices (bid/ask spread)
 * - IB includes estimated commissions (~$1 per order)
 * - IB may have additional safety margins
 */
const ORDER_COST_BUFFER = 1.05; // 5% safety margin

function calculateReservedCash(pendingOrders, prices, getHistoricalData, chartPeriod) {
  if (!pendingOrders || pendingOrders.length === 0) return 0;

  let reserved = 0;
  for (const order of pendingOrders) {
    if (order.action !== 'BUY') continue;

    // Try to get price: realtime > historical > 0
    let price = prices[order.symbol]?.price;
    if (!price) {
      const historicalData = getHistoricalData?.(order.symbol, chartPeriod);
      if (historicalData?.length > 0) {
        price = historicalData[historicalData.length - 1].close;
      }
    }

    if (price) {
      // Apply buffer to match IB's conservative calculation
      const estimatedCost = order.quantity * price * ORDER_COST_BUFFER;
      reserved += estimatedCost;
      debug(`Reserved cash for ${order.symbol}: ${order.quantity} × $${price} × ${ORDER_COST_BUFFER} = $${estimatedCost.toFixed(2)}`);
    }
  }

  debug(`Total reserved cash from pending orders: $${reserved.toFixed(2)}`);
  return reserved;
}

import { useIBConnection } from '../hooks/useIBConnection.js';
import { usePortfolio } from '../hooks/usePortfolio.js';
import { useMarketData } from '../hooks/useMarketData.js';
import { useTrade } from '../hooks/useTrade.js';
import { useHistoricalData, DEFAULT_PERIOD } from '../hooks/useHistoricalData.js';
import { useExecutions } from '../hooks/useExecutions.js';
import { useOrders } from '../hooks/useOrders.js';

import { Loading, ConnectionError, OrderResult } from './Loading.jsx';
import Portfolio from './Portfolio.jsx';
import BuyScreen from './BuyScreen.jsx';
import SellScreen from './SellScreen.jsx';
import SearchScreen from './SearchScreen.jsx';
import ChartScreen from './ChartScreen.jsx';
import ActivityScreen from './ActivityScreen.jsx';
import OrdersScreen from './OrdersScreen.jsx';
import Breadcrumb from './Breadcrumb.jsx';

// Screen name translations for breadcrumb and back button
const SCREEN_NAMES = {
  portfolio: 'inicio',
  chart: 'gráfico',
  buy: 'comprar',
  sell: 'vender',
  search: 'buscar',
  activity: 'actividad',
  orders: 'órdenes',
};

// Screens: connecting, error, portfolio, chart, buy, sell, search, order-result, activity, orders
export function App({ paperTrading = false }) {
  const { exit } = useApp();

  const port = paperTrading ? 7497 : 7496;
  debug('App initialized with paperTrading:', paperTrading, 'port:', port);
  const {
    status: connectionStatus,
    error: connectionError,
    accountId,
    connect,
    disconnect,
    getClient,
    isConnected,
  } = useIBConnection({ port });

  const {
    positions,
    accountData,
    computed,
    loading: portfolioLoading,
    refresh: refreshPortfolio,
  } = usePortfolio(getClient, isConnected, accountId);

  const {
    prices,
    fetchPrice,
    isLoading: isPriceLoading,
  } = useMarketData(getClient, isConnected);

  const {
    buy,
    sell,
    orderStatus,
    loading: orderLoading,
    error: orderError,
  } = useTrade(getClient, isConnected);

  const {
    fetchHistorical,
    getData: getHistoricalData,
    isLoading: isHistoricalLoading,
    getError: getHistoricalError,
    prefetch: prefetchHistorical,
  } = useHistoricalData(getClient, isConnected);

  const {
    executions,
    loading: executionsLoading,
    refresh: refreshExecutions,
  } = useExecutions(getClient, isConnected);

  const {
    orders: pendingOrders,
    loading: ordersLoading,
    cancelOrder,
    pendingCount,
  } = useOrders(getClient, isConnected);

  // ═══════════════════════════════════════════════════════════════
  // NAVIGATION STACK SYSTEM
  // ═══════════════════════════════════════════════════════════════
  // The stack remembers where the user has been.
  // 'connecting' and 'error' are outside the normal navigation flow.
  // 'portfolio' is always at the bottom of the stack.
  // 'order-result' clears the stack and returns to portfolio.
  const [navStack, setNavStack] = useState(['connecting']);

  // Current screen is the top of the stack
  const screen = navStack[navStack.length - 1];

  // Navigation functions
  const navigateTo = useCallback((newScreen) => {
    debug('navigateTo:', newScreen, 'from stack:', navStack);
    setNavStack(prev => [...prev, newScreen]);
  }, [navStack]);

  const navigateBack = useCallback(() => {
    debug('navigateBack, current stack:', navStack);
    if (navStack.length > 1) {
      setNavStack(prev => prev.slice(0, -1));
    }
  }, [navStack]);

  const navigateHome = useCallback(() => {
    debug('navigateHome - clearing stack');
    setNavStack(['portfolio']);
    // Clear transient state
    setChartSymbol(null);
    setChartPosition(null);
    setBuySymbol(null);
    setSellData(null);
  }, []);

  // Initialize navigation when connected
  const initializeNavigation = useCallback(() => {
    debug('Initializing navigation to portfolio');
    setNavStack(['portfolio']);
  }, []);

  const [chartPeriod, setChartPeriod] = useState(DEFAULT_PERIOD);
  const [chartSymbol, setChartSymbol] = useState(null); // Symbol being viewed in chart
  const [chartPosition, setChartPosition] = useState(null); // Position if owned
  const [buySymbol, setBuySymbol] = useState(null);
  const [sellData, setSellData] = useState(null);
  const [lastOrderResult, setLastOrderResult] = useState(null);

  // Conectar al iniciar - SOLO UNA VEZ
  const hasConnectedRef = React.useRef(false);
  useEffect(() => {
    if (hasConnectedRef.current) {
      debug('Already connected once, skipping');
      return;
    }
    hasConnectedRef.current = true;
    debug('Initial connect useEffect triggered (first time only)');
    connect();
    return () => {
      debug('Cleanup: disconnecting');
      disconnect();
    };
  }, []); // Sin dependencias para que solo corra una vez

  // Cambiar pantalla según estado de conexión
  useEffect(() => {
    debug('Connection status changed:', connectionStatus, 'Error:', connectionError);
    debug('Current screen:', screen);
    if (connectionStatus === 'connected' && screen === 'connecting') {
      debug('Transitioning to portfolio screen');
      initializeNavigation();
    } else if (connectionStatus === 'error') {
      debug('Transitioning to error screen');
      setNavStack(['error']);
    }
  }, [connectionStatus, screen, connectionError, initializeNavigation]);

  // Cargar precios de posiciones al conectar
  useEffect(() => {
    if (isConnected && positions.length > 0) {
      positions.forEach(pos => {
        fetchPrice(pos.symbol).catch(() => {});
      });
    }
  }, [isConnected, positions, fetchPrice]);

  // Cargar precios de órdenes pendientes (para calcular cash reservado)
  useEffect(() => {
    if (isConnected && pendingOrders.length > 0) {
      debug('Fetching prices for pending orders to calculate reserved cash');
      pendingOrders.forEach(order => {
        fetchPrice(order.symbol).catch(() => {});
        // Also fetch historical as fallback
        fetchHistorical(order.symbol, chartPeriod).catch(() => {});
      });
    }
  }, [isConnected, pendingOrders, fetchPrice, fetchHistorical, chartPeriod]);

  // Calculate effective cash (total cash minus reserved by pending BUY orders)
  const reservedCash = useMemo(() => {
    return calculateReservedCash(pendingOrders, prices, getHistoricalData, chartPeriod);
  }, [pendingOrders, prices, getHistoricalData, chartPeriod]);

  const effectiveCash = useMemo(() => {
    const effective = Math.max(0, (computed.cash || 0) - reservedCash);
    debug(`Effective cash: $${computed.cash?.toFixed(2)} - $${reservedCash.toFixed(2)} = $${effective.toFixed(2)}`);
    return effective;
  }, [computed.cash, reservedCash]);

  // Handlers
  const handleViewChart = useCallback((symbolOrPosition) => {
    // Can receive either a position object or a symbol string
    const isPosition = typeof symbolOrPosition === 'object';
    const symbol = isPosition ? symbolOrPosition.symbol : symbolOrPosition;
    const position = isPosition ? symbolOrPosition : null;

    debug('Navigating to chart for', symbol, isPosition ? '(owned)' : '(not owned)');

    setChartSymbol(symbol);
    setChartPosition(position);
    navigateTo('chart');
    setChartPeriod(DEFAULT_PERIOD);

    // Fetch data
    fetchPrice(symbol).catch(() => {});
    fetchHistorical(symbol, DEFAULT_PERIOD).catch(() => {});
  }, [fetchPrice, fetchHistorical, navigateTo]);

  const handleChartPeriodChange = useCallback((period) => {
    debug('Chart period changed to', period);
    setChartPeriod(period);
    if (chartSymbol) {
      fetchHistorical(chartSymbol, period).catch(() => {});
    }
  }, [fetchHistorical, chartSymbol]);

  const handleBuy = useCallback((symbol) => {
    debug('handleBuy called for:', symbol);
    setBuySymbol(symbol);
    navigateTo('buy');
    // Fetch both real-time price and historical data (fallback)
    fetchPrice(symbol).catch(() => {
      debug('fetchPrice failed for', symbol, '- will use historical fallback');
    });
    fetchHistorical(symbol, chartPeriod).catch(() => {
      debug('fetchHistorical failed for', symbol);
    });
  }, [fetchPrice, fetchHistorical, chartPeriod, navigateTo]);

  const handleSell = useCallback((symbol, quantity) => {
    debug('handleSell called for:', symbol, 'quantity:', quantity);
    setSellData({ symbol, quantity });
    navigateTo('sell');
    // Fetch both real-time price and historical data (fallback)
    fetchPrice(symbol).catch(() => {
      debug('fetchPrice failed for', symbol, '- will use historical fallback');
    });
    fetchHistorical(symbol, chartPeriod).catch(() => {
      debug('fetchHistorical failed for', symbol);
    });
  }, [fetchPrice, fetchHistorical, chartPeriod, navigateTo]);

  const handleSearch = useCallback(() => {
    navigateTo('search');
  }, [navigateTo]);

  const handleConfirmBuy = useCallback(async (symbol, quantity) => {
    try {
      const result = await buy(symbol, quantity);
      setLastOrderResult(result);
      // Order result is a terminal state - we'll navigate home after
      setNavStack(['portfolio', 'order-result']);
      // Refresh executions to show the new trade
      if (result.status === 'Filled') {
        setTimeout(() => refreshExecutions(), 1000);
      }
    } catch (err) {
      console.error('Error buying:', err);
    }
  }, [buy, refreshExecutions]);

  const handleConfirmSell = useCallback(async (symbol, quantity) => {
    try {
      const result = await sell(symbol, quantity);
      setLastOrderResult(result);
      // Order result is a terminal state - we'll navigate home after
      setNavStack(['portfolio', 'order-result']);
      // Refresh executions to show the new trade
      if (result.status === 'Filled') {
        setTimeout(() => refreshExecutions(), 1000);
      }
    } catch (err) {
      console.error('Error selling:', err);
    }
  }, [sell, refreshExecutions]);

  const handleActivity = useCallback(() => {
    debug('Opening activity screen');
    refreshExecutions();
    navigateTo('activity');
  }, [refreshExecutions, navigateTo]);

  // Orders screen handlers
  const handleOrders = useCallback(() => {
    debug('Opening orders screen');
    // Fetch prices for pending orders symbols
    pendingOrders.forEach(order => {
      fetchPrice(order.symbol).catch(() => {});
    });
    navigateTo('orders');
  }, [pendingOrders, fetchPrice, navigateTo]);

  const handleOrdersCancel = useCallback(async (orderId) => {
    debug('Cancelling order:', orderId);
    try {
      await cancelOrder(orderId);
      debug('Order cancelled successfully');
    } catch (err) {
      debug('Error cancelling order:', err.message);
    }
  }, [cancelOrder]);

  const handleRefresh = useCallback(() => {
    refreshPortfolio();
    positions.forEach(pos => {
      fetchPrice(pos.symbol).catch(() => {});
    });
  }, [refreshPortfolio, positions, fetchPrice]);

  const handleQuit = useCallback(() => {
    disconnect();
    exit();
  }, [disconnect, exit]);

  const handleRetry = useCallback(() => {
    setNavStack(['connecting']);
    connect();
  }, [connect]);

  const handleOrderContinue = useCallback(() => {
    setLastOrderResult(null);
    navigateHome();
    refreshPortfolio();
  }, [navigateHome, refreshPortfolio]);

  // Global key handlers
  useInput((input, key) => {
    if (screen === 'error') {
      if (input === 'r') handleRetry();
      if (input === 'q') handleQuit();
    }
    if (screen === 'order-result' && key.return) {
      handleOrderContinue();
    }
  });

  // Render
  return (
    <Box flexDirection="column">
      {/* Breadcrumb - only shown when navigation depth > 1 */}
      {navStack.length > 1 && !['connecting', 'error', 'order-result'].includes(screen) && (
        <Breadcrumb stack={navStack} screenNames={SCREEN_NAMES} />
      )}

      {screen === 'connecting' && (
        <Loading message="Conectando a TWS..." />
      )}

      {screen === 'error' && (
        <ConnectionError
          error={connectionError}
          onRetry={handleRetry}
        />
      )}

      {screen === 'portfolio' && (
        <Portfolio
          positions={positions}
          accountData={accountData}
          computed={computed}
          accountId={accountId}
          prices={prices}
          loading={portfolioLoading}
          pendingOrdersCount={pendingCount}
          onViewChart={handleViewChart}
          onBuy={handleBuy}
          onSearch={handleSearch}
          onActivity={handleActivity}
          onOrders={handleOrders}
          onRefresh={handleRefresh}
          onQuit={handleQuit}
        />
      )}

      {screen === 'chart' && chartSymbol && (
        <ChartScreen
          symbol={chartSymbol}
          position={chartPosition}
          historicalData={getHistoricalData(chartSymbol, chartPeriod)}
          loading={isHistoricalLoading(chartSymbol, chartPeriod)}
          error={getHistoricalError(chartSymbol, chartPeriod)}
          currentPrice={chartPosition?.marketPrice || prices[chartSymbol]?.price}
          onPeriodChange={handleChartPeriodChange}
          onBuy={handleBuy}
          onSell={handleSell}
          onBack={navigateBack}
        />
      )}

      {screen === 'buy' && buySymbol && (() => {
        // Use position marketPrice > realtime price > last historical price
        const positionForBuy = positions.find(p => p.symbol === buySymbol);
        const positionPrice = positionForBuy?.marketPrice;
        const realtimePrice = prices[buySymbol]?.price;
        const historicalData = getHistoricalData(buySymbol, chartPeriod);
        const lastHistoricalPrice = historicalData?.length > 0
          ? historicalData[historicalData.length - 1].close
          : null;
        const displayPrice = positionPrice || realtimePrice || lastHistoricalPrice;
        const isEstimatedPrice = !positionPrice && !realtimePrice && !!lastHistoricalPrice;

        debug('BuyScreen price resolution:', {
          symbol: buySymbol,
          positionPrice,
          realtimePrice,
          historicalDataLength: historicalData?.length || 0,
          lastHistoricalPrice,
          displayPrice,
          isEstimatedPrice,
          priceLoading: isPriceLoading(buySymbol),
        });

        return (
          <BuyScreen
            symbol={buySymbol}
            currentPrice={displayPrice}
            isEstimatedPrice={isEstimatedPrice}
            priceLoading={isPriceLoading(buySymbol) && !displayPrice}
            availableCash={effectiveCash}
            pendingOrdersCount={pendingCount}
            onConfirm={handleConfirmBuy}
            onCancel={navigateBack}
          />
        );
      })()}

      {screen === 'sell' && sellData && (() => {
        // Use position marketPrice > realtime price > last historical price
        const positionForSell = positions.find(p => p.symbol === sellData.symbol);
        const positionPrice = positionForSell?.marketPrice;
        const realtimePrice = prices[sellData.symbol]?.price;
        const historicalData = getHistoricalData(sellData.symbol, chartPeriod);
        const lastHistoricalPrice = historicalData?.length > 0
          ? historicalData[historicalData.length - 1].close
          : null;
        const displayPrice = positionPrice || realtimePrice || lastHistoricalPrice;
        const isEstimatedPrice = !positionPrice && !realtimePrice && !!lastHistoricalPrice;

        debug('SellScreen price resolution:', {
          symbol: sellData.symbol,
          positionPrice,
          realtimePrice,
          historicalDataLength: historicalData?.length || 0,
          lastHistoricalPrice,
          displayPrice,
          isEstimatedPrice,
          priceLoading: isPriceLoading(sellData.symbol),
        });

        return (
          <SellScreen
            symbol={sellData.symbol}
            currentPrice={displayPrice}
            isEstimatedPrice={isEstimatedPrice}
            priceLoading={isPriceLoading(sellData.symbol) && !displayPrice}
            ownedQuantity={sellData.quantity}
            onConfirm={handleConfirmSell}
            onCancel={navigateBack}
          />
        );
      })()}

      {screen === 'search' && (
        <SearchScreen
          onViewChart={handleViewChart}
          onCancel={navigateBack}
        />
      )}

      {screen === 'activity' && (
        <ActivityScreen
          executions={executions}
          loading={executionsLoading}
          onViewChart={handleViewChart}
          onBack={navigateBack}
        />
      )}

      {screen === 'orders' && (() => {
        // Enrich prices with historical fallback for orders screen
        const enrichedPrices = { ...prices };
        pendingOrders.forEach(order => {
          if (!enrichedPrices[order.symbol]?.price) {
            const historicalData = getHistoricalData(order.symbol, chartPeriod);
            if (historicalData?.length > 0) {
              enrichedPrices[order.symbol] = {
                price: historicalData[historicalData.length - 1].close,
                isEstimated: true,
              };
            }
          }
        });

        return (
          <OrdersScreen
            orders={pendingOrders}
            prices={enrichedPrices}
            loading={ordersLoading}
            onViewChart={handleViewChart}
            onCancel={handleOrdersCancel}
            onBack={navigateBack}
          />
        );
      })()}

      {screen === 'order-result' && lastOrderResult && (
        <OrderResult
          result={lastOrderResult}
          onContinue={handleOrderContinue}
        />
      )}

      {orderLoading && (
        <Box marginTop={1} paddingX={1}>
          <Loading message="Enviando orden..." />
        </Box>
      )}
    </Box>
  );
}

export default App;
