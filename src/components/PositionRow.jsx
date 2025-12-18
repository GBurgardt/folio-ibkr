import React from 'react';
import { Box, Text } from 'ink';
import { formatMoney, formatPercent, padRight, padLeft } from '../utils/format.js';

export function PositionRow({ position, selected = false, currentPrice = null }) {
  const { symbol, quantity, avgCost, marketValue } = position;

  const qty = Number(quantity);
  const price = Number(currentPrice);
  const cost = Number(avgCost);

  const hasQty = Number.isFinite(qty) && qty !== 0;
  const hasPrice = Number.isFinite(price) && price > 0;
  const hasAvgCost = Number.isFinite(cost) && cost > 0;
  const canComputePercent = hasQty && hasPrice && hasAvgCost;

  // Display value: prefer live price when available.
  let displayValue = marketValue;
  if (hasQty && hasPrice) {
    displayValue = qty * price;
  }

  // Gain/loss vs cost basis: (currentPrice - avgCost) / avgCost
  let gain = 0;
  let gainPercent = null;
  if (canComputePercent) {
    const costBasis = qty * cost;
    const denom = Math.abs(costBasis);
    gain = (price - cost) * qty;
    gainPercent = denom > 0 ? (gain / denom) * 100 : 0;
  }

  const isPositive = gain >= 0;
  const gainColor = gainPercent === null ? 'gray' : (isPositive ? 'green' : 'red');
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
      {gainPercent === null ? (
        <Text backgroundColor={bgColor} color="gray">
          {'   '}
          {padLeft('--', 8)}
        </Text>
      ) : (
        <Text backgroundColor={bgColor} color={gainColor}>
          {'   '}
          {padLeft(formatPercent(gainPercent, true), 8)}
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
