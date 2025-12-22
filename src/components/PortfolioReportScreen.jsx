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

// Y-axis padding: 8 chars para el valor + 1 espacio
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
function formatDateLabel(date, periodKey) {
  if (!date) return '';

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const y = String(date.getFullYear()).slice(-2);

  // Para periodos cortos (1M), mostrar día + mes abreviado
  if (periodKey === '1M') {
    return `${date.getDate()}${months[date.getMonth()].slice(0, 3)}`;
  }

  // Para periodos largos, mostrar mes + año
  return `${months[date.getMonth()]} '${y}`;
}

// ═══════════════════════════════════════════════════════════════
// GENERADOR DE EJE X CON 5 FECHAS Y LÍNEA DE TICKS
// ═══════════════════════════════════════════════════════════════
function generateXAxis(dates, chartWidth, periodKey) {
  if (!dates || dates.length === 0 || chartWidth <= 0) {
    return { ticksLine: '', labelsLine: '' };
  }

  const totalWidth = chartWidth + Y_AXIS_PADDING;

  // 5 etiquetas: inicio, 25%, 50%, 75%, fin
  const numLabels = 5;
  const labelPositions = [];

  for (let i = 0; i < numLabels; i++) {
    const frac = i / (numLabels - 1);
    const dataIndex = Math.floor(frac * (dates.length - 1));
    const charPosition = Math.floor(frac * (chartWidth - 1));
    labelPositions.push({
      position: charPosition,
      date: dates[dataIndex],
    });
  }

  // Línea de ticks: ─────┬─────┬─────┬─────┬─────
  const ticksChars = new Array(totalWidth).fill(' ');
  for (let x = 0; x < chartWidth; x++) {
    ticksChars[Y_AXIS_PADDING + x] = '─';
  }
  for (const { position } of labelPositions) {
    ticksChars[Y_AXIS_PADDING + position] = '┬';
  }

  // Línea de etiquetas
  const labelsChars = new Array(totalWidth).fill(' ');
  for (let i = 0; i < labelPositions.length; i++) {
    const { position, date } = labelPositions[i];
    const labelText = formatDateLabel(date, periodKey);
    const startPos = Y_AXIS_PADDING + position;

    // Ajustar posición para que no se salga
    let adjustedStart = startPos;
    if (i === 0) {
      adjustedStart = Y_AXIS_PADDING;
    } else if (i === labelPositions.length - 1) {
      adjustedStart = Math.max(Y_AXIS_PADDING, totalWidth - labelText.length);
    } else {
      adjustedStart = Math.max(Y_AXIS_PADDING, startPos - Math.floor(labelText.length / 2));
    }

    for (let j = 0; j < labelText.length && adjustedStart + j < totalWidth; j++) {
      labelsChars[adjustedStart + j] = labelText[j];
    }
  }

  return {
    ticksLine: ticksChars.join(''),
    labelsLine: labelsChars.join(''),
  };
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export function PortfolioReportScreen({
  history,
  onBack,
}) {
  const [selectedPeriod, setSelectedPeriod] = useState(DEFAULT_PERIOD);
  const { stdout } = useStdout();

  const terminalWidth = stdout?.columns || 80;
  const terminalHeight = stdout?.rows || 24;
  const innerWidth = Math.max(0, terminalWidth - 2);
  const chartWidth = Math.max(20, innerWidth - Y_AXIS_PADDING);

  // ALTURA DEL GRÁFICO: 25% de la terminal (más compacto)
  // Mínimo 6 líneas, máximo 10 líneas
  const chartHeight = Math.min(10, Math.max(6, Math.floor(terminalHeight * 0.25)));

  debug(`Terminal: ${terminalWidth}x${terminalHeight}, Chart: ${chartWidth}x${chartHeight}`);
  debug(`Selected period: ${selectedPeriod}`);

  // ═══════════════════════════════════════════════════════════════
  // INPUT: Esc para volver, ↑↓ para cambiar periodo
  // ═══════════════════════════════════════════════════════════════
  useInput((input, key) => {
    debug(`Input received: input="${input}", key=${JSON.stringify(key)}`);

    if (key.escape) {
      debug('Navigating back');
      onBack?.();
    } else if (key.upArrow) {
      setSelectedPeriod(prev => {
        const i = PORTFOLIO_PERIOD_KEYS.indexOf(prev);
        if (i < PORTFOLIO_PERIOD_KEYS.length - 1) {
          debug(`Period up: ${prev} -> ${PORTFOLIO_PERIOD_KEYS[i + 1]}`);
          return PORTFOLIO_PERIOD_KEYS[i + 1];
        }
        return prev;
      });
    } else if (key.downArrow) {
      setSelectedPeriod(prev => {
        const i = PORTFOLIO_PERIOD_KEYS.indexOf(prev);
        if (i > 0) {
          debug(`Period down: ${prev} -> ${PORTFOLIO_PERIOD_KEYS[i - 1]}`);
          return PORTFOLIO_PERIOD_KEYS[i - 1];
        }
        return prev;
      });
    }
  });

  useEffect(() => {
    if (!PORTFOLIO_PERIODS[selectedPeriod]) setSelectedPeriod(DEFAULT_PERIOD);
  }, [selectedPeriod]);

  // ═══════════════════════════════════════════════════════════════
  // FILTRAR HISTORIA POR PERIODO
  // ═══════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════
  // RESAMPLEAR DATOS PARA EL ANCHO DEL GRÁFICO
  // ═══════════════════════════════════════════════════════════════
  const sampled = useMemo(() => {
    if (!filteredHistory || filteredHistory.length === 0) {
      return { values: [], dates: [] };
    }

    const valuesRaw = filteredHistory.map(p => p.netLiquidation);
    const datesRaw = filteredHistory.map(p => new Date(p.ts));

    if (valuesRaw.length === 0) return { values: [], dates: [] };

    const values = resampleLinear(valuesRaw, chartWidth);
    if (values.length === 0) return { values: [], dates: [] };

    const ts = resampleLinear(datesRaw.map(d => d.getTime()), chartWidth);
    const dates = ts.map(t => new Date(t));
    return { values, dates };
  }, [filteredHistory, chartWidth]);

  // ═══════════════════════════════════════════════════════════════
  // CALCULAR CAMBIO
  // ═══════════════════════════════════════════════════════════════
  const chartData = useMemo(() => {
    if (!sampled.values || sampled.values.length < 2) return null;
    const first = sampled.values[0];
    const last = sampled.values[sampled.values.length - 1];
    const change = last - first;
    const changePercent = first > 0 ? (change / first) * 100 : 0;
    return { first, last, change, changePercent };
  }, [sampled.values]);

  // ═══════════════════════════════════════════════════════════════
  // RENDERIZAR GRÁFICO CON COLOR SEGÚN PERFORMANCE
  // ═══════════════════════════════════════════════════════════════
  const chartRender = useMemo(() => {
    if (!sampled.values || sampled.values.length < 2 || !chartData) return null;

    const isPositive = chartData.change >= 0;
    const chartColor = isPositive ? asciichart.green : asciichart.red;

    try {
      return asciichart.plot(sampled.values, {
        height: chartHeight,
        colors: [chartColor],
        format: (x) => formatCompact(x).padStart(8),
      });
    } catch (e) {
      debug('Chart render error:', e?.message);
      return null;
    }
  }, [sampled.values, chartHeight, chartData]);

  // ═══════════════════════════════════════════════════════════════
  // EJE X
  // ═══════════════════════════════════════════════════════════════
  const xAxis = useMemo(() => {
    return generateXAxis(sampled.dates, chartWidth, selectedPeriod);
  }, [sampled.dates, chartWidth, selectedPeriod]);

  // ═══════════════════════════════════════════════════════════════
  // ESTADOS ESPECIALES
  // ═══════════════════════════════════════════════════════════════

  // Loading
  if (!filteredHistory || filteredHistory.length < 2) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="gray">loading...</Text>
      </Box>
    );
  }

  // No data
  if (!chartData || !chartRender) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box>
          <Text bold color="white">{formatMoney(0)}</Text>
          <Text color="gray">   </Text>
          <Text color="gray">no data</Text>
          <Text color="gray">   </Text>
          <Text dimColor>{PORTFOLIO_PERIODS[selectedPeriod].label}</Text>
        </Box>
      </Box>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER PRINCIPAL
  // ═══════════════════════════════════════════════════════════════

  const isPositive = chartData.change >= 0;
  const changeColor = isPositive ? 'green' : 'red';
  const changeSign = isPositive ? '+' : '';

  return (
    <Box flexDirection="column" padding={1}>
      {/* ═══ HEADER: Valor + Cambio ═══ */}
      <Box>
        <Text bold color="white">{formatMoney(chartData.last)}</Text>
        <Text color="gray">   </Text>
        <Text color={changeColor} bold>
          {changeSign}{formatMoney(chartData.change)} ({formatPercent(Math.abs(chartData.changePercent))})
        </Text>
      </Box>

      {/* ═══ SELECTOR DE PERIODO ═══ */}
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

      {/* ═══ GRÁFICO ═══ */}
      <Box flexDirection="column" marginTop={1}>
        <Text>{chartRender}</Text>
      </Box>

      {/* ═══ EJE X: Línea de ticks + fechas ═══ */}
      <Box flexDirection="column">
        <Text color="gray">{xAxis.ticksLine}</Text>
        <Text color="gray">{xAxis.labelsLine}</Text>
      </Box>
    </Box>
  );
}

export default PortfolioReportScreen;
