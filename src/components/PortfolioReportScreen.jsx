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
function formatDateLabel(date, rangeDays) {
  if (!date) return '';

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const y = String(date.getFullYear()).slice(-2);
  const d = date.getDate();
  const m = months[date.getMonth()];

  if (rangeDays < 60) {
    return `${d} ${m}`;
  }
  if (rangeDays < 365) {
    return `${d}${m.slice(0, 3)}`;
  }
  return `${m} '${y}`;
}

// ═══════════════════════════════════════════════════════════════
// GENERADOR DE EJE X CON 7 FECHAS
// ═══════════════════════════════════════════════════════════════
function generateXAxis(dates, chartWidth) {
  if (!dates || dates.length === 0 || chartWidth <= 0) {
    return { ticksLine: '', labelsLine: '' };
  }

  const totalWidth = chartWidth + Y_AXIS_PADDING;
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const rangeDays = Math.max(1, Math.ceil((lastDate - firstDate) / (1000 * 60 * 60 * 24)));

  const numLabels = 7;
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

  const ticksChars = new Array(totalWidth).fill(' ');
  for (let x = 0; x < chartWidth; x++) {
    ticksChars[Y_AXIS_PADDING + x] = '─';
  }
  for (const { position } of labelPositions) {
    ticksChars[Y_AXIS_PADDING + position] = '┬';
  }

  const labelsChars = new Array(totalWidth).fill(' ');
  for (let i = 0; i < labelPositions.length; i++) {
    const { position, date } = labelPositions[i];
    const labelText = formatDateLabel(date, rangeDays);
    const startPos = Y_AXIS_PADDING + position;

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
// CALCULAR COST BASIS (DINERO INVERTIDO)
// Detecta depósitos: cuando cash Y netLiquidation suben juntos
// ═══════════════════════════════════════════════════════════════
function calculateCostBasis(history) {
  if (!history || history.length === 0) return [];

  const costBasisValues = [];
  let accumulatedCostBasis = history[0].netLiquidation;

  debug(`Starting cost basis calculation with initial value: ${accumulatedCostBasis}`);

  for (let i = 0; i < history.length; i++) {
    if (i === 0) {
      costBasisValues.push(accumulatedCostBasis);
      continue;
    }

    const prev = history[i - 1];
    const curr = history[i];

    const prevNet = prev.netLiquidation;
    const currNet = curr.netLiquidation;
    const prevCash = prev.cash;
    const currCash = curr.cash;

    if (!Number.isFinite(prevNet) || !Number.isFinite(currNet) ||
        !Number.isFinite(prevCash) || !Number.isFinite(currCash)) {
      costBasisValues.push(accumulatedCostBasis);
      continue;
    }

    const dNet = currNet - prevNet;
    const dCash = currCash - prevCash;

    // Detectar depósito/retiro:
    // Si cash Y netLiquidation cambian en la misma dirección con magnitud similar,
    // es muy probable que sea un depósito o retiro (no ganancia de mercado)
    const sameDirection = Math.sign(dNet) === Math.sign(dCash) && Math.sign(dNet) !== 0;
    const thresholdNet = Math.max(50, Math.abs(prevNet) * 0.002); // 0.2% o $50
    const thresholdCash = Math.max(50, Math.abs(prevCash) * 0.01); // 1% o $50
    const bigEnough = Math.abs(dNet) >= thresholdNet && Math.abs(dCash) >= thresholdCash;

    // Además, la razón entre dNet y dCash debe estar cerca de 1
    // (un depósito de $1000 sube cash ~$1000 y netLiq ~$1000)
    const ratio = dCash !== 0 ? Math.abs(dNet / dCash) : 0;
    const ratioIsClose = ratio > 0.5 && ratio < 2.0;

    if (sameDirection && bigEnough && ratioIsClose) {
      // Es un depósito (dNet > 0) o retiro (dNet < 0)
      accumulatedCostBasis += dNet;
      debug(`Detected cash flow at ${new Date(curr.ts).toISOString()}: ${dNet > 0 ? 'DEPOSIT' : 'WITHDRAWAL'} of ${Math.abs(dNet).toFixed(2)}`);
    }

    costBasisValues.push(accumulatedCostBasis);
  }

  debug(`Cost basis calculation complete. Final value: ${accumulatedCostBasis}`);
  return costBasisValues;
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

  // Altura del gráfico: 25% de la terminal, min 6, max 10
  const chartHeight = Math.min(10, Math.max(6, Math.floor(terminalHeight * 0.25)));

  debug(`Terminal: ${terminalWidth}x${terminalHeight}, Chart: ${chartWidth}x${chartHeight}`);

  // INPUT
  useInput((input, key) => {
    if (key.escape) {
      onBack?.();
    } else if (key.upArrow) {
      setSelectedPeriod(prev => {
        const i = PORTFOLIO_PERIOD_KEYS.indexOf(prev);
        if (i < PORTFOLIO_PERIOD_KEYS.length - 1) {
          return PORTFOLIO_PERIOD_KEYS[i + 1];
        }
        return prev;
      });
    } else if (key.downArrow) {
      setSelectedPeriod(prev => {
        const i = PORTFOLIO_PERIOD_KEYS.indexOf(prev);
        if (i > 0) {
          return PORTFOLIO_PERIOD_KEYS[i - 1];
        }
        return prev;
      });
    }
  });

  useEffect(() => {
    if (!PORTFOLIO_PERIODS[selectedPeriod]) setSelectedPeriod(DEFAULT_PERIOD);
  }, [selectedPeriod]);

  // FILTRAR HISTORIA POR PERIODO
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

  // CALCULAR COST BASIS
  const costBasisRaw = useMemo(() => {
    return calculateCostBasis(filteredHistory);
  }, [filteredHistory]);

  // RESAMPLEAR DATOS
  const sampled = useMemo(() => {
    if (!filteredHistory || filteredHistory.length === 0) {
      return { values: [], costBasis: [], dates: [] };
    }

    const valuesRaw = filteredHistory.map(p => p.netLiquidation);
    const datesRaw = filteredHistory.map(p => new Date(p.ts));

    if (valuesRaw.length === 0) return { values: [], costBasis: [], dates: [] };

    const values = resampleLinear(valuesRaw, chartWidth);
    const costBasis = resampleLinear(costBasisRaw, chartWidth);
    const ts = resampleLinear(datesRaw.map(d => d.getTime()), chartWidth);
    const dates = ts.map(t => new Date(t));

    return { values, costBasis, dates };
  }, [filteredHistory, costBasisRaw, chartWidth]);

  // CALCULAR GANANCIA REAL
  const chartData = useMemo(() => {
    if (!sampled.values || sampled.values.length < 2) return null;

    const firstValue = sampled.values[0];
    const lastValue = sampled.values[sampled.values.length - 1];
    const firstCostBasis = sampled.costBasis[0];
    const lastCostBasis = sampled.costBasis[sampled.costBasis.length - 1];

    // Ganancia real = (valor actual - cost basis actual) - (valor inicial - cost basis inicial)
    // O más simple: ganancia real = cambio en valor - cambio en cost basis
    const realGain = (lastValue - lastCostBasis) - (firstValue - firstCostBasis);

    // También calculamos: cuánto vale ahora vs cuánto invertí en total
    const totalGain = lastValue - lastCostBasis;
    const totalGainPercent = lastCostBasis > 0 ? (totalGain / lastCostBasis) * 100 : 0;

    debug(`Chart data: value=${lastValue}, costBasis=${lastCostBasis}, totalGain=${totalGain}`);

    return {
      lastValue,
      lastCostBasis,
      totalGain,
      totalGainPercent,
      realGain,
    };
  }, [sampled.values, sampled.costBasis]);

  // RENDERIZAR GRÁFICO CON DOS LÍNEAS
  const chartRender = useMemo(() => {
    if (!sampled.values || sampled.values.length < 2 || !chartData) return null;

    const isPositive = chartData.totalGain >= 0;
    const portfolioColor = isPositive ? asciichart.green : asciichart.red;

    // Color gris para cost basis (usando código ANSI directo)
    const grayColor = (s) => `\x1b[90m${s}\x1b[0m`;

    try {
      // asciichart soporta múltiples series
      return asciichart.plot([sampled.values, sampled.costBasis], {
        height: chartHeight,
        colors: [portfolioColor, grayColor],
        format: (x) => formatCompact(x).padStart(8),
      });
    } catch (e) {
      debug('Chart render error:', e?.message);
      return null;
    }
  }, [sampled.values, sampled.costBasis, chartHeight, chartData]);

  // EJE X
  const xAxis = useMemo(() => {
    return generateXAxis(sampled.dates, chartWidth);
  }, [sampled.dates, chartWidth]);

  // ESTADOS ESPECIALES
  if (!filteredHistory || filteredHistory.length < 2) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="gray">loading...</Text>
      </Box>
    );
  }

  if (!chartData || !chartRender) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box>
          <Text bold color="white">{formatMoney(0)}</Text>
          <Text color="gray">   </Text>
          <Text color="gray">no data</Text>
        </Box>
      </Box>
    );
  }

  // RENDER PRINCIPAL
  const isPositive = chartData.totalGain >= 0;
  const gainColor = isPositive ? 'green' : 'red';
  const gainSign = isPositive ? '+' : '';

  return (
    <Box flexDirection="column" padding={1}>
      {/* HEADER: Valor actual + Ganancia real */}
      <Box>
        <Text bold color="white">{formatMoney(chartData.lastValue)}</Text>
        <Text color="gray">   </Text>
        <Text color={gainColor} bold>
          {gainSign}{formatMoney(chartData.totalGain)} ({formatPercent(Math.abs(chartData.totalGainPercent))})
        </Text>
        <Text color="gray"> gain</Text>
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

      {/* GRÁFICO CON DOS LÍNEAS */}
      <Box flexDirection="column" marginTop={1}>
        <Text>{chartRender}</Text>
      </Box>

      {/* EJE X */}
      <Box flexDirection="column">
        <Text color="gray">{xAxis.ticksLine}</Text>
        <Text color="gray">{xAxis.labelsLine}</Text>
      </Box>

      {/* LEYENDA MINIMALISTA */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ─ portfolio   <Text color="gray">┄ invested</Text>
        </Text>
      </Box>
    </Box>
  );
}

export default PortfolioReportScreen;
