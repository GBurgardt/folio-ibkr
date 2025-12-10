import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { humanizeWarning } from '../hooks/useTrade.js';

export function Loading({ message = 'Cargando...' }) {
  return (
    <Box flexDirection="column" padding={2} alignItems="center" justifyContent="center">
      <Box gap={2}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text color="gray">{message}</Text>
      </Box>
    </Box>
  );
}

export function ConnectionError({ error, onRetry }) {
  return (
    <Box flexDirection="column" padding={2}>
      <Box
        borderStyle="round"
        borderColor="red"
        flexDirection="column"
        paddingX={2}
        paddingY={1}
      >
        <Text bold color="red">No se pudo conectar</Text>
        <Text color="gray" wrap="wrap">{error}</Text>
      </Box>

      <Box marginTop={2} flexDirection="column" paddingX={1}>
        <Text color="gray">Para usar Folio necesitás:</Text>
        <Text color="gray">  1. TWS o IB Gateway abierto</Text>
        <Text color="gray">  2. API habilitada en Settings {'>'} API {'>'} Enable</Text>
        <Text color="gray">  3. Puerto 7496 (live) o 7497 (paper)</Text>
      </Box>

      <Box marginTop={2} paddingX={1}>
        <Text color="cyan">[r] Reintentar  [q] Salir</Text>
      </Box>
    </Box>
  );
}

export function OrderResult({ result, onContinue }) {
  const isFilled = result.status === 'Filled';
  const isSubmitted = result.status === 'Submitted' || result.status === 'PreSubmitted';
  const isRejected = result.status === 'Inactive' || result.status === 'Cancelled';
  const isSuccess = isFilled || isSubmitted;
  const hasWarning = result.warning;
  const warningText = humanizeWarning(result.warning);

  // Determine the main message
  let statusMessage = 'Orden enviada';
  let statusColor = 'yellow';

  if (isRejected) {
    statusMessage = '✗ Orden rechazada';
    statusColor = 'red';
  } else if (isFilled) {
    statusMessage = '✓ Orden ejecutada';
    statusColor = 'green';
  } else if (isSubmitted) {
    statusMessage = '✓ Orden enviada';
    statusColor = 'green';
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Main status - clean, no border */}
      <Box marginBottom={1}>
        <Text bold color={statusColor}>{statusMessage}</Text>
      </Box>

      {/* Order details - minimal */}
      <Box flexDirection="column" marginBottom={1}>
        {result.filled > 0 && result.avgFillPrice && (
          <Box>
            <Text color="gray">{result.filled} × </Text>
            <Text color="white">${result.avgFillPrice.toFixed(2)}</Text>
          </Box>
        )}

        {(!result.filled || result.filled === 0) && isSubmitted && (
          <Box>
            <Text color="gray">Orden #{result.orderId}</Text>
          </Box>
        )}
      </Box>

      {/* Rejection reason */}
      {isRejected && result.rejectionReason && (
        <Box marginBottom={1}>
          <Text color="red" dimColor>{result.rejectionReason}</Text>
        </Box>
      )}

      {/* Warning note - if any */}
      {warningText && !isRejected && (
        <Box marginBottom={1}>
          <Text color="yellow">⏰ {warningText}</Text>
        </Box>
      )}

      {/* Continue action */}
      <Box marginTop={1}>
        <Text color="gray">Enter </Text>
        <Text color="white">continuar</Text>
      </Box>
    </Box>
  );
}

export default Loading;
