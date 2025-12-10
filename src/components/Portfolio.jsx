import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import Header from './Header.jsx';
import { PositionRow, CashRow } from './PositionRow.jsx';
import StatusBar from './StatusBar.jsx';

export function Portfolio({
  positions,
  accountData,
  computed,
  accountId,
  prices,
  loading,
  pendingOrdersCount = 0,
  onViewChart,
  onBuy,
  onSearch,
  onActivity,
  onOrders,
  onRefresh,
  onQuit,
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Total items: positions + cash row
  const totalItems = positions.length + 1;

  useInput((input, key) => {
    if (loading) return;

    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min(totalItems - 1, prev + 1));
    } else if (key.return) {
      // Enter on a position -> go directly to chart
      if (selectedIndex < positions.length) {
        onViewChart?.(positions[selectedIndex]);
      }
    } else if (input === 'b') {
      // Buy - if on position, buy that symbol; otherwise search
      if (selectedIndex < positions.length) {
        onBuy?.(positions[selectedIndex].symbol);
      } else {
        onSearch?.();
      }
    } else if (input === '/') {
      onSearch?.();
    } else if (input === 'a') {
      onActivity?.();
    } else if (input === 'o') {
      onOrders?.();
    } else if (input === 'r') {
      onRefresh?.();
    } else if (input === 'q') {
      onQuit?.();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header con totales */}
      <Box
        borderStyle="round"
        borderColor="blue"
        flexDirection="column"
      >
        <Header
          netLiquidation={accountData.netLiquidation}
          totalGain={computed.totalGain}
          gainPercent={computed.gainPercent}
          accountId={accountId}
        />
      </Box>

      {/* Lista de posiciones */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        marginTop={1}
        paddingY={1}
      >
        {positions.length === 0 ? (
          <Box paddingX={1}>
            <Text color="gray">No tenés posiciones abiertas</Text>
          </Box>
        ) : (
          positions.map((position, index) => (
            <PositionRow
              key={position.symbol}
              position={position}
              selected={selectedIndex === index}
              currentPrice={position.marketPrice || prices[position.symbol]?.price}
            />
          ))
        )}

        {/* Cash row */}
        <Box marginTop={1}>
          <CashRow
            amount={computed.cash}
            selected={selectedIndex === positions.length}
          />
        </Box>
      </Box>

      {/* Status bar */}
      <StatusBar screen="portfolio" pendingOrdersCount={pendingOrdersCount} />

      {loading && (
        <Box marginTop={1}>
          <Text color="yellow">Actualizando...</Text>
        </Box>
      )}
    </Box>
  );
}

export default Portfolio;
