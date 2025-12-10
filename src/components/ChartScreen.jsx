import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import asciichart from 'asciichart';
import { formatMoney, formatPercent } from '../utils/format.js';
import { PERIODS, PERIOD_KEYS, DEFAULT_PERIOD } from '../hooks/useHistoricalData.js';

const debug = (...args) => {
  if (process.argv.includes('--debug')) {
    console.error('[CHART-SCREEN]', ...args);
  }
};

/**
 * Parse date from IB format to readable format
 * IB sends dates like "20231215" for daily bars or "20231215 14:30:00" for hourly
 */
const parseIBDate = (dateStr) => {
  if (!dateStr) return null;

  // Handle "yyyyMMdd HH:mm:ss" format (hourly bars)
  if (dateStr.includes(' ')) {
    const [datePart, timePart] = dateStr.split(' ');
    const year = parseInt(datePart.slice(0, 4));
    const month = parseInt(datePart.slice(4, 6)) - 1;
    const day = parseInt(datePart.slice(6, 8));
    const [hours, minutes] = timePart.split(':').map(Number);
    return new Date(year, month, day, hours, minutes);
  }

  // Handle "yyyyMMdd" format (daily bars)
  const year = parseInt(dateStr.slice(0, 4));
  const month = parseInt(dateStr.slice(4, 6)) - 1;
  const day = parseInt(dateStr.slice(6, 8));
  return new Date(year, month, day);
};

/**
 * Format date for X axis based on period
 */
const formatDateForAxis = (date, period) => {
  if (!date) return '';

  const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  switch (period) {
    case '1W':
      // For 1 week: show day name (Lun, Mar, etc)
      return days[date.getDay()];
    case '1M':
      // For 1 month: show day number
      return `${date.getDate()}`;
    case '3M':
    case '6M':
      // For 3-6 months: show "day mon" (15 Dic)
      return `${date.getDate()} ${months[date.getMonth()]}`;
    case '1Y':
      // For 1 year: show month name
      return months[date.getMonth()];
    default:
      return `${date.getDate()}/${date.getMonth() + 1}`;
  }
};

/**
 * Generate X axis labels for the chart
 * Returns object with axis line and first/last date for context
 */
const generateXAxisLabels = (historicalData, chartWidth, period) => {
  if (!historicalData || historicalData.length === 0) return { axisLine: '', firstDate: null, lastDate: null };

  const dates = historicalData.map(bar => parseIBDate(bar.date));
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  // Sample dates to fit chart width
  let sampledDates = dates;
  if (dates.length > chartWidth) {
    const step = dates.length / chartWidth;
    sampledDates = [];
    for (let i = 0; i < chartWidth; i++) {
      const index = Math.min(Math.floor(i * step), dates.length - 1);
      sampledDates.push(dates[index]);
    }
  }

  // Show just first, middle, and last date for cleaner look
  const numLabels = 3;
  const labelPositions = [];

  for (let i = 0; i < numLabels; i++) {
    const dataIndex = Math.floor((i / (numLabels - 1)) * (sampledDates.length - 1));
    const charPosition = Math.floor((i / (numLabels - 1)) * chartWidth);
    labelPositions.push({
      position: charPosition,
      date: sampledDates[dataIndex],
    });
  }

  // Build the axis string
  // Y axis padding: "$XXX.XX" padStart(10) + " ┤" = ~11 chars
  const yAxisPadding = 11;

  // Create array of spaces for the axis
  const axisChars = new Array(chartWidth + yAxisPadding).fill(' ');

  // Place labels
  for (let i = 0; i < labelPositions.length; i++) {
    const label = labelPositions[i];
    const labelText = formatDateForAxis(label.date, period);
    const startPos = yAxisPadding + label.position;

    // Center the label on the position (except first and last)
    let adjustedStart = startPos;
    if (i === 0) {
      adjustedStart = yAxisPadding; // First label at start
    } else if (i === labelPositions.length - 1) {
      adjustedStart = Math.max(yAxisPadding, startPos - labelText.length); // Last label at end
    } else {
      adjustedStart = Math.max(yAxisPadding, startPos - Math.floor(labelText.length / 2)); // Center
    }

    // Place label characters
    for (let j = 0; j < labelText.length && adjustedStart + j < axisChars.length; j++) {
      axisChars[adjustedStart + j] = labelText[j];
    }
  }

  return {
    axisLine: axisChars.join(''),
    firstDate,
    lastDate,
  };
};

