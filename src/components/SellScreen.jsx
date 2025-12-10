import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { formatMoney } from '../utils/format.js';

export function SellScreen({
  symbol,
  currentPrice,
  isEstimatedPrice = false,
  priceLoading,
  ownedQuantity,
  onConfirm,
  onCancel,
}) {
  const [quantity, setQuantity] = useState('');
  const [step, setStep] = useState('input'); // input, confirm
  const [error, setError] = useState(null);

  const estimatedProceeds = quantity ? parseInt(quantity, 10) * (currentPrice || 0) : 0;

  const handleSubmit = () => {
    const qty = quantity.toLowerCase() === 'all' ? ownedQuantity : parseInt(quantity, 10);

    if (isNaN(qty) || qty <= 0) {
      setError('Ingresá un número válido');
      return;
    }

    if (qty > ownedQuantity) {
      setError(`Solo tenés ${ownedQuantity} acciones`);
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
          <Text>Obteniendo precio de {symbol}...</Text>
        </Box>
      </Box>
    );
  }

  if (step === 'confirm') {
    const qty = parseInt(quantity, 10);
    const total = qty * (currentPrice || 0);

    return (
      <Box flexDirection="column" padding={1}>
        <Box
          borderStyle="round"
          borderColor="yellow"
          flexDirection="column"
          paddingX={2}
          paddingY={1}
        >
          <Text bold color="yellow">¿Confirmar venta?</Text>
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
            <Text color="gray">Cantidad:</Text>
            <Text bold>{qty} × {symbol}</Text>
          </Box>

          <Box justifyContent="space-between">
            <Text color="gray">Precio aprox:</Text>
            <Text color={isEstimatedPrice ? 'yellow' : undefined}>
              {isEstimatedPrice ? '~' : ''}{formatMoney(currentPrice)}
            </Text>
          </Box>

          <Box justifyContent="space-between">
            <Text color="gray">Recibirás aprox:</Text>
            <Text bold color="green">{formatMoney(total)}</Text>
          </Box>

          {isEstimatedPrice && (
            <Text color="yellow" dimColor>Precio de cierre (mercado cerrado)</Text>
          )}
        </Box>

        {/* Footer */}
        <Box marginTop={1}>
          <Text color="gray">Enter </Text>
          <Text color="white">confirmar</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box
        borderStyle="round"
        borderColor="red"
        paddingX={2}
        paddingY={1}
      >
        <Text bold color="red">Vender {symbol}</Text>
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
          <Text color="gray">Tenés:</Text>
          <Text>{ownedQuantity} acciones</Text>
        </Box>

        <Box justifyContent="space-between">
          <Text color="gray">{isEstimatedPrice ? 'Precio estimado:' : 'Precio actual:'}</Text>
          <Text color={isEstimatedPrice ? 'yellow' : undefined}>
            {currentPrice ? (isEstimatedPrice ? '~' : '') + formatMoney(currentPrice) : '--'}
          </Text>
        </Box>

        <Box justifyContent="space-between">
          <Text color="gray">Valor total:</Text>
          <Text>{currentPrice ? formatMoney(ownedQuantity * currentPrice) : '--'}</Text>
        </Box>
      </Box>

      {/* Input */}
      <Box
        borderStyle="single"
        borderColor="red"
        marginTop={1}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        gap={1}
      >
        <Box>
          <Text color="gray">Cantidad a vender: </Text>
          <TextInput
            value={quantity}
            onChange={setQuantity}
            onSubmit={handleSubmit}
            placeholder="Ej: 5 o 'all'"
          />
        </Box>

        {quantity && !isNaN(parseInt(quantity, 10)) && currentPrice && (
          <Box>
            <Text color="gray">
              Recibirás aprox: {formatMoney(parseInt(quantity, 10) * currentPrice)}
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
        <Text color="white">continuar</Text>
      </Box>
    </Box>
  );
}

export default SellScreen;
