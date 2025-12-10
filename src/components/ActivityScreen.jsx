import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { formatMoney, formatPercent, formatRelativeTime } from '../utils/format.js';

const debug = (...args) => {
  if (process.argv.includes('--debug')) {
    console.error('[ACTIVITY-SCREEN]', ...args);
  }
};

/**
 * ActivityScreen - Minimal, zen-like trade history view
 *
 * Design principles:
 * - One line per trade
 * - + green for buys, - red for sells
 * - Symbol, quantity × price, gain/loss, relative time
 * - No borders, no filters, no pagination
 * - Navigate with arrows, Enter to view chart, ← to go back
 */
export function ActivityScreen({
  trades,
  prices, // Map of symbol -> currentPrice for calculating performance
  calculateBuyPerformance,
  calculateSellPerformance,
  onViewChart,
  onBack,
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  debug(`ActivityScreen render: ${trades?.length || 0} trades`);

  // Handle input
  useInput((input, key) => {
    if (key.escape) {
      debug('Back navigation triggered');
      onBack?.();
    } else if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min((trades?.length || 1) - 1, prev + 1));
    } else if (key.return) {
      const selectedTrade = trades?.[selectedIndex];
      if (selectedTrade) {
        debug('View chart for:', selectedTrade.symbol);
        onViewChart?.(selectedTrade.symbol);
      }
    }
  });

  // Calculate performance for each trade
  const tradesWithPerformance = useMemo(() => {
    if (!trades) return [];

    return trades.map(trade => {
      let performance = { gain: 0, gainPercent: 0 };

      if (trade.type === 'BUY') {
        const priceData = prices?.[trade.symbol];
        const currentPrice = priceData?.price;
        if (currentPrice) {
          performance = calculateBuyPerformance(trade, currentPrice);
        }
      } else if (trade.type === 'SELL') {
        performance = calculateSellPerformance(trade);
      }

      return { ...trade, performance };
    });
  }, [trades, prices, calculateBuyPerformance, calculateSellPerformance]);

  // Empty state
  if (!trades || trades.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="gray">Sin movimientos aún</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Trade list */}
      <Box flexDirection="column" marginBottom={1}>
        {tradesWithPerformance.map((trade, index) => (
          <TradeRow
            key={trade.id}
            trade={trade}
            isSelected={index === selectedIndex}
          />
        ))}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray">Enter </Text>
        <Text color="white">ver gráfico</Text>
      </Box>
    </Box>
  );
}

/**
 * Single trade row component
 * Format: +  GOOG   19 × $174               +$2,687 (+81%)      hace 3 días
 */
function TradeRow({ trade, isSelected }) {
  const isBuy = trade.type === 'BUY';
  const typeSymbol = isBuy ? '+' : '-';
  const typeColor = isBuy ? 'green' : 'red';

  const { gain, gainPercent } = trade.performance;
  const hasPerformance = gain !== 0 || gainPercent !== 0;
  const isPositiveGain = gain >= 0;
  const gainColor = isPositiveGain ? 'green' : 'red';

  // Format the trade info
  const quantityPrice = `${trade.quantity} × ${formatMoney(trade.price)}`;
  const gainText = hasPerformance
    ? `${isPositiveGain ? '+' : ''}${formatMoney(gain)} (${isPositiveGain ? '+' : ''}${formatPercent(gainPercent)})`
    : '';
  const timeText = formatRelativeTime(trade.timestamp);

  return (
    <Box>
      {/* Selection indicator */}
      <Text color={isSelected ? 'cyan' : 'gray'}>{isSelected ? '▸ ' : '  '}</Text>

      {/* Type indicator (+/-) */}
      <Text color={typeColor} bold>{typeSymbol}  </Text>

      {/* Symbol */}
      <Text color="white" bold>{trade.symbol.padEnd(6)}</Text>

      {/* Quantity × Price */}
      <Text color="gray">{quantityPrice.padEnd(18)}</Text>

      {/* Gain/Loss */}
      {hasPerformance ? (
        <Text color={gainColor}>{gainText.padEnd(22)}</Text>
      ) : (
        <Text color="gray">{' '.repeat(22)}</Text>
      )}

      {/* Relative time */}
      <Text color="gray">{timeText}</Text>
    </Box>
  );
}

export default ActivityScreen;