export function ChartScreen({
  symbol,
  position, // Optional - only if user owns the stock
  historicalData,
  loading,
  error,
  currentPrice,
  onPeriodChange,
  onBuy,
  onSell,
  onBack,
}) {
  const [selectedPeriod, setSelectedPeriod] = useState(DEFAULT_PERIOD);
  const { stdout } = useStdout();

  // Extract data from position if available
  const avgCost = position?.avgCost;
  const quantity = position?.quantity;
  const owned = !!position && avgCost > 0;

  // Get terminal width for chart sizing
  const terminalWidth = stdout?.columns || 80;
  const chartWidth = Math.min(terminalWidth - 15, 100);

  debug(`ChartScreen render: symbol=${symbol} owned=${owned} period=${selectedPeriod}`);

  // Handle period change - ALWAYS (unified behavior)
  useEffect(() => {
    debug(`Period changed to ${selectedPeriod}, calling onPeriodChange`);
    onPeriodChange?.(selectedPeriod);
  }, [selectedPeriod, onPeriodChange]);

  // Input handling - UNIFIED (no toggle, arrows always work)
  useInput((input, key) => {
    if (key.escape) {
      debug('Back navigation triggered');
      onBack?.();
    } else if (key.upArrow) {
      // More time (zoom out)
      const currentIndex = PERIOD_KEYS.indexOf(selectedPeriod);
      if (currentIndex < PERIOD_KEYS.length - 1) {
        debug(`Period up: ${selectedPeriod} -> ${PERIOD_KEYS[currentIndex + 1]}`);
        setSelectedPeriod(PERIOD_KEYS[currentIndex + 1]);
      }
    } else if (key.downArrow) {
      // Less time (zoom in)
      const currentIndex = PERIOD_KEYS.indexOf(selectedPeriod);
      if (currentIndex > 0) {
        debug(`Period down: ${selectedPeriod} -> ${PERIOD_KEYS[currentIndex - 1]}`);
        setSelectedPeriod(PERIOD_KEYS[currentIndex - 1]);
      }
    } else if (input === 'b') {
      debug('Buy triggered for', symbol);
      onBuy?.(symbol);
    } else if (input === 's' && owned) {
      debug('Sell triggered for', symbol);
      onSell?.(symbol, quantity);
    }
  });

  // Process data for price chart
  const chartData = useMemo(() => {
    if (!historicalData || historicalData.length === 0) {
      debug('No historical data available');
      return null;
    }

    const closes = historicalData.map(bar => bar.close);

    // Resample if needed to fit terminal width
    let sampledData = closes;
    if (closes.length > chartWidth) {
      const step = closes.length / chartWidth;
      sampledData = [];
      for (let i = 0; i < chartWidth; i++) {
        const index = Math.min(Math.floor(i * step), closes.length - 1);
        sampledData.push(closes[index]);
      }
    }

    // Add current price as last point if available
    if (currentPrice && sampledData.length > 0) {
      sampledData[sampledData.length - 1] = currentPrice;
    }

    const min = Math.min(...sampledData);
    const max = Math.max(...sampledData);
    const first = sampledData[0];
    const last = sampledData[sampledData.length - 1];
    const change = last - first;
    const changePercent = first > 0 ? (change / first) * 100 : 0;

    debug(`Chart data: ${sampledData.length} points, min=${min}, max=${max}, change=${changePercent.toFixed(2)}%`);

    return {
      prices: sampledData,
      min,
      max,
      first,
      last,
      change,
      changePercent,
    };
  }, [historicalData, currentPrice, chartWidth]);

  // Render price chart
  // Color based on: if owned -> gain/loss from purchase, else -> period change
  const chartRender = useMemo(() => {
    if (!chartData) return null;

    // Determine chart color based on ownership
    let isChartPositive;
    if (owned && avgCost && chartData.last) {
      // Owned: color based on gain from purchase
      isChartPositive = chartData.last >= avgCost;
    } else {
      // Not owned: color based on period change
      isChartPositive = chartData.change >= 0;
    }
    const color = isChartPositive ? asciichart.green : asciichart.red;

    try {
      const chart = asciichart.plot(chartData.prices, {
        height: 12,
        colors: [color],
        format: (x) => formatMoney(x).padStart(10),
      });

      debug(`Chart rendered: positive=${isChartPositive}, owned=${owned}`);
      return chart;
    } catch (err) {
      debug('Chart render error:', err.message);
      return null;
    }
  }, [chartData, owned, avgCost]);

  // Generate X axis
  const xAxisData = useMemo(() => {
    return generateXAxisLabels(historicalData, chartWidth, selectedPeriod);
  }, [historicalData, chartWidth, selectedPeriod]);

  // Display price - prefer currentPrice, fallback to last historical
  const displayPrice = currentPrice || chartData?.last;

  // Loading state - minimal
  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box justifyContent="space-between">
          <Text bold color="white">{symbol}</Text>
          <Text color="gray">cargando...</Text>
        </Box>
      </Box>
    );
  }

  // Error state - minimal
  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="white">{symbol}</Text>
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      </Box>
    );
  }

  // No data state
  if (!historicalData || historicalData.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="white">{symbol}</Text>
        <Box marginTop={1}>
          <Text color="gray">Sin datos</Text>
        </Box>
      </Box>
    );
  }

  // No chart data
  if (!chartData || !chartRender) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="white">{symbol}</Text>
        <Box marginTop={1}>
          <Text color="gray">Sin datos históricos</Text>
        </Box>
      </Box>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // UNIFIED CHART VIEW
  // - If owned: header shows total gain from purchase, includes buy line
  // - If not owned: header shows period change
  // - Arrows ↑↓ ALWAYS change period
  // ═══════════════════════════════════════════════════════════════

  // Calculate gain if owned
  let totalGain = 0;
  let totalGainPercent = 0;
  if (owned && displayPrice && avgCost) {
    totalGain = (displayPrice - avgCost) * quantity;
    totalGainPercent = ((displayPrice - avgCost) / avgCost) * 100;
    debug(`Owner gain: $${totalGain.toFixed(2)} (${totalGainPercent.toFixed(2)}%)`);
  }

  // Determine colors and display values based on ownership
  const isPositive = owned ? totalGain >= 0 : chartData.change >= 0;
  const displayColor = isPositive ? 'green' : 'red';
  const displayArrow = isPositive ? '▲' : '▼';
  const displaySign = isPositive ? '+' : '';

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header: Symbol on left, Gain/Change on right */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="white">{symbol}</Text>
        <Box>
          {owned ? (
            // Show total gain from purchase
            <Text color={displayColor} bold>
              {displaySign}{formatMoney(totalGain)} {displayArrow} {formatPercent(Math.abs(totalGainPercent))}
            </Text>
          ) : (
            // Show period change
            <>
              <Text bold color="white">{formatMoney(displayPrice)}</Text>
              <Text color={displayColor}> {displayArrow} {formatPercent(Math.abs(chartData.changePercent))}</Text>
            </>
          )}
        </Box>
      </Box>

      {/* Chart */}
      <Box flexDirection="column">
        <Text>{chartRender}</Text>

        {/* Purchase price reference line - only if owned */}
        {owned && avgCost && (
          <Box>
            <Text color="gray">{'─'.repeat(8)}</Text>
            <Text color="yellow"> compra {formatMoney(avgCost)} </Text>
            <Text color="gray">{'─'.repeat(Math.max(0, chartWidth - 25))}</Text>
          </Box>
        )}

        {/* X Axis with dates */}
        <Text color="gray">{xAxisData.axisLine}</Text>
      </Box>

      {/* Footer: Period on left, Actions on right */}
      <Box marginTop={1} justifyContent="space-between">
        <Box>
          <Text color="white">{PERIODS[selectedPeriod].label}</Text>
          <Text color="gray">  ↑↓</Text>
        </Box>
        <Box>
          <Text color="gray">b </Text>
          <Text color="white">comprar</Text>
          {owned && (
            <>
              <Text color="gray">   s </Text>
              <Text color="white">vender</Text>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default ChartScreen;
