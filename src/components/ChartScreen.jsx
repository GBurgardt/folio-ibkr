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
  const owned = !!position;

  // Get terminal width for chart sizing
  const terminalWidth = stdout?.columns || 80;
  const chartWidth = Math.min(terminalWidth - 15, 100); // Reduced max, with padding for labels

  debug(`ChartScreen render: symbol=${symbol} period=${selectedPeriod} hasData=${!!historicalData} loading=${loading} currentPrice=${currentPrice}`);

  // Handle period change
  useEffect(() => {
    debug(`Period changed to ${selectedPeriod}, calling onPeriodChange`);
    onPeriodChange?.(selectedPeriod);
  }, [selectedPeriod, onPeriodChange]);

  // Input handling
  useInput((input, key) => {
    if (key.escape || key.leftArrow) {
      debug('Back navigation triggered');
      onBack?.();
    } else if (key.upArrow) {
      // More time (zoom out)
      const currentIndex = PERIOD_KEYS.indexOf(selectedPeriod);
      if (currentIndex < PERIOD_KEYS.length - 1) {
        setSelectedPeriod(PERIOD_KEYS[currentIndex + 1]);
      }
    } else if (key.downArrow) {
      // Less time (zoom in)
      const currentIndex = PERIOD_KEYS.indexOf(selectedPeriod);
      if (currentIndex > 0) {
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

  // Process data for chart
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

  // Render chart
  const chartRender = useMemo(() => {
    if (!chartData) return null;

    const isPositive = chartData.change >= 0;
    const color = isPositive ? asciichart.green : asciichart.red;

    try {
      const chart = asciichart.plot(chartData.prices, {
        height: 12, // Slightly taller for better detail
        colors: [color],
        format: (x) => formatMoney(x).padStart(10),
      });

      debug('Chart rendered successfully');
      return chart;
    } catch (err) {
      debug('Chart render error:', err.message);
      return null;
    }
  }, [chartData]);

  // Generate X axis
  const xAxisData = useMemo(() => {
    return generateXAxisLabels(historicalData, chartWidth, selectedPeriod);
  }, [historicalData, chartWidth, selectedPeriod]);

  // Calculate gain/loss from purchase price
  const positionGain = useMemo(() => {
    if (!avgCost || !currentPrice || !quantity) return null;
    const totalCost = avgCost * quantity;
    const currentValue = currentPrice * quantity;
    const gain = currentValue - totalCost;
    const gainPercent = totalCost > 0 ? (gain / totalCost) * 100 : 0;
    return { gain, gainPercent, currentValue, totalCost };
  }, [avgCost, currentPrice, quantity]);

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
        <Box marginTop={1}>
          <Text color="gray">← volver</Text>
        </Box>
      </Box>
    );
  }

  // No data state
  if (!chartData || !chartRender) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="white">{symbol}</Text>
        <Box marginTop={1}>
          <Text color="gray">Sin datos históricos</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">← volver</Text>
        </Box>
      </Box>
    );
  }

  const isPositive = chartData.change >= 0;
  const changeColor = isPositive ? 'green' : 'red';
  const changeArrow = isPositive ? '▲' : '▼';

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header: Symbol on left, Price + Change on right */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="white">{symbol}</Text>
        <Box>
          <Text bold color="white">{formatMoney(displayPrice)}</Text>
          <Text color={changeColor}> {changeArrow} {formatPercent(Math.abs(chartData.changePercent))}</Text>
        </Box>
      </Box>

      {/* Chart - no border, clean */}
      <Box flexDirection="column">
        <Text>{chartRender}</Text>

        {/* X Axis with dates */}
        <Text color="gray">{xAxisData.axisLine}</Text>
      </Box>

      {/* Position info - only if user owns the stock, clean format */}
      {owned && positionGain && (
        <Box marginTop={1}>
          <Text color="gray">{quantity} × </Text>
          <Text color="white">{formatMoney(avgCost)}</Text>
          <Text color="gray">  →  </Text>
          <Text color={positionGain.gain >= 0 ? 'green' : 'red'}>
            {positionGain.gain >= 0 ? '+' : ''}{formatMoney(positionGain.gain)} ({positionGain.gain >= 0 ? '+' : ''}{formatPercent(positionGain.gainPercent)})
          </Text>
        </Box>
      )}

      {/* Footer: Period on left, Actions on right - subtle */}
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
          <Text color="gray">   ← </Text>
          <Text color="white">volver</Text>
        </Box>
      </Box>
    </Box>
  );
}

export default ChartScreen;
