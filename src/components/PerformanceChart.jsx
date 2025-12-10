import React, { useMemo } from 'react';
import { Box, Text, useStdout } from 'ink';
import { formatMoney, formatPercent } from '../utils/format.js';

const debug = (...args) => {
  if (process.argv.includes('--debug')) {
    console.error('[PERFORMANCE-CHART]', ...args);
  }
};

/**
 * PerformanceChart - Gráfico de barras que muestra ganancia/pérdida relativa al precio de compra
 *
 * Filosofía: El usuario no quiere ver el precio del mercado.
 *            Quiere ver SU inversión. ¿Estoy ganando o perdiendo?
 *
 * - Barras verdes arriba del eje = días donde el precio estuvo ARRIBA de su compra
 * - Barras rojas abajo del eje = días donde el precio estuvo ABAJO de su compra
 * - La altura de la barra = magnitud de la diferencia
 * - El eje horizontal = su precio de compra (el punto de referencia)
 */

// Caracteres para barras de diferentes alturas
const BLOCK_FULL = '█';
const BLOCK_UPPER = '▀';
const BLOCK_LOWER = '▄';

/**
 * Renderiza barras ASCII para un array de valores positivos/negativos
 * Retorna un array de strings, una por cada línea del gráfico
 */
function renderBars(values, height, width) {
  if (!values || values.length === 0) return [];

  // Encontrar el rango máximo (simétrico para que el eje quede centrado)
  const maxAbs = Math.max(...values.map(Math.abs), 0.01); // Evitar división por 0

  // Escalar valores a la altura disponible (mitad arriba, mitad abajo)
  const halfHeight = Math.floor(height / 2);

  // Samplear si hay más datos que ancho disponible
  // Si hay menos datos, mantenemos el tamaño original (no expandimos)
  let sampledValues = values;
  if (values.length > width) {
    const step = values.length / width;
    sampledValues = [];
    for (let i = 0; i < width; i++) {
      const idx = Math.min(Math.floor(i * step), values.length - 1);
      sampledValues.push(values[idx]);
    }
  }
  // else: mantener sampledValues = values (sin expandir)

  debug(`Rendering ${sampledValues.length} bars, maxAbs=${maxAbs.toFixed(2)}, halfHeight=${halfHeight}`);

  // Crear matriz de caracteres
  // Líneas 0 a halfHeight-1 = parte superior (valores positivos)
  // Línea halfHeight = eje (línea de compra)
  // Líneas halfHeight+1 a height-1 = parte inferior (valores negativos)
  const lines = [];

  // Parte superior (positivos) - de arriba hacia abajo
  for (let row = 0; row < halfHeight; row++) {
    let line = '';
    const threshold = ((halfHeight - row) / halfHeight) * maxAbs;
    const prevThreshold = ((halfHeight - row + 1) / halfHeight) * maxAbs;

    for (let col = 0; col < sampledValues.length; col++) {
      const val = sampledValues[col];
      if (val > 0) {
        if (val >= prevThreshold) {
          // Bloque completo
          line += BLOCK_FULL;
        } else if (val >= threshold) {
          // Bloque parcial (parte inferior del carácter)
          line += BLOCK_LOWER;
        } else {
          line += ' ';
        }
      } else {
        line += ' ';
      }
    }
    lines.push({ text: line, color: 'green' });
  }

  // Línea del eje (precio de compra)
  const axisLine = '─'.repeat(sampledValues.length);
  lines.push({ text: axisLine, color: 'gray', isAxis: true });

  // Parte inferior (negativos) - de arriba hacia abajo
  for (let row = 0; row < halfHeight; row++) {
    let line = '';
    const threshold = ((row + 1) / halfHeight) * maxAbs;
    const prevThreshold = (row / halfHeight) * maxAbs;

    for (let col = 0; col < sampledValues.length; col++) {
      const val = sampledValues[col];
      if (val < 0) {
        const absVal = Math.abs(val);
        if (absVal >= threshold) {
          // Bloque completo
          line += BLOCK_FULL;
        } else if (absVal > prevThreshold) {
          // Bloque parcial (parte superior del carácter)
          line += BLOCK_UPPER;
        } else {
          line += ' ';
        }
      } else {
        line += ' ';
      }
    }
    lines.push({ text: line, color: 'red' });
  }

  return lines;
}

