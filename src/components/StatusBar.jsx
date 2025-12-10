import React from 'react';
import { Box, Text } from 'ink';

const shortcuts = {
  portfolio: [
    { key: '↑↓', label: 'Navegar' },
    { key: 'Enter', label: 'Detalles' },
    { key: 'b', label: 'Comprar' },
    { key: '/', label: 'Buscar' },
    { key: 'a', label: 'Actividad' },
    { key: 'o', label: 'Órdenes', showBadge: true },
    { key: 'q', label: 'Salir' },
  ],
  chart: [
    { key: '↑↓', label: 'Período' },
    { key: 'b', label: 'Comprar' },
    { key: '←', label: 'Volver' },
  ],
  buy: [
    { key: 'Enter', label: 'Confirmar' },
    { key: 'Esc', label: 'Cancelar' },
  ],
  search: [
    { key: 'Enter', label: 'Seleccionar' },
    { key: 'Esc', label: 'Volver' },
  ],
  confirm: [
    { key: 'Enter', label: 'Sí' },
    { key: 'Esc', label: 'No' },
  ],
};

export function StatusBar({ screen = 'portfolio', pendingOrdersCount = 0 }) {
  const items = shortcuts[screen] || shortcuts.portfolio;

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      marginTop={1}
    >
      <Box flexDirection="row" gap={2}>
        {items.map((item, i) => (
          <Box key={i} gap={1}>
            <Text color="cyan">[{item.key}]</Text>
            <Text color="gray">{item.label}</Text>
            {item.showBadge && pendingOrdersCount > 0 && (
              <Text color="yellow" bold>({pendingOrdersCount})</Text>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default StatusBar;
