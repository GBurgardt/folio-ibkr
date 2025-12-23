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

// ═══════════════════════════════════════════════════════════════
// PERIODOS DISPONIBLES
// ═══════════════════════════════════════════════════════════════
const PORTFOLIO_PERIODS = {
  '1M': { kind: 'months', n: 1, label: '1m' },
  '6M': { kind: 'months', n: 6, label: '6m' },
  '1Y': { kind: 'years', n: 1, label: '1y' },
  'ALL': { kind: 'all', n: null, label: 'all' },
};
const PORTFOLIO_PERIOD_KEYS = ['1M', '6M', '1Y', 'ALL'];
const DEFAULT_PERIOD = 'ALL';

const Y_AXIS_PADDING = 9;

// ═══════════════════════════════════════════════════════════════
// FORMATO COMPACTO PARA EJE Y
// ═══════════════════════════════════════════════════════════════
function formatCompact(value) {
  if (value === null || value === undefined || isNaN(value)) return '$--';
  const absValue = Math.abs(value);
  let formatted;
  if (absValue >= 1_000_000) {
    formatted = `${(absValue / 1_000_000).toFixed(1)}M`;
  } else if (absValue >= 1_000) {
    formatted = `${(absValue / 1_000).toFixed(0)}K`;
  } else {
    formatted = absValue.toFixed(0);
  }
  return value >= 0 ? `$${formatted}` : `-$${formatted}`;
}

// ═══════════════════════════════════════════════════════════════
// FORMATO DE FECHA PARA EJE X
// ═══════════════════════════════════════════════════════════════
function formatDateLabel(date, rangeDays) {
  if (!date) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = date.getDate();
  const m = months[date.getMonth()];
  if (rangeDays < 60) return `${d} ${m}`;
  if (rangeDays < 365) return `${d}${m.slice(0, 3)}`;
  return `${m} '${String(date.getFullYear()).slice(-2)}`;
}

// ═══════════════════════════════════════════════════════════════
// DETECTAR DEPÓSITOS/RETIROS
// ═══════════════════════════════════════════════════════════════
function detectCashFlows(history) {
  if (!history || history.length < 2) return { flows: [], totalInvested: history?.[0]?.netLiquidation || 0 };

  const flows = [];
  let totalInvested = history[0].netLiquidation;

  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];

    const dNet = curr.netLiquidation - prev.netLiquidation;
    const dCash = curr.cash - prev.cash;

    const sameDirection = Math.sign(dNet) === Math.sign(dCash) && Math.sign(dNet) !== 0;
    const thresholdNet = Math.max(50, Math.abs(prev.netLiquidation) * 0.002);
    const thresholdCash = Math.max(50, Math.abs(prev.cash) * 0.01);
    const bigEnough = Math.abs(dNet) >= thresholdNet && Math.abs(dCash) >= thresholdCash;
    const ratio = dCash !== 0 ? Math.abs(dNet / dCash) : 0;
    const ratioIsClose = ratio > 0.5 && ratio < 2.0;

    if (sameDirection && bigEnough && ratioIsClose) {
      totalInvested += dNet;
      flows.push({
        ts: curr.ts,
        amount: dNet,
        type: dNet > 0 ? 'deposit' : 'withdrawal',
      });
      debug(`Cash flow at ${new Date(curr.ts).toISOString()}: ${dNet > 0 ? 'DEPOSIT' : 'WITHDRAWAL'} ${Math.abs(dNet).toFixed(2)}`);
    }
  }

  return { flows, totalInvested };
}

