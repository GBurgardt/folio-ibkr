import React from 'react';
import { Box, Text } from 'ink';

/**
 * Breadcrumb component - shows navigation path
 *
 * Design: Subtle, gray, only shown when depth > 1
 *
 * Example: inicio › órdenes › gráfico
 */
export function Breadcrumb({ stack, screenNames }) {
  // Don't render if stack is too shallow
  if (!stack || stack.length <= 1) {
    return null;
  }

  // Build the breadcrumb path
  const path = stack.map(screen => screenNames[screen] || screen);

  return (
    <Box paddingX={1} marginBottom={0}>
      <Text color="gray" dimColor>
        {path.join(' › ')}
      </Text>
    </Box>
  );
}

export default Breadcrumb;
