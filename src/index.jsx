#!/usr/bin/env node
import 'dotenv/config';
import React from 'react';
import { render } from 'ink';
import App from './components/App.jsx';

// Parse arguments
const args = process.argv.slice(2);
const paperTrading = args.includes('--paper') || args.includes('-p');
const showHelp = args.includes('--help') || args.includes('-h');
const debugMode = args.includes('--debug') || args.includes('-d');

// Export debug mode globally
global.DEBUG_MODE = debugMode;

function debug(...args) {
  if (debugMode) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    console.log(`[${timestamp}] [DEBUG]`, ...args);
  }
}
global.debug = debug;

if (showHelp) {
  console.log(`
  Folio - Interactive Brokers Portfolio Manager

  Usage:
    npm start           Conectar a cuenta REAL (puerto 7496)
    npm start -- --paper    Conectar a cuenta PAPER (puerto 7497)

  Opciones:
    --paper, -p    Usar paper trading (puerto 7497)
    --debug, -d    Modo debug con logs detallados
    --help, -h     Mostrar esta ayuda

  Navegación:
    ↑↓         Navegar posiciones
    Enter      Ver detalle de posición
    b          Comprar
    s          Vender (en detalle)
    /          Buscar símbolo
    r          Refrescar datos
    Esc        Volver
    q          Salir

  Requisitos:
    - TWS o IB Gateway abierto
    - API habilitada en Settings > API
    - Puerto 7496 (live) o 7497 (paper)
  `);
  process.exit(0);
}

// Check if terminal supports interactive mode
if (!process.stdin.isTTY) {
  console.log(`
  Este CLI necesita ejecutarse en una terminal interactiva.

  Ejecutá directamente:
    npx tsx src/index.jsx

  O:
    npm start
  `);
  process.exit(1);
}

// Clear screen
console.clear();

// Render app
const { waitUntilExit } = render(
  <App paperTrading={paperTrading} />
);

waitUntilExit().then(() => {
  console.log('\n');
  process.exit(0);
});