// ═══════════════════════════════════════════════════════════════
// GENERAR EJE X CON MARCADORES DE DEPÓSITOS
// ═══════════════════════════════════════════════════════════════
function generateXAxisWithMarkers(dates, chartWidth, flows) {
  if (!dates || dates.length === 0 || chartWidth <= 0) {
    return { ticksLine: '', labelsLine: '', hasDeposits: false };
  }

  const totalWidth = chartWidth + Y_AXIS_PADDING;
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const rangeDays = Math.max(1, Math.ceil((lastDate - firstDate) / (1000 * 60 * 60 * 24)));
  const rangeMs = lastDate.getTime() - firstDate.getTime();

  // Encontrar posiciones de depósitos
  const depositPositions = new Set();
  for (const flow of flows) {
    if (flow.type === 'deposit') {
      const frac = rangeMs > 0 ? (flow.ts - firstDate.getTime()) / rangeMs : 0;
      const pos = Math.round(frac * (chartWidth - 1));
      if (pos >= 0 && pos < chartWidth) {
        depositPositions.add(pos);
      }
    }
  }

  // 7 etiquetas
  const numLabels = 7;
  const labelPositions = [];
  for (let i = 0; i < numLabels; i++) {
    const frac = i / (numLabels - 1);
    const dataIndex = Math.floor(frac * (dates.length - 1));
    const charPosition = Math.floor(frac * (chartWidth - 1));
    labelPositions.push({ position: charPosition, date: dates[dataIndex] });
  }

  // Línea de ticks con ▲ en depósitos
  const ticksChars = new Array(totalWidth).fill(' ');
  for (let x = 0; x < chartWidth; x++) {
    if (depositPositions.has(x)) {
      ticksChars[Y_AXIS_PADDING + x] = '▲';
    } else {
      ticksChars[Y_AXIS_PADDING + x] = '─';
    }
  }
  // Poner ┬ en las posiciones de etiquetas (si no hay depósito ahí)
  for (const { position } of labelPositions) {
    if (!depositPositions.has(position)) {
      ticksChars[Y_AXIS_PADDING + position] = '┬';
    }
  }

  // Línea de etiquetas
  const labelsChars = new Array(totalWidth).fill(' ');
  for (let i = 0; i < labelPositions.length; i++) {
    const { position, date } = labelPositions[i];
    const labelText = formatDateLabel(date, rangeDays);
    const startPos = Y_AXIS_PADDING + position;

    let adjustedStart = startPos;
    if (i === 0) adjustedStart = Y_AXIS_PADDING;
    else if (i === labelPositions.length - 1) adjustedStart = Math.max(Y_AXIS_PADDING, totalWidth - labelText.length);
    else adjustedStart = Math.max(Y_AXIS_PADDING, startPos - Math.floor(labelText.length / 2));

    for (let j = 0; j < labelText.length && adjustedStart + j < totalWidth; j++) {
      labelsChars[adjustedStart + j] = labelText[j];
    }
  }

  return {
    ticksLine: ticksChars.join(''),
    labelsLine: labelsChars.join(''),
    hasDeposits: depositPositions.size > 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export function PortfolioReportScreen({ history, onBack }) {
  const [selectedPeriod, setSelectedPeriod] = useState(DEFAULT_PERIOD);
  const { stdout } = useStdout();

  const terminalWidth = stdout?.columns || 80;
  const terminalHeight = stdout?.rows || 24;
  const innerWidth = Math.max(0, terminalWidth - 2);
  const chartWidth = Math.max(20, innerWidth - Y_AXIS_PADDING);
  const chartHeight = Math.min(10, Math.max(6, Math.floor(terminalHeight * 0.25)));

  useInput((input, key) => {
    if (key.escape) onBack?.();
    else if (key.upArrow) {
      setSelectedPeriod(prev => {
        const i = PORTFOLIO_PERIOD_KEYS.indexOf(prev);
        return i < PORTFOLIO_PERIOD_KEYS.length - 1 ? PORTFOLIO_PERIOD_KEYS[i + 1] : prev;
      });
    } else if (key.downArrow) {
      setSelectedPeriod(prev => {
        const i = PORTFOLIO_PERIOD_KEYS.indexOf(prev);
        return i > 0 ? PORTFOLIO_PERIOD_KEYS[i - 1] : prev;
      });
    }
  });

  useEffect(() => {
    if (!PORTFOLIO_PERIODS[selectedPeriod]) setSelectedPeriod(DEFAULT_PERIOD);
  }, [selectedPeriod]);

  // Filtrar por periodo
  const filteredHistory = useMemo(() => {
    if (!history || history.length === 0) return [];
    const period = PORTFOLIO_PERIODS[selectedPeriod];
    if (!period || period.kind === 'all') return history;
    const cutoffDate = new Date();
    if (period.kind === 'months') cutoffDate.setMonth(cutoffDate.getMonth() - period.n);
    if (period.kind === 'years') cutoffDate.setFullYear(cutoffDate.getFullYear() - period.n);
    return history.filter(p => p.ts >= cutoffDate.getTime());
  }, [history, selectedPeriod]);

  // Detectar cash flows (usando TODO el historial para el total)
  const { flows, totalInvested } = useMemo(() => {
    return detectCashFlows(history);
  }, [history]);

  // Cash flows en el periodo visible (para los marcadores)
  const flowsInPeriod = useMemo(() => {
    if (filteredHistory.length === 0) return [];
    const startTs = filteredHistory[0].ts;
    const endTs = filteredHistory[filteredHistory.length - 1].ts;
    return flows.filter(f => f.ts >= startTs && f.ts <= endTs);
  }, [flows, filteredHistory]);

  // Resamplear
  const sampled = useMemo(() => {
    if (!filteredHistory || filteredHistory.length === 0) return { values: [], dates: [] };
    const valuesRaw = filteredHistory.map(p => p.netLiquidation);
    const datesRaw = filteredHistory.map(p => new Date(p.ts));
    const values = resampleLinear(valuesRaw, chartWidth);
    const ts = resampleLinear(datesRaw.map(d => d.getTime()), chartWidth);
    return { values, dates: ts.map(t => new Date(t)) };
  }, [filteredHistory, chartWidth]);

  // Calcular ganancia
  const chartData = useMemo(() => {
    if (!history || history.length === 0) return null;
    const lastValue = history[history.length - 1].netLiquidation;
    const totalGain = lastValue - totalInvested;
    const totalGainPercent = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
    return { lastValue, totalInvested, totalGain, totalGainPercent };
  }, [history, totalInvested]);

  // Renderizar gráfico (UNA sola línea)
  const chartRender = useMemo(() => {
    if (!sampled.values || sampled.values.length < 2 || !chartData) return null;
    const isPositive = chartData.totalGain >= 0;
    const color = isPositive ? asciichart.green : asciichart.red;
    try {
      return asciichart.plot(sampled.values, {
        height: chartHeight,
        colors: [color],
        format: (x) => formatCompact(x).padStart(8),
      });
    } catch (e) {
      debug('Chart error:', e?.message);
      return null;
    }
  }, [sampled.values, chartHeight, chartData]);

  // Eje X con marcadores
  const xAxis = useMemo(() => {
    return generateXAxisWithMarkers(sampled.dates, chartWidth, flowsInPeriod);
  }, [sampled.dates, chartWidth, flowsInPeriod]);

  // Estados especiales
  if (!filteredHistory || filteredHistory.length < 2) {
    return <Box flexDirection="column" padding={1}><Text color="gray">loading...</Text></Box>;
  }
  if (!chartData || !chartRender) {
    return <Box flexDirection="column" padding={1}><Text color="gray">no data</Text></Box>;
  }

  const isPositive = chartData.totalGain >= 0;
  const gainColor = isPositive ? 'green' : 'red';
  const gainSign = isPositive ? '+' : '';

  return (
    <Box flexDirection="column" padding={1}>
      {/* HEADER LÍNEA 1: Valor actual */}
      <Text bold color="white">{formatMoney(chartData.lastValue)}</Text>

      {/* HEADER LÍNEA 2: invested + gain */}
      <Box>
        <Text color="gray" dimColor>invested </Text>
        <Text color="gray">{formatMoney(chartData.totalInvested)}</Text>
        <Text color="gray">   </Text>
        <Text color={gainColor} bold>gain {gainSign}{formatMoney(chartData.totalGain)}</Text>
        <Text color={gainColor}> ({formatPercent(Math.abs(chartData.totalGainPercent))})</Text>
      </Box>

      {/* SELECTOR DE PERIODO */}
      <Box marginTop={1}>
        {PORTFOLIO_PERIOD_KEYS.map((key, i) => (
          <Box key={key}>
            {i > 0 && <Text color="gray">  </Text>}
            {key === selectedPeriod ? (
              <Text color="cyan" bold>[{PORTFOLIO_PERIODS[key].label}]</Text>
            ) : (
              <Text color="gray">{PORTFOLIO_PERIODS[key].label}</Text>
            )}
          </Box>
        ))}
        <Text color="gray" dimColor>   ↑↓</Text>
      </Box>

      {/* GRÁFICO */}
      <Box flexDirection="column" marginTop={1}>
        <Text>{chartRender}</Text>
      </Box>

      {/* EJE X con marcadores ▲ */}
      <Box flexDirection="column">
        <Text color="gray">{xAxis.ticksLine}</Text>
        <Text color="gray">{xAxis.labelsLine}</Text>
      </Box>

      {/* LEYENDA (solo si hay depósitos) */}
      {xAxis.hasDeposits && (
        <Box marginTop={1}>
          <Text color="green">▲</Text>
          <Text color="gray" dimColor> deposit</Text>
        </Box>
      )}
    </Box>
  );
}

export default PortfolioReportScreen;
