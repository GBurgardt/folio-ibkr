#!/usr/bin/env node
/**
 * Folio Mobile Server
 *
 * Servidor independiente que:
 * - Se conecta a IB con clientId 1 (separado del terminal que usa clientId 0)
 * - Sirve una PWA para iOS/Android
 * - Comunica via WebSocket en tiempo real
 *
 * Uso: npm run server
 */

import 'dotenv/config';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { WebSocketServer } from 'ws';

import { IBConnection } from './lib/ib-connection.js';
import { PortfolioManager } from './lib/portfolio.js';
import { TradeExecutor } from './lib/trade.js';
import { loadFavorites } from './lib/favorites.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  port: parseInt(process.env.MOBILE_PORT || '7500', 10),
  ibHost: process.env.IB_HOST || '127.0.0.1',
  ibPort: parseInt(process.env.IB_PORT || '7496', 10),
  ibClientId: 1, // Separado del terminal (que usa 0)
};

// ═══════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════

function log(category, ...args) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  console.log(`[${timestamp}] [${category}]`, ...args);
}

// ═══════════════════════════════════════════════════════════════
// SERVIDOR HTTPS + EXPRESS
// ═══════════════════════════════════════════════════════════════

const app = express();

// Servir archivos estáticos (PWA)
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', connected: ibConnection?.isConnected() || false });
});

// Cargar certificados SSL
let httpsOptions;
try {
  httpsOptions = {
    key: fs.readFileSync(path.join(__dirname, 'certs', 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'certs', 'cert.pem')),
  };
  log('SERVER', 'SSL certificates loaded');
} catch (err) {
  console.error('\n╔════════════════════════════════════════════════════════════╗');
  console.error('║  ERROR: SSL certificates not found                         ║');
  console.error('║                                                            ║');
  console.error('║  Run this command to generate them:                        ║');
  console.error('║                                                            ║');
  console.error('║  npm run server:setup                                      ║');
  console.error('║                                                            ║');
  console.error('╚════════════════════════════════════════════════════════════╝\n');
  process.exit(1);
}

const server = https.createServer(httpsOptions, app);

// ═══════════════════════════════════════════════════════════════
// WEBSOCKET
// ═══════════════════════════════════════════════════════════════

const wss = new WebSocketServer({ server });
const clients = new Set();

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(data);
    }
  }
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  log('WS', `Client connected from ${ip}`);
  clients.add(ws);

  // Send initial state
  sendFullState(ws);

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      log('WS', `Message received:`, message);
      await handleClientMessage(ws, message);
    } catch (err) {
      log('WS', `Error parsing message:`, err.message);
    }
  });

  ws.on('close', () => {
    log('WS', `Client disconnected`);
    clients.delete(ws);
  });

  ws.on('error', (err) => {
    log('WS', `Error WebSocket:`, err.message);
    clients.delete(ws);
  });
});

// ═══════════════════════════════════════════════════════════════
// CONEXIÓN IB
// ═══════════════════════════════════════════════════════════════

let ibConnection = null;
let portfolioManager = null;
let tradeExecutor = null;

async function initializeIB() {
  log('IB', 'Initializing Interactive Brokers connection...');
  log('IB', `Host: ${CONFIG.ibHost}, Port: ${CONFIG.ibPort}, ClientId: ${CONFIG.ibClientId}`);

  ibConnection = new IBConnection({
    host: CONFIG.ibHost,
    port: CONFIG.ibPort,
    clientId: CONFIG.ibClientId,
  });

  // Eventos de conexión
  ibConnection.on('connected', () => {
    log('IB', 'Connected to TWS');
    broadcast({ type: 'CONNECTION', status: 'connected' });

    // Iniciar managers
    portfolioManager = new PortfolioManager(ibConnection);
    tradeExecutor = new TradeExecutor(ibConnection);

    // Cargar portfolio inicial
    refreshPortfolio();
  });

  ibConnection.on('disconnected', () => {
    log('IB', 'Disconnected from TWS');
    broadcast({ type: 'CONNECTION', status: 'disconnected' });
  });

  ibConnection.on('error', (err) => {
    log('IB', 'Error:', err.message);
  });

  // Conectar
  try {
    await ibConnection.connect();
  } catch (err) {
    log('IB', 'Connection error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// ESTADO Y MENSAJES
// ═══════════════════════════════════════════════════════════════

let currentState = {
  connected: false,
  total: 0,
  dayChange: 0,
  dayChangePercent: 0,
  cash: 0,
  positions: [],
  watchlist: [],
};

async function refreshPortfolio() {
  if (!portfolioManager) return;

  try {
    log('PORTFOLIO', 'Refreshing portfolio...');
    const { positions, accountData } = await portfolioManager.fetch();

    // Cargar favoritos
    const favorites = loadFavorites();

    // Calcular watchlist (favoritos que no tengo en portfolio)
    const ownedSymbols = new Set(positions.map(p => p.symbol));
    const watchlistSymbols = favorites.filter(s => !ownedSymbols.has(s));

    // Obtener precios de watchlist
    const watchlist = [];
    for (const symbol of watchlistSymbols) {
      try {
        const price = await portfolioManager.getPrice(symbol);
        watchlist.push({
          symbol,
          price: price.last || price.close || 0,
          change: price.changePercent || 0,
        });
      } catch (err) {
        log('PORTFOLIO', `Error fetching price for ${symbol}:`, err.message);
        watchlist.push({ symbol, price: 0, change: 0 });
      }
    }

    // Actualizar estado
    currentState = {
      connected: true,
      total: accountData.netLiquidation || 0,
      dayChange: accountData.dailyPnL || 0,
      dayChangePercent: accountData.netLiquidation > 0
        ? (accountData.dailyPnL / accountData.netLiquidation) * 100
        : 0,
      cash: accountData.availableFunds || accountData.totalCashValue || 0,
      positions: positions.map(p => ({
        symbol: p.symbol,
        value: p.marketValue || (p.quantity * p.avgCost),
        change: p.unrealizedPnLPercent || 0,
        quantity: p.quantity,
        avgCost: p.avgCost,
      })),
      watchlist,
    };

    log('PORTFOLIO', `Portfolio updated: $${currentState.total.toFixed(2)}, ${positions.length} positions`);

    // Broadcast to all clients
    broadcast({ type: 'STATE', ...currentState });

  } catch (err) {
    log('PORTFOLIO', 'Refresh error:', err.message);
  }
}

function sendFullState(ws) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'STATE', ...currentState }));
  }
}

