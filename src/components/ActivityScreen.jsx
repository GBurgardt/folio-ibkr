import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

const debug = (...args) => {
  if (process.argv.includes('--debug')) {
    console.error('[ACTIVITY-SCREEN]', ...args);
  }
};

/**
 * Parse IB execution time to Date object
 * Format: "YYYYMMDD HH:MM:SS" or "YYYYMMDD  HH:MM:SS" (double space)
 */
const parseExecutionTime = (timeStr) => {
  if (!timeStr) return null;

  // Handle both single and double space between date and time
  const normalized = timeStr.replace(/\s+/g, ' ').trim();
  const [datePart, timePart] = normalized.split(' ');

  if (!datePart || datePart.length !== 8) return null;

  const year = parseInt(datePart.slice(0, 4), 10);
  const month = parseInt(datePart.slice(4, 6), 10) - 1;
  const day = parseInt(datePart.slice(6, 8), 10);

  let hours = 0, minutes = 0;
  if (timePart) {
    const [h, m] = timePart.split(':');
    hours = parseInt(h, 10) || 0;
    minutes = parseInt(m, 10) || 0;
  }

  return new Date(year, month, day, hours, minutes);
};

/**
 * Format execution time for display
 * - Today: "14:30"
 * - Yesterday: "yesterday"
 * - This week: "mon", "tue", etc.
 * - Older: "5 dec"
 */
const formatExecutionTime = (timeStr) => {
  const date = parseExecutionTime(timeStr);
  if (!date) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  // Today: show time
  if (date >= today) {
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${mins}`;
  }

  // Yesterday
  if (date >= yesterday) {
    return 'yesterday';
  }

  // Within last week: show day name
  if (date >= weekAgo) {
    return days[date.getDay()];
  }

  // Older: show "day month"
  return `${date.getDate()} ${months[date.getMonth()]}`;
};

/**
 * Format money for display
 */
const formatMoney = (value) => {
  if (value === null || value === undefined) return '';
  return `$${value.toFixed(2)}`;
};

/**
 * ActivityScreen - Execution history from IB
 *
 * Design: Minimal log of trades
 * - One line per execution
 * - + green for buys, - red for sells
 * - Symbol, quantity × price, time
 * - Navigate with arrows, Enter to view chart, Esc to go back
 */
export function ActivityScreen({
  executions,
  loading,
  onViewChart,
  onBack,
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  debug(`ActivityScreen render: ${executions?.length || 0} executions, loading=${loading}`);

  // Handle input
  useInput((input, key) => {
    if (key.escape) {
      debug('Back navigation triggered');
      onBack?.();
    } else if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min((executions?.length || 1) - 1, prev + 1));
    } else if (key.return) {
      const selected = executions?.[selectedIndex];
      if (selected) {
        debug('View chart for:', selected.symbol);
        onViewChart?.(selected.symbol);
      }
    }
  });

  // Loading state
  if (loading && (!executions || executions.length === 0)) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="gray">loading...</Text>
      </Box>
    );
  }

  // Empty state
  if (!executions || executions.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="gray">No activity today</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Execution list */}
      <Box flexDirection="column">
        {executions.map((exec, index) => (
          <ExecutionRow
            key={exec.id || index}
            execution={exec}
            isSelected={index === selectedIndex}
          />
        ))}
      </Box>
    </Box>
  );
}

/**
 * Single execution row
 * Format: ▸ +  GOOG    19 × $174.23      14:30
 */
function ExecutionRow({ execution, isSelected }) {
  const isBuy = execution.side === 'BOT';
  const typeSymbol = isBuy ? '+' : '-';
  const typeColor = isBuy ? 'green' : 'red';

  const quantityPrice = `${execution.quantity} × ${formatMoney(execution.price)}`;
  const timeText = formatExecutionTime(execution.time);

  return (
    <Box>
      {/* Selection indicator */}
      <Text color={isSelected ? 'cyan' : 'gray'}>{isSelected ? '▸ ' : '  '}</Text>

      {/* Type indicator (+/-) */}
      <Text color={typeColor} bold>{typeSymbol}  </Text>

      {/* Symbol */}
      <Text color="white" bold>{execution.symbol.padEnd(6)}</Text>

      {/* Quantity × Price */}
      <Text color="gray">{quantityPrice.padEnd(20)}</Text>

      {/* Time */}
      <Text color="gray">{timeText}</Text>
    </Box>
  );
}

export default ActivityScreen;
