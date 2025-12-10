import { useState, useCallback, useEffect, useRef } from 'react';

const debug = (...args) => {
  if (process.argv.includes('--debug')) {
    console.error('[ORDERS]', ...args);
  }
};

/**
 * Hook to manage open/pending orders from IB
 *
 * Provides real-time order tracking with:
 * - Initial load of all open orders
 * - Real-time updates via orderStatus events
 * - Cancel order functionality
 */
export function useOrders(getClient, isConnected) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const subscribedRef = useRef(false);
  const ordersMapRef = useRef(new Map());

  // Subscribe to order events
  useEffect(() => {
    if (!isConnected || subscribedRef.current) return;

    const client = getClient();
    if (!client) return;

    debug('Subscribing to order events');
    subscribedRef.current = true;

    // Handler for open orders
    const onOpenOrder = (orderId, contract, order, orderState) => {
      debug('openOrder event:', { orderId, symbol: contract.symbol, action: order.action, status: orderState.status });

      const orderData = {
        orderId,
        symbol: contract.symbol,
        action: order.action, // BUY or SELL
        quantity: order.totalQuantity,
        orderType: order.orderType,
        status: orderState.status,
        filled: orderState.filled || 0,
        remaining: orderState.remaining || order.totalQuantity,
        avgFillPrice: orderState.avgFillPrice || 0,
        lastUpdate: Date.now(),
      };

      ordersMapRef.current.set(orderId, orderData);
      updateOrdersState();
    };

    // Handler for order status updates
    const onOrderStatus = (orderId, status, filled, remaining, avgFillPrice) => {
      debug('orderStatus event:', { orderId, status, filled, remaining, avgFillPrice });

      const existing = ordersMapRef.current.get(orderId);
      if (existing) {
        existing.status = status;
        existing.filled = filled;
        existing.remaining = remaining;
        existing.avgFillPrice = avgFillPrice;
        existing.lastUpdate = Date.now();
        ordersMapRef.current.set(orderId, existing);
        updateOrdersState();
      }
    };

    // Handler for when open orders list is complete
    const onOpenOrderEnd = () => {
      debug('openOrderEnd - all orders received');
      setLoading(false);
    };

    const updateOrdersState = () => {
      // Convert map to array, filter only pending orders
      const pendingStatuses = new Set(['PendingSubmit', 'PreSubmitted', 'Submitted']);
      const ordersArray = Array.from(ordersMapRef.current.values())
        .filter(o => pendingStatuses.has(o.status))
        .sort((a, b) => b.lastUpdate - a.lastUpdate); // Most recent first

      debug('Updating orders state:', ordersArray.length, 'pending orders');
      setOrders(ordersArray);
    };

    client.on('openOrder', onOpenOrder);
    client.on('orderStatus', onOrderStatus);
    client.on('openOrderEnd', onOpenOrderEnd);

    // Request all open orders
    debug('Requesting all open orders');
    setLoading(true);
    client.reqAllOpenOrders();

    return () => {
      debug('Unsubscribing from order events');
      client.removeListener('openOrder', onOpenOrder);
      client.removeListener('orderStatus', onOrderStatus);
      client.removeListener('openOrderEnd', onOpenOrderEnd);
      subscribedRef.current = false;
    };
  }, [isConnected, getClient]);

  // Refresh orders manually
  const refresh = useCallback(() => {
    const client = getClient();
    if (!client || !isConnected) return;

    debug('Refreshing orders');
    setLoading(true);
    ordersMapRef.current.clear();
    client.reqAllOpenOrders();
  }, [getClient, isConnected]);

  // Cancel an order
  const cancelOrder = useCallback((orderId) => {
    return new Promise((resolve, reject) => {
      const client = getClient();
      if (!client || !isConnected) {
        reject(new Error('No conectado'));
        return;
      }

      debug('Cancelling order:', orderId);

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout cancelando orden'));
      }, 10000);

      const onOrderStatus = (id, status) => {
        if (id !== orderId) return;

        if (status === 'Cancelled') {
          debug('Order cancelled successfully:', orderId);
          cleanup();

          // Remove from local state
          ordersMapRef.current.delete(orderId);
          setOrders(prev => prev.filter(o => o.orderId !== orderId));

          resolve({ orderId, status: 'Cancelled' });
        }
      };

      const onError = (err, data) => {
        if (data?.id === orderId) {
          cleanup();
          reject(new Error(err?.message || 'Error cancelando orden'));
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        client.removeListener('orderStatus', onOrderStatus);
        client.removeListener('error', onError);
      };

      client.on('orderStatus', onOrderStatus);
      client.on('error', onError);
      client.cancelOrder(orderId);
    });
  }, [getClient, isConnected]);

  // Get pending orders count
  const pendingCount = orders.length;

  return {
    orders,
    loading,
    error,
    refresh,
    cancelOrder,
    pendingCount,
  };
}

export default useOrders;