async function handleClientMessage(ws, message) {
  const { type, symbol, amount, percent } = message;

  if (type === 'BUY') {
    log('TRADE', `Buy order: ${symbol} for $${amount}`);

    if (!tradeExecutor) {
      ws.send(JSON.stringify({ type: 'ORDER_FAIL', message: 'Not connected to IB' }));
      return;
    }

    try {
      // Calcular cantidad de acciones
      const price = await portfolioManager.getPrice(symbol);
      const currentPrice = price.last || price.close;
      if (!currentPrice) {
        ws.send(JSON.stringify({ type: 'ORDER_FAIL', message: 'Could not fetch price' }));
        return;
      }

      const quantity = Math.floor(amount / currentPrice);
      if (quantity <= 0) {
        ws.send(JSON.stringify({ type: 'ORDER_FAIL', message: 'Amount too low' }));
        return;
      }

      log('TRADE', `Buying ${quantity} shares of ${symbol} at ~$${currentPrice}`);
      const result = await tradeExecutor.buy(symbol, quantity);

      ws.send(JSON.stringify({
        type: 'ORDER_OK',
        action: 'BUY',
        symbol,
        quantity,
        message: result.warning ? 'Order submitted (market closed)' : 'Order filled'
      }));

      // Refrescar portfolio después de un momento
      setTimeout(refreshPortfolio, 2000);

    } catch (err) {
      log('TRADE', 'Buy error:', err.message);
      ws.send(JSON.stringify({ type: 'ORDER_FAIL', message: err.message }));
    }
  }

  if (type === 'SELL') {
    log('TRADE', `Sell order: ${symbol} ${percent}%`);

    if (!tradeExecutor) {
      ws.send(JSON.stringify({ type: 'ORDER_FAIL', message: 'Not connected to IB' }));
      return;
    }

    try {
      // Encontrar posición actual
      const position = currentState.positions.find(p => p.symbol === symbol);
      if (!position) {
        ws.send(JSON.stringify({ type: 'ORDER_FAIL', message: 'You do not own this position' }));
        return;
      }

      const quantity = Math.floor(position.quantity * (percent / 100));
      if (quantity <= 0) {
        ws.send(JSON.stringify({ type: 'ORDER_FAIL', message: 'Quantity too low' }));
        return;
      }

      log('TRADE', `Selling ${quantity} shares of ${symbol}`);
      const result = await tradeExecutor.sell(symbol, quantity);

      ws.send(JSON.stringify({
        type: 'ORDER_OK',
        action: 'SELL',
        symbol,
        quantity,
        message: result.warning ? 'Order submitted (market closed)' : 'Order filled'
      }));

      // Refrescar portfolio después de un momento
      setTimeout(refreshPortfolio, 2000);

    } catch (err) {
      log('TRADE', 'Sell error:', err.message);
      ws.send(JSON.stringify({ type: 'ORDER_FAIL', message: err.message }));
    }
  }

  if (type === 'REFRESH') {
    await refreshPortfolio();
  }
}

// ═══════════════════════════════════════════════════════════════
// ACTUALIZACIONES PERIÓDICAS
// ═══════════════════════════════════════════════════════════════

// Refrescar portfolio cada 30 segundos
setInterval(() => {
  if (ibConnection?.isConnected() && clients.size > 0) {
    refreshPortfolio();
  }
}, 30000);

// ═══════════════════════════════════════════════════════════════
// INICIAR SERVIDOR
// ═══════════════════════════════════════════════════════════════

server.listen(CONFIG.port, '0.0.0.0', () => {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║   📱  FOLIO MOBILE SERVER                                  ║');
  console.log('║                                                            ║');
  console.log(`║   URL:  https://localhost:${CONFIG.port}                        ║`);
  console.log('║                                                            ║');
  console.log('║   On your iPhone:                                          ║');
  console.log(`║   1. Open Safari → https://<your-mac-ip>:${CONFIG.port}          ║`);
  console.log('║   2. Accept the local certificate                          ║');
  console.log('║   3. Share → Add to Home Screen                            ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');

  // Print available IPs
  import('os').then(os => {
    const interfaces = os.networkInterfaces();
    console.log('Available IPs:');
    for (const [name, addrs] of Object.entries(interfaces)) {
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
          console.log(`  ${name}: https://${addr.address}:${CONFIG.port}`);
        }
      }
    }
    console.log('\n');
  });

  // Start IB connection
  initializeIB();
});

// ═══════════════════════════════════════════════════════════════
// MANEJO DE CIERRE
// ═══════════════════════════════════════════════════════════════

process.on('SIGINT', () => {
  log('SERVER', 'Shutting down...');
  if (ibConnection) {
    ibConnection.disconnect();
  }
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('SERVER', 'Shutting down...');
  if (ibConnection) {
    ibConnection.disconnect();
  }
  server.close();
  process.exit(0);
});
