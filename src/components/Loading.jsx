import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { humanizeWarning } from '../hooks/useTrade.js';

export function Loading({ message = 'Loading...' }) {
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
        <Text bold color="red">Could not connect</Text>
        <Text color="gray" wrap="wrap">{error}</Text>
      </Box>

      <Box marginTop={2} flexDirection="column" paddingX={1}>
        <Text color="gray">To use Folio you need:</Text>
        <Text color="gray">  1. TWS or IB Gateway running</Text>
        <Text color="gray">  2. API enabled in Settings {'>'} API {'>'} Settings</Text>
        <Text color="gray">  3. Port 7496 (live) or 7497 (paper)</Text>
      </Box>

      <Box marginTop={2} paddingX={1}>
        <Text color="cyan">[r] Retry  [q] Quit</Text>
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
  let statusMessage = 'Order submitted';
  let statusColor = 'yellow';

  if (isRejected) {
    statusMessage = '✗ Order rejected';
    statusColor = 'red';
  } else if (isFilled) {
    statusMessage = '✓ Order filled';
    statusColor = 'green';
  } else if (isSubmitted) {
    statusMessage = '✓ Order submitted';
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
            <Text color="gray">Order #{result.orderId}</Text>
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
        <Text color="white">continue</Text>
      </Box>
    </Box>
  );
}

export default Loading;
