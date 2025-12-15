import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { formatMoney } from '../utils/format.js';

export function BuyScreen({
  symbol,
  currentPrice,
  isEstimatedPrice = false,
  priceLoading,
  availableCash,
  pendingOrdersCount = 0,
  onConfirm,
  onCancel,
}) {
  const [quantity, setQuantity] = useState('');
  const [step, setStep] = useState('input'); // input, confirm
  const [error, setError] = useState(null);

  // Apply 5% buffer to match IB's conservative validation (commissions, spread, safety margin)
  const ORDER_COST_BUFFER = 1.05;
  const maxShares = currentPrice > 0 ? Math.floor(availableCash / (currentPrice * ORDER_COST_BUFFER)) : 0;
  const estimatedCost = quantity ? parseInt(quantity, 10) * currentPrice * ORDER_COST_BUFFER : 0;

  const handleSubmit = () => {
    const qty = quantity.toLowerCase() === 'max' ? maxShares : parseInt(quantity, 10);

    if (isNaN(qty) || qty <= 0) {
      setError('Enter a valid number');
      return;
    }

    if (qty > maxShares) {
      setError(`Max ${maxShares} shares with your available cash`);
      return;
    }

    setError(null);
    setQuantity(String(qty));
    setStep('confirm');
  };

  const handleConfirm = () => {
    const qty = parseInt(quantity, 10);
    onConfirm?.(symbol, qty);
  };

  useInput((input, key) => {
    if (key.escape) {
      if (step === 'confirm') {
        setStep('input');
      } else {
        onCancel?.();
      }
    } else if (key.return && step === 'confirm') {
      handleConfirm();
    }
  });

  if (priceLoading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box
          borderStyle="round"
          borderColor="blue"
          paddingX={2}
          paddingY={1}
        >
          <Text>Fetching price for {symbol}...</Text>
        </Box>
      </Box>
    );
  }

  if (!currentPrice) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box
          borderStyle="round"
          borderColor="red"
          paddingX={2}
          paddingY={1}
        >
          <Text color="red">Could not fetch price for {symbol}</Text>
        </Box>
      </Box>
    );
  }

  if (step === 'confirm') {
    const qty = parseInt(quantity, 10);
    const total = qty * currentPrice * ORDER_COST_BUFFER;

    return (
      <Box flexDirection="column" padding={1}>
        <Box
          borderStyle="round"
          borderColor="yellow"
          flexDirection="column"
          paddingX={2}
          paddingY={1}
        >
          <Text bold color="yellow">Confirm buy?</Text>
        </Box>

        <Box
          borderStyle="single"
          borderColor="gray"
          marginTop={1}
          flexDirection="column"
          paddingX={2}
          paddingY={1}
          gap={1}
        >
          <Box justifyContent="space-between">
            <Text color="gray">Quantity:</Text>
            <Text bold>{qty} × {symbol}</Text>
          </Box>

          <Box justifyContent="space-between">
            <Text color="gray">Est. price:</Text>
            <Text color={isEstimatedPrice ? 'yellow' : undefined}>
              {isEstimatedPrice ? '~' : ''}{formatMoney(currentPrice)}
            </Text>
          </Box>

          <Box justifyContent="space-between">
            <Text color="gray">Est. total:</Text>
            <Text bold color="white">{formatMoney(total)}</Text>
          </Box>

          <Text color="gray" dimColor>Includes a 5% buffer (spread + fees)</Text>

          {isEstimatedPrice && (
            <Text color="yellow" dimColor>Close price (market closed)</Text>
          )}
        </Box>

        {/* Footer */}
        <Box marginTop={1}>
          <Text color="gray">Enter </Text>
          <Text color="white">confirm</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box
        borderStyle="round"
        borderColor="blue"
        paddingX={2}
        paddingY={1}
      >
        <Text bold>Buy {symbol}</Text>
      </Box>

      {/* Info */}
      <Box
        borderStyle="single"
        borderColor="gray"
        marginTop={1}
        flexDirection="column"
        paddingX={2}
        paddingY={1}
        gap={1}
      >
        <Box justifyContent="space-between">
          <Text color="gray">Available cash{pendingOrdersCount > 0 ? '*' : ''}:</Text>
          <Text color="green">{formatMoney(availableCash)}</Text>
        </Box>

        {pendingOrdersCount > 0 && (
          <Box>
            <Text color="gray" dimColor>*excluding {pendingOrdersCount} pending order{pendingOrdersCount > 1 ? 's' : ''}</Text>
          </Box>
        )}

        <Box justifyContent="space-between">
          <Text color="gray">{isEstimatedPrice ? 'Estimated price:' : 'Current price:'}</Text>
          <Text color={isEstimatedPrice ? 'yellow' : undefined}>
            {isEstimatedPrice ? '~' : ''}{formatMoney(currentPrice)}
          </Text>
        </Box>

        <Box justifyContent="space-between">
          <Text color="gray">Max:</Text>
          <Text>{maxShares} shares</Text>
        </Box>
      </Box>

      {/* Input */}
      <Box
        borderStyle="single"
        borderColor="blue"
        marginTop={1}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        gap={1}
      >
        <Box>
          <Text color="gray">Quantity: </Text>
          <TextInput
            value={quantity}
            onChange={setQuantity}
            onSubmit={handleSubmit}
            placeholder="e.g. 10 or 'max'"
          />
        </Box>

        {quantity && !isNaN(parseInt(quantity, 10)) && (
          <Box>
            <Text color="gray">
              Est. cost: {formatMoney(parseInt(quantity, 10) * currentPrice * ORDER_COST_BUFFER)}
            </Text>
          </Box>
        )}

        {error && (
          <Text color="red">{error}</Text>
        )}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray">Enter </Text>
        <Text color="white">continue</Text>
      </Box>
    </Box>
  );
}

export default BuyScreen;
