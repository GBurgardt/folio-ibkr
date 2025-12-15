#!/usr/bin/env bun
/**
 * FOLIO TUI - Interactive Brokers Portfolio Manager
 *
 * Built with OpenTUI for that cyberpunk terminal aesthetic.
 */

import 'dotenv/config';
import { App } from './app/App';
import { UIRenderer } from './ui/Renderer';

// Parse arguments
const args = process.argv.slice(2);
const paperTrading = args.includes('--paper') || args.includes('-p');
const showHelp = args.includes('--help') || args.includes('-h');
const debugMode = args.includes('--debug') || args.includes('-d');

// Export debug mode globally
(global as any).DEBUG_MODE = debugMode;

function debug(...args: any[]) {
  if (debugMode) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    console.log(`[${timestamp}] [DEBUG]`, ...args);
  }
}
(global as any).debug = debug;

if (showHelp) {
  console.log(`
  Folio TUI - Interactive Brokers Portfolio Manager

  Usage:
    bun start              Connect to LIVE (port 7496)
    bun start -- --paper   Connect to PAPER (port 7497)

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
    bun run src/index.ts

  Or:
    bun start
  `);
  process.exit(1);
}

console.log('[FOLIO-TUI] Starting app...');
console.log('[FOLIO-TUI] Paper trading:', paperTrading ? 'YES (port 7497)' : 'NO (port 7496)');

async function main() {
  // Import createCliRenderer directly to test
  const { createCliRenderer, TextRenderable, BoxRenderable, SelectRenderable, SelectRenderableEvents } = await import("@opentui/core");

  console.log('[FOLIO-TUI] Creating renderer...');

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    targetFps: 60,
  });

  console.log('[FOLIO-TUI] Renderer created!');
  console.log('[FOLIO-TUI] Screen:', renderer.width, 'x', renderer.height);

  // Simple UI
  const header = new BoxRenderable(renderer, {
    id: 'header',
    width: renderer.width - 2,
    height: 4,
    backgroundColor: '#1a1a2e',
    borderStyle: 'round',
    borderColor: '#4a9eff',
    position: 'absolute',
    left: 1,
    top: 0,
  });

  const title = new TextRenderable(renderer, {
    id: 'title',
    content: '  FOLIO TUI - Connecting to TWS...',
    fg: '#ffffff',
    position: 'absolute',
    left: 2,
    top: 1,
  });

  const status = new TextRenderable(renderer, {
    id: 'status',
    content: ' [q] Quit',
    fg: '#888888',
    position: 'absolute',
    left: 0,
    top: renderer.height - 1,
  });

  renderer.root.add(header);
  renderer.root.add(title);
  renderer.root.add(status);

  console.log('[FOLIO-TUI] Basic UI ready');

  // Now create app
  console.log('[FOLIO-TUI] Creating App...');
  const app = new App({ paperTrading });

  // Update UI on state change
  app.on('stateChange', () => {
    const state = app.state;
    if (state.connectionStatus === 'connected') {
      title.content = `  FOLIO TUI - Connected | ${state.accountId || ''}`;
      title.fg = '#00ff00';
    } else if (state.connectionStatus === 'error') {
      title.content = `  ERROR: ${state.connectionError}`;
      title.fg = '#ff4444';
    }
  });

  app.on('quit', () => {
    renderer.stop();
    process.exit(0);
  });

  // Keyboard
  renderer.keyInput.on('keypress', (key: any) => {
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      renderer.stop();
      process.exit(0);
    }
    if (key.name === 'r' && app.state.screen === 'error') {
      app.retry();
    }
  });

  console.log('[FOLIO-TUI] Connecting to IB...');

  // Connect after a small delay
  setTimeout(() => {
    app.connect();
  }, 500);
}

main().catch((err) => {
  console.error('[FOLIO-TUI] Error fatal:', err);
  process.exit(1);
});
