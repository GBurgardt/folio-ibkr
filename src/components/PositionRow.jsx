import React from 'react';
import { Box, Text } from 'ink';
import { formatMoney, formatPercent, padRight, padLeft } from '../utils/format.js';

export function PositionRow({ position, selected = false, currentPrice = null }) {
  const { symbol, quantity, avgCost, marketValue } = position;

  // Calcular ganancia si tenemos precio actual
  let gain = 0;
  let gainPercent = 0;
  let displayValue = marketValue;

  if (currentPrice && currentPrice > 0) {
    displayValue = quantity * currentPrice;
    gain = displayValue - marketValue;
    gainPercent = marketValue > 0 ? (gain / marketValue) * 100 : 0;
  }

  const isPositive = gain >= 0;
  const gainColor = isPositive ? 'green' : 'red';
  const bgColor = selected ? 'blue' : undefined;
  const textColor = selected ? 'white' : undefined;

  return (
    <Box paddingX={1}>
      <Text backgroundColor={bgColor} color={textColor}>
        {selected ? ' ▸ ' : '   '}
      </Text>
      <Text backgroundColor={bgColor} color={textColor} bold={selected}>
        {padRight(symbol, 6)}
      </Text>
      <Text backgroundColor={bgColor} color="gray">
        {padLeft(String(quantity), 5)} sh
      </Text>
      <Text backgroundColor={bgColor} color={textColor}>
        {'   '}
        {padLeft(formatMoney(displayValue), 12)}
      </Text>
      {currentPrice ? (
        <Text backgroundColor={bgColor} color={gainColor}>
          {'   '}
          {padLeft(formatPercent(gainPercent, true), 8)}
        </Text>
      ) : (
        <Text backgroundColor={bgColor} color="gray">
          {'   '}
          {padLeft('--', 8)}
        </Text>
      )}
    </Box>
  );
}

export function CashRow({ amount, selected = false }) {
  const bgColor = selected ? 'blue' : undefined;
  const textColor = selected ? 'white' : undefined;

  return (
    <Box paddingX={1}>
      <Text backgroundColor={bgColor} color={textColor}>
        {selected ? ' ▸ ' : '   '}
      </Text>
      <Text backgroundColor={bgColor} color="gray">
        {padRight('Cash', 6)}
      </Text>
      <Text backgroundColor={bgColor} color="gray">
        {padLeft('', 9)}
      </Text>
      <Text backgroundColor={bgColor} color={textColor}>
        {'   '}
        {padLeft(formatMoney(amount), 12)}
      </Text>
      <Text backgroundColor={bgColor} color="gray">
        {'   '}
        {padLeft('', 8)}
      </Text>
    </Box>
  );
}

export default PositionRow;
