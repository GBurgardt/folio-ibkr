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
  Folio — Interactive Brokers Portfolio Manager (TUI)

  Usage:
    npm start                 Connect to LIVE (port 7496)
    npm start -- --paper      Connect to PAPER (port 7497)
    npx tsx src/index.jsx     Run directly (dev)

  Options:
    --paper, -p    Use paper trading (port 7497)
    --debug, -d    Debug logs
    --help, -h     Show help

  Navigation:
    ↑↓         Move selection
    Enter      Open position details
    b          Buy
    s          Sell (in details)
    /          Search symbol
    g          Portfolio report
    r          Refresh
    Esc        Back
    q          Quit

  Requirements:
    - TWS or IB Gateway running
    - API enabled (Settings > API)
    - Port 7496 (live) or 7497 (paper)
  `);
  process.exit(0);
}

// Check if terminal supports interactive mode
if (!process.stdin.isTTY) {
  console.log(`
  This CLI must run in an interactive terminal (TTY).

  Run:
    npx tsx src/index.jsx

  Or:
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
