import React, { useMemo, useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import asciichart from 'asciichart';
import { formatMoney, formatPercent } from '../utils/format.js';
import { resampleLinear } from '../utils/resample.js';

const debug = (...args) => {
  if (process.argv.includes('--debug')) {
    console.error('[PORTFOLIO-REPORT]', ...args);
  }
};

const PORTFOLIO_PERIODS = {
  '1M': { kind: 'months', n: 1, label: '1 mes' },
  '6M': { kind: 'months', n: 6, label: '6 meses' },
  '1Y': { kind: 'years', n: 1, label: '1 año' },
  'ALL': { kind: 'all', n: null, label: 'desde inicio' },
};
// Small -> big (↓ zoom in, ↑ zoom out)
const PORTFOLIO_PERIOD_KEYS = ['1M', '6M', '1Y', 'ALL'];
const DEFAULT_PERIOD = 'ALL';

// Keep y-axis padding consistent with asciichart formatting:
// formatMoney(...).padStart(10) => 10 chars, plus a space before plot = ~11
const Y_AXIS_PADDING = 11;

/**
 * Parse IB execution time to Date object
 * Format: "YYYYMMDD HH:MM:SS" or "YYYYMMDD  HH:MM:SS" (double space)
 */
function parseExecutionTime(timeStr) {
  if (!timeStr) return null;
  const normalized = timeStr.replace(/\s+/g, ' ').trim();
  const [datePart, timePart] = normalized.split(' ');
  if (!datePart || datePart.length !== 8) return null;

  const year = parseInt(datePart.slice(0, 4), 10);
  const month = parseInt(datePart.slice(4, 6), 10) - 1;
  const day = parseInt(datePart.slice(6, 8), 10);

  let hours = 0;
  let minutes = 0;
  if (timePart) {
    const [h, m] = timePart.split(':');
    hours = parseInt(h, 10) || 0;
    minutes = parseInt(m, 10) || 0;
  }

  return new Date(year, month, day, hours, minutes);
}

function formatDateForAxis(date, periodKey, startTs, endTs) {
  if (!date) return '';
  const rangeMs = Math.max(0, endTs - startTs);

  // Short ranges: show time, longer: show day/month.
  if (rangeMs <= 6 * 60 * 60 * 1000) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  if (rangeMs <= 24 * 60 * 60 * 1000) {
    const h = String(date.getHours()).padStart(2, '0');
    return `${date.getDate()}/${date.getMonth() + 1} ${h}h`;
  }

  if (rangeMs >= 2 * 365 * 24 * 60 * 60 * 1000) {
    return String(date.getFullYear());
  }

  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const y = String(date.getFullYear()).slice(-2);
  if (rangeMs >= 120 * 24 * 60 * 60 * 1000) {
    return `${months[date.getMonth()]} '${y}`;
  }
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

function generateXAxisLabels(dates, chartWidth, periodKey, startTs, endTs) {
  if (!dates || dates.length === 0 || chartWidth <= 0) return { ticksLine: '', labelsLine: '' };

  const numLabels = 3;
  const labelPositions = [];
  for (let i = 0; i < numLabels; i++) {
    const dataIndex = Math.floor((i / (numLabels - 1)) * (dates.length - 1));
    const charPosition = Math.floor((i / (numLabels - 1)) * (chartWidth - 1));
    labelPositions.push({ position: charPosition, date: dates[dataIndex] });
  }

  const ticksChars = new Array(chartWidth + Y_AXIS_PADDING).fill(' ');
  for (let x = 0; x < chartWidth; x++) ticksChars[Y_AXIS_PADDING + x] = '─';
  for (const { position } of labelPositions) ticksChars[Y_AXIS_PADDING + position] = '┬';

  const labelsChars = new Array(chartWidth + Y_AXIS_PADDING).fill(' ');
  for (let i = 0; i < labelPositions.length; i++) {
    const { position, date } = labelPositions[i];
    const labelText = formatDateForAxis(date, periodKey, startTs, endTs);
    const startPos = Y_AXIS_PADDING + position;

    let adjustedStart = startPos;
    if (i === 0) adjustedStart = Y_AXIS_PADDING;
    else if (i === labelPositions.length - 1) adjustedStart = Math.max(Y_AXIS_PADDING, startPos - labelText.length);
    else adjustedStart = Math.max(Y_AXIS_PADDING, startPos - Math.floor(labelText.length / 2));

    for (let j = 0; j < labelText.length && adjustedStart + j < labelsChars.length; j++) {
      labelsChars[adjustedStart + j] = labelText[j];
    }
  }

  return { ticksLine: ticksChars.join(''), labelsLine: labelsChars.join('') };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function buildEventMarks({ history, executions, startTs, endTs, plotWidth }) {
  const marks = new Array(plotWidth).fill(null).map(() => ({ ch: ' ', color: 'gray' }));
  if (!history || history.length < 2 || startTs >= endTs) return marks;

  const placeMark = (ts, kind) => {
    const x = Math.round(((ts - startTs) / (endTs - startTs)) * (plotWidth - 1));
    const idx = clamp(x, 0, plotWidth - 1);

    const existing = marks[idx].ch;
    if (existing !== ' ') {
      marks[idx] = { ch: '◆', color: 'yellow' };
      return;
    }

    if (kind === 'in') marks[idx] = { ch: '▲', color: 'green' };
    else if (kind === 'out') marks[idx] = { ch: '▼', color: 'red' };
  };

  // 1) Executions: BOT => out, SLD => in
  for (const exec of executions || []) {
    const dt = parseExecutionTime(exec.time);
    const ts = dt?.getTime?.();
    if (!ts || ts < startTs || ts > endTs) continue;
    const kind = exec.side === 'SLD' ? 'in' : 'out';
    placeMark(ts, kind);
  }

  // 2) Cashflow-ish events: when cash + net liquidation jump together.
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];
    if (!prev || !curr) continue;

    const prevNet = prev.netLiquidation;
    const currNet = curr.netLiquidation;
    const prevCash = prev.cash;
    const currCash = curr.cash;
    if (!Number.isFinite(prevNet) || !Number.isFinite(currNet) || !Number.isFinite(prevCash) || !Number.isFinite(currCash)) continue;

    const dNet = currNet - prevNet;
    const dCash = currCash - prevCash;

    const thresholdNet = Math.max(100, Math.abs(prevNet) * 0.003);
    const thresholdCash = Math.max(100, Math.abs(prevCash) * 0.01);

    const ts = curr.ts;
    if (!ts || ts < startTs || ts > endTs) continue;

    const sameDirection = Math.sign(dNet) === Math.sign(dCash) && Math.sign(dNet) !== 0;
    const bigEnough = Math.abs(dNet) >= thresholdNet && Math.abs(dCash) >= thresholdCash;

    if (sameDirection && bigEnough) {
      placeMark(ts, dNet > 0 ? 'in' : 'out');
    }
  }

  return marks;
}

function overlayMarksOnChart(chart, values, marks, height) {
  if (!chart || !values || values.length === 0 || !marks || marks.length === 0) return chart;

  // Keep only marks that carry meaning.
  const hasAnyMark = marks.some(m => m?.ch && m.ch !== ' ');
  if (!hasAnyMark) return chart;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  const lines = chart.split('\n');
  // Defensive: asciichart may output a different number of rows than requested in edge cases.
  const rows = Math.min(lines.length, height);

  const placeAt = (rowIndex, xIndex, ch) => {
    if (rowIndex < 0 || rowIndex >= rows) return;
    const line = lines[rowIndex];
    const pos = Y_AXIS_PADDING + xIndex;
    if (!line || pos < 0 || pos >= line.length) return;
    lines[rowIndex] = line.slice(0, pos) + ch + line.slice(pos + 1);
  };

  for (let x = 0; x < marks.length && x < values.length; x++) {
    const ch = marks[x]?.ch;
    if (!ch || ch === ' ') continue;

    // Map value to row: top row = max, bottom row = min.
    let scaled = 0.5;
    if (range > 0) scaled = (values[x] - min) / range;
    const row = clamp(rows - 1 - Math.round(scaled * (rows - 1)), 0, rows - 1);
    placeAt(row, x, ch);
  }

  return lines.join('\n');
}

export function PortfolioReportScreen({
  history,
  executions,
  onBack,
}) {
  const [selectedPeriod, setSelectedPeriod] = useState(DEFAULT_PERIOD);
  const { stdout } = useStdout();

  const terminalWidth = stdout?.columns || 80;
  const terminalHeight = stdout?.rows || 24;
  const innerWidth = Math.max(0, terminalWidth - 2); // padding={1} left+right
  const chartWidth = Math.max(20, innerWidth - Y_AXIS_PADDING);
  const chartHeight = Math.max(10, terminalHeight - 7);

  // Unified input: Esc back, ↑↓ zoom
  useInput((input, key) => {
    if (key.escape) {
      onBack?.();
    } else if (key.upArrow) {
      const i = PORTFOLIO_PERIOD_KEYS.indexOf(selectedPeriod);
      if (i < PORTFOLIO_PERIOD_KEYS.length - 1) setSelectedPeriod(PORTFOLIO_PERIOD_KEYS[i + 1]);
    } else if (key.downArrow) {
      const i = PORTFOLIO_PERIOD_KEYS.indexOf(selectedPeriod);
      if (i > 0) setSelectedPeriod(PORTFOLIO_PERIOD_KEYS[i - 1]);
    }
  });

  // Keep selection valid if constants change
  useEffect(() => {
    if (!PORTFOLIO_PERIODS[selectedPeriod]) setSelectedPeriod(DEFAULT_PERIOD);
  }, [selectedPeriod]);

  const filteredHistory = useMemo(() => {
    if (!history || history.length === 0) return [];

    const period = PORTFOLIO_PERIODS[selectedPeriod];
    if (!period || period.kind === 'all') return history;

    const cutoffDate = new Date();
    if (period.kind === 'months') cutoffDate.setMonth(cutoffDate.getMonth() - period.n);
    if (period.kind === 'years') cutoffDate.setFullYear(cutoffDate.getFullYear() - period.n);
    const cutoff = cutoffDate.getTime();
    return history.filter(p => p.ts >= cutoff);
  }, [history, selectedPeriod]);

  const sampled = useMemo(() => {
    if (!filteredHistory || filteredHistory.length === 0) {
      return { values: [], dates: [], startTs: 0, endTs: 0 };
    }

    const startTs = filteredHistory[0]?.ts || 0;
    const endTs = filteredHistory[filteredHistory.length - 1]?.ts || 0;

    const valuesRaw = filteredHistory.map(p => p.netLiquidation);
    const datesRaw = filteredHistory.map(p => new Date(p.ts));

    if (valuesRaw.length === 0) return { values: [], dates: [], startTs, endTs };

    const values = resampleLinear(valuesRaw, chartWidth);
    const ts = resampleLinear(datesRaw.map(d => d.getTime()), chartWidth);
    const dates = ts.map(t => new Date(t));
    return { values, dates, startTs, endTs };
  }, [filteredHistory, chartWidth]);

  const plotWidth = sampled.values.length;

  const chartData = useMemo(() => {
    if (!sampled.values || sampled.values.length < 2) return null;
    const first = sampled.values[0];
    const last = sampled.values[sampled.values.length - 1];
    const change = last - first;
    const changePercent = first > 0 ? (change / first) * 100 : 0;
    return { first, last, change, changePercent };
  }, [sampled.values]);

  const chartRender = useMemo(() => {
    if (!sampled.values || sampled.values.length < 2) return null;
    try {
      return asciichart.plot(sampled.values, {
        height: chartHeight,
        format: (x) => formatMoney(x).padStart(10),
      });
    } catch (e) {
      debug('Chart render error:', e?.message);
      return null;
    }
  }, [sampled.values, chartHeight, chartData]);

  const xAxis = useMemo(() => {
    return generateXAxisLabels(sampled.dates, plotWidth, selectedPeriod, sampled.startTs, sampled.endTs);
  }, [sampled.dates, plotWidth, selectedPeriod, sampled.startTs, sampled.endTs]);

  const eventMarks = useMemo(() => {
    return buildEventMarks({
      history: filteredHistory,
      executions,
      startTs: sampled.startTs,
      endTs: sampled.endTs,
      plotWidth,
    });
  }, [filteredHistory, executions, sampled.startTs, sampled.endTs, plotWidth]);

  const chartWithMarks = useMemo(() => {
    return overlayMarksOnChart(chartRender, sampled.values, eventMarks, chartHeight);
  }, [chartRender, sampled.values, eventMarks, chartHeight]);

  if (!filteredHistory || filteredHistory.length < 2) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box justifyContent="space-between">
          <Text bold color="white">portafolio</Text>
          <Text color="gray">cargando...</Text>
        </Box>
      </Box>
    );
  }

  if (!chartData || !chartRender) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="white">portafolio</Text>
        <Box marginTop={1}>
          <Text color="gray">Sin datos</Text>
        </Box>
      </Box>
    );
  }

  const isPositive = chartData.change >= 0;
  const displayColor = isPositive ? 'green' : 'red';
  const displayArrow = isPositive ? '▲' : '▼';

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="white">portafolio</Text>
        <Text color={displayColor} bold>
          {formatMoney(chartData.last)} {displayArrow} {formatPercent(Math.abs(chartData.changePercent))}
        </Text>
      </Box>

      {/* Chart */}
      <Box flexDirection="column">
        <Text>{chartWithMarks}</Text>
        <Text color="gray">{xAxis.ticksLine}</Text>
        <Text color="gray">{xAxis.labelsLine}</Text>
      </Box>

      {/* Footer */}
      <Box marginTop={1} justifyContent="space-between">
        <Box>
          <Text color="white">{PORTFOLIO_PERIODS[selectedPeriod].label}</Text>
          <Text color="gray">  ↑↓</Text>
        </Box>
        <Box>
          <Text color="gray">▲ ingreso  ▼ egreso</Text>
        </Box>
      </Box>
    </Box>
  );
}

export default PortfolioReportScreen;
