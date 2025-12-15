import React from 'react';
import { Box, Text } from 'ink';
import { formatMoney, formatPercent } from '../utils/format.js';

export function Header({ netLiquidation, totalGain, gainPercent, accountId }) {
  const isPositive = totalGain >= 0;
  const gainColor = isPositive ? 'green' : 'red';
  const arrow = isPositive ? '↑' : '↓';

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexDirection="column">
          <Text bold color="white" dimColor={false}>
            {formatMoney(netLiquidation)}
          </Text>
          <Text color="gray">Total Portfolio</Text>
        </Box>

        <Box flexDirection="column" alignItems="flex-end">
          <Text bold color={gainColor}>
            {arrow} {formatMoney(Math.abs(totalGain), false)}  {formatPercent(gainPercent, true)}
          </Text>
          <Text color="gray" dimColor>
            {accountId || 'Account'}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

export default Header;