/**
 * Calcular días desde una fecha
 */
function daysSince(timestamp) {
  if (!timestamp) return null;
  const now = Date.now();
  const diff = now - timestamp;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Formatear duración en formato compacto
 */
function formatDuration(days) {
  if (days === null || days === undefined) return '';
  if (days === 0) return 'hoy';
  if (days === 1) return '1d';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}sem`;
  if (days < 365) return `${Math.floor(days / 30)}m`;
  return `${Math.floor(days / 365)}a`;
}

export function PerformanceChart({
  symbol,
  historicalData,
  avgCost,
  quantity,
  purchaseDate, // timestamp de la primera compra
  currentPrice,
}) {
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns || 80;
  const chartWidth = Math.min(terminalWidth - 4, 100);
  const chartHeight = 10; // 5 arriba del eje, 5 abajo

  // Calcular la performance para cada punto de datos
  const performanceData = useMemo(() => {
    if (!historicalData || historicalData.length === 0 || !avgCost) {
      debug('No data for performance chart:', { hasHistorical: !!historicalData, avgCost });
      return null;
    }

    // Calcular diferencia respecto al avgCost para cada cierre
    const diffs = historicalData.map(bar => bar.close - avgCost);

    // Añadir precio actual como último punto si está disponible
    if (currentPrice) {
      diffs[diffs.length - 1] = currentPrice - avgCost;
    }

    const currentDiff = diffs[diffs.length - 1];
    const currentValue = currentPrice || historicalData[historicalData.length - 1]?.close;

    // Calcular ganancia total
    const totalGain = currentDiff * quantity;
    const totalGainPercent = avgCost > 0 ? (currentDiff / avgCost) * 100 : 0;

    debug(`Performance calc: avgCost=${avgCost}, currentPrice=${currentValue}, diff=${currentDiff.toFixed(2)}, gain=${totalGain.toFixed(2)}`);

    return {
      diffs,
      totalGain,
      totalGainPercent,
      isPositive: totalGain >= 0,
    };
  }, [historicalData, avgCost, quantity, currentPrice]);

  // Calcular días desde compra
  const daysSincePurchase = useMemo(() => {
    return daysSince(purchaseDate);
  }, [purchaseDate]);

  // Renderizar las barras
  const chartLines = useMemo(() => {
    if (!performanceData) return [];
    return renderBars(performanceData.diffs, chartHeight, chartWidth);
  }, [performanceData, chartHeight, chartWidth]);

  // Si no hay datos, mostrar estado vacío mínimo
  if (!performanceData || chartLines.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="white" bold>{symbol}</Text>
        <Text color="gray">Sin datos de performance</Text>
      </Box>
    );
  }

  const { totalGain, totalGainPercent, isPositive } = performanceData;
  const gainColor = isPositive ? 'green' : 'red';
  const gainSign = isPositive ? '+' : '';

  return (
    <Box flexDirection="column">
      {/* Header: GOOG  +$287 +15.2%  47d */}
      <Box marginBottom={1}>
        <Text color="white" bold>{symbol}</Text>
        <Text>  </Text>
        <Text color={gainColor} bold>
          {gainSign}{formatMoney(totalGain)} {gainSign}{formatPercent(Math.abs(totalGainPercent))}
        </Text>
        {daysSincePurchase !== null && (
          <>
            <Text>  </Text>
            <Text color="gray">{formatDuration(daysSincePurchase)}</Text>
          </>
        )}
      </Box>

      {/* Gráfico de barras */}
      <Box flexDirection="column">
        {chartLines.map((line, idx) => (
          <Text key={idx} color={line.color}>
            {line.text}
          </Text>
        ))}
      </Box>

      {/* Indicador sutil del precio de compra */}
      <Box marginTop={0}>
        <Text color="gray">compra: {formatMoney(avgCost)}</Text>
      </Box>
    </Box>
  );
}

export default PerformanceChart;
