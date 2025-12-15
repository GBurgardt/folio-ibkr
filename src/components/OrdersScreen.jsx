import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { formatMoney, formatFutureTime } from '../utils/format.js';

const debug = (...args) => {
  if (process.argv.includes('--debug')) {
    console.error('[ORDERS-SCREEN]', ...args);
  }
};

/**
 * OrdersScreen - Minimal pending orders view
 *
 * Design:
 *   ▸ +  TSLA   2× ~$350        mañana 9:30
 *     +  GOOG   1× ~$175        mañana 9:30
 *
 *   ← volver          Enter gráfico          c cancelar
 */
export function OrdersScreen({
  orders,
  prices,
  loading,
  onViewChart,
  onCancel,
  onBack,
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  debug('OrdersScreen render:', orders?.length || 0, 'orders, loading:', loading);

  // Handle input
  useInput((input, key) => {
    // Cancel confirmation mode
    if (confirmingCancel) {
      if (key.return) {
        const selectedOrder = orders?.[selectedIndex];
        if (selectedOrder) {
          debug('Confirming cancel for order:', selectedOrder.orderId);
          onCancel?.(selectedOrder.orderId);
        }
        setConfirmingCancel(false);
      } else if (key.escape) {
        setConfirmingCancel(false);
      }
      return;
    }

    // Normal mode
    if (key.escape) {
      debug('Back navigation');
      onBack?.();
    } else if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min((orders?.length || 1) - 1, prev + 1));
    } else if (key.return) {
      const selectedOrder = orders?.[selectedIndex];
      if (selectedOrder) {
        debug('View chart for:', selectedOrder.symbol);
        onViewChart?.(selectedOrder.symbol);
      }
    } else if (input === 'c') {
      if (orders?.length > 0) {
        debug('Initiating cancel for order at index:', selectedIndex);
        setConfirmingCancel(true);
      }
    } else if (input === 'r') {
      debug('Refresh requested');
      // Refresh is handled by parent
    }
  });

  // Empty state
  if (!loading && (!orders || orders.length === 0)) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="gray">No pending orders</Text>
      </Box>
    );
  }

  // Loading state
  if (loading && (!orders || orders.length === 0)) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="gray">Loading orders...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Orders list */}
      <Box flexDirection="column" marginBottom={1}>
        {orders.map((order, index) => (
          <OrderRow
            key={order.orderId}
            order={order}
            price={prices?.[order.symbol]?.price}
            isSelected={index === selectedIndex}
            isConfirmingCancel={confirmingCancel && index === selectedIndex}
          />
        ))}
      </Box>

      {/* Footer */}
      <Box marginTop={1} justifyContent="space-between">
        {confirmingCancel ? (
          <>
            <Box>
              <Text color="red">Enter </Text>
              <Text color="white">confirm cancel</Text>
            </Box>
          </>
        ) : (
          <>
            <Box>
              <Text color="gray">Enter </Text>
              <Text color="white">chart</Text>
            </Box>
            <Box>
              <Text color="gray">c </Text>
              <Text color="white">cancel</Text>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}

/**
 * Single order row
 * Format: ▸ +  TSLA   2× ~$350        mañana 9:30
 */
function OrderRow({ order, price, isSelected, isConfirmingCancel }) {
  const isBuy = order.action === 'BUY';
  const typeSymbol = isBuy ? '+' : '-';
  const typeColor = isBuy ? 'cyan' : 'red';

  // Format quantity and estimated price
  const priceStr = price ? `~${formatMoney(price)}` : '';
  const qtyPrice = price ? `${order.quantity}× ${priceStr}` : `${order.quantity}×`;

  // Format future time
  const timeStr = formatFutureTime(order.status);

  // Determine colors based on state
  const rowColor = isConfirmingCancel ? 'red' : undefined;

  return (
    <Box>
      {/* Selection indicator */}
      <Text color={isSelected ? 'cyan' : 'gray'}>
        {isSelected ? '▸ ' : '  '}
      </Text>

      {/* Type indicator (+/-) */}
      <Text color={isConfirmingCancel ? 'red' : typeColor} bold>
        {typeSymbol}
      </Text>

      {/* Symbol */}
      <Text color={isConfirmingCancel ? 'red' : 'white'} bold>
        {order.symbol.padEnd(6)}
      </Text>

      {/* Quantity × Price */}
      <Text color={isConfirmingCancel ? 'red' : 'gray'}>
        {qtyPrice.padEnd(18)}
      </Text>

      {/* Execution time */}
      <Text color={isConfirmingCancel ? 'red' : 'yellow'}>
        {timeStr}
      </Text>

      {/* Cancel confirmation */}
  {isConfirmingCancel && (
        <Text color="red" dimColor>  ← cancel?</Text>
      )}
    </Box>
  );
}

export default OrdersScreen;
