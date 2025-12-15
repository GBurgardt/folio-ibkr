import React from 'react';
import { Box, Text } from 'ink';

const shortcuts = {
  portfolio: [
    { key: '↑↓', label: 'Navigate' },
    { key: 'Enter', label: 'Details' },
    { key: 'b', label: 'Buy' },
    { key: '/', label: 'Search' },
    { key: 'g', label: 'Report' },
    { key: 'a', label: 'Activity' },
    { key: 'o', label: 'Orders', showBadge: true },
    { key: 'q', label: 'Quit' },
  ],
  chart: [
    { key: '↑↓', label: 'Period' },
    { key: 'b', label: 'Buy' },
    { key: '←', label: 'Back' },
  ],
  buy: [
    { key: 'Enter', label: 'Confirm' },
    { key: 'Esc', label: 'Cancel' },
  ],
  search: [
    { key: 'Enter', label: 'Select' },
    { key: 'Esc', label: 'Back' },
  ],
  confirm: [
    { key: 'Enter', label: 'Yes' },
    { key: 'Esc', label: 'No' },
  ],
};

export function StatusBar({ screen = 'portfolio', pendingOrdersCount = 0 }) {
  const items = shortcuts[screen] || shortcuts.portfolio;

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      marginTop={1}
    >
      <Box flexDirection="row" gap={2}>
        {items.map((item, i) => (
          <Box key={i} gap={1}>
            <Text color="cyan">[{item.key}]</Text>
            <Text color="gray">{item.label}</Text>
            {item.showBadge && pendingOrdersCount > 0 && (
              <Text color="yellow" bold>({pendingOrdersCount})</Text>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default StatusBar;
