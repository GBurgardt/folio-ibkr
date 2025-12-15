/**
 * FOLIO TUI - Application State & Navigation
 *
 * Maneja el estado global de la aplicación y la navegación entre pantallas.
 * Replica exactamente el comportamiento del App.jsx original.
 */

import { EventEmitter } from 'events';
import { IBConnection } from '../lib/ib-connection';
import { PortfolioManager, Position, AccountData, PortfolioData } from '../lib/portfolio';

// Screen types
export type Screen =
  | 'connecting'
  | 'error'
  | 'portfolio'
  | 'chart'
  | 'buy'
  | 'sell'
  | 'search'
  | 'activity'
  | 'orders'
  | 'order-result';

// Screen name translations
export const SCREEN_NAMES: Record<Screen, string> = {
  connecting: 'connecting',
  error: 'error',
  portfolio: 'home',
  chart: 'chart',
  buy: 'buy',
  sell: 'sell',
  search: 'search',
  activity: 'activity',
  orders: 'orders',
  'order-result': 'result',
};

export interface AppState {
  // Navigation
  navStack: Screen[];
  screen: Screen;

  // Connection
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  connectionError: string | null;
  accountId: string | null;

  // Portfolio
  positions: Position[];
  accountData: AccountData;
  portfolioLoading: boolean;

  // Prices (symbol -> price)
  prices: Map<string, number>;

  // Selection
  selectedIndex: number;

  // Chart context
  chartSymbol: string | null;
  chartPosition: Position | null;

  // Buy/Sell context
  buySymbol: string | null;
  sellData: { symbol: string; quantity: number } | null;

  // Order result
  lastOrderResult: any | null;

  // Pending orders count
  pendingOrdersCount: number;
}

function log(...args: any[]) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  console.log(`[${timestamp}] [APP]`, ...args);
}

export class App extends EventEmitter {
  private ibConnection: IBConnection;
  private portfolioManager: PortfolioManager;

  state: AppState;

  constructor(options: { paperTrading?: boolean } = {}) {
    super();

    const port = options.paperTrading ? 7497 : 7496;
    log('App initialized with port:', port);

    this.ibConnection = new IBConnection({ port });
    this.portfolioManager = new PortfolioManager(this.ibConnection);

    this.state = {
      navStack: ['connecting'],
      screen: 'connecting',
      connectionStatus: 'disconnected',
      connectionError: null,
      accountId: null,
      positions: [],
      accountData: {
        netLiquidation: 0,
        totalCashValue: 0,
        availableFunds: 0,
        buyingPower: 0,
        dailyPnL: 0,
      },
      portfolioLoading: false,
      prices: new Map(),
      selectedIndex: 0,
      chartSymbol: null,
      chartPosition: null,
      buySymbol: null,
      sellData: null,
      lastOrderResult: null,
      pendingOrdersCount: 0,
    };

    // Setup connection events
    this.ibConnection.on('connected', () => {
      log('IB connected');
      this.state.connectionStatus = 'connected';
      this.navigateTo('portfolio');
      this.refreshPortfolio();
      this.emit('stateChange');
    });

    this.ibConnection.on('account', (accountId: string) => {
      log('Account received:', accountId);
      this.state.accountId = accountId;
      this.emit('stateChange');
    });

    this.ibConnection.on('disconnected', () => {
      log('IB disconnected');
      this.state.connectionStatus = 'disconnected';
      this.emit('stateChange');
    });

    this.ibConnection.on('error', (err: Error) => {
      log('IB error:', err.message);
      this.state.connectionError = err.message;
      this.state.connectionStatus = 'error';
      this.state.navStack = ['error'];
      this.state.screen = 'error';
      this.emit('stateChange');
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // CONNECTION
  // ═══════════════════════════════════════════════════════════════

  async connect(): Promise<void> {
    log('Connecting...');
    this.state.connectionStatus = 'connecting';
    this.emit('stateChange');

    try {
      await this.ibConnection.connect();
    } catch (err: any) {
      log('Connection failed:', err.message);
      this.state.connectionError = err.message;
      this.state.connectionStatus = 'error';
      this.state.navStack = ['error'];
      this.state.screen = 'error';
      this.emit('stateChange');
    }
  }

  disconnect(): void {
    log('Disconnecting...');
    this.ibConnection.disconnect();
  }

  // ═══════════════════════════════════════════════════════════════
  // NAVIGATION
  // ═══════════════════════════════════════════════════════════════

  navigateTo(screen: Screen): void {
    log('navigateTo:', screen, 'from stack:', this.state.navStack);
    this.state.navStack = [...this.state.navStack, screen];
    this.state.screen = screen;
    this.emit('stateChange');
  }

  navigateBack(): void {
    log('navigateBack, current stack:', this.state.navStack);
    if (this.state.navStack.length > 1) {
      this.state.navStack = this.state.navStack.slice(0, -1);
      this.state.screen = this.state.navStack[this.state.navStack.length - 1];
      this.emit('stateChange');
    }
  }

  navigateHome(): void {
    log('navigateHome - clearing stack');
    this.state.navStack = ['portfolio'];
    this.state.screen = 'portfolio';
    this.state.chartSymbol = null;
    this.state.chartPosition = null;
    this.state.buySymbol = null;
    this.state.sellData = null;
    this.state.selectedIndex = 0;
    this.emit('stateChange');
  }

  // ═══════════════════════════════════════════════════════════════
  // PORTFOLIO
  // ═══════════════════════════════════════════════════════════════

  async refreshPortfolio(): Promise<void> {
    if (!this.ibConnection.isConnected()) {
      log('Cannot refresh portfolio - not connected');
      return;
    }

    log('Refreshing portfolio...');
    this.state.portfolioLoading = true;
    this.emit('stateChange');

    try {
      const data = await this.portfolioManager.fetch();
      this.state.positions = data.positions;
      this.state.accountData = data.accountData;
      log('Portfolio refreshed:', data.positions.length, 'positions');
    } catch (err: any) {
      log('Portfolio refresh error:', err.message);
    } finally {
      this.state.portfolioLoading = false;
      this.emit('stateChange');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // COMPUTED VALUES
  // ═══════════════════════════════════════════════════════════════

  get computed() {
    const { positions, accountData, prices } = this.state;

    let totalValue = 0;
    let totalCost = 0;

    for (const pos of positions) {
      const currentPrice = prices.get(pos.symbol) || pos.avgCost;
      const value = pos.quantity * currentPrice;
      const cost = pos.quantity * pos.avgCost;
      totalValue += value;
      totalCost += cost;
    }

    const totalGain = totalValue - totalCost;
    const gainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
    const cash = accountData.totalCashValue;

    return {
      totalValue,
      totalCost,
      totalGain,
      gainPercent,
      cash,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // SELECTION
  // ═══════════════════════════════════════════════════════════════

  selectUp(): void {
    if (this.state.selectedIndex > 0) {
      this.state.selectedIndex--;
      this.emit('stateChange');
    }
  }

  selectDown(): void {
    const maxIndex = this.state.positions.length; // positions + cash row
    if (this.state.selectedIndex < maxIndex) {
      this.state.selectedIndex++;
      this.emit('stateChange');
    }
  }

  selectItem(): void {
    const { screen, selectedIndex, positions } = this.state;

    if (screen === 'portfolio') {
      if (selectedIndex < positions.length) {
        // View chart for selected position
        const position = positions[selectedIndex];
        this.viewChart(position);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════

  viewChart(symbolOrPosition: string | Position): void {
    const isPosition = typeof symbolOrPosition === 'object';
    const symbol = isPosition ? (symbolOrPosition as Position).symbol : symbolOrPosition as string;
    const position = isPosition ? symbolOrPosition as Position : null;

    log('Viewing chart for:', symbol);

    this.state.chartSymbol = symbol;
    this.state.chartPosition = position;
    this.navigateTo('chart');
  }

  buy(symbol?: string): void {
    const { selectedIndex, positions, screen } = this.state;

    if (symbol) {
      this.state.buySymbol = symbol;
      this.navigateTo('buy');
      return;
    }

    if (screen === 'portfolio' && selectedIndex < positions.length) {
      this.state.buySymbol = positions[selectedIndex].symbol;
      this.navigateTo('buy');
    } else {
      this.search();
    }
  }

  sell(symbol: string, quantity: number): void {
    log('Selling:', symbol, quantity);
    this.state.sellData = { symbol, quantity };
    this.navigateTo('sell');
  }

  search(): void {
    log('Opening search');
    this.navigateTo('search');
  }

  activity(): void {
    log('Opening activity');
    this.navigateTo('activity');
  }

  orders(): void {
    log('Opening orders');
    this.navigateTo('orders');
  }

  retry(): void {
    log('Retrying connection');
    this.state.navStack = ['connecting'];
    this.state.screen = 'connecting';
    this.state.connectionError = null;
    this.emit('stateChange');
    this.connect();
  }

  quit(): void {
    log('Quitting');
    this.disconnect();
    this.emit('quit');
  }

  // ═══════════════════════════════════════════════════════════════
  // KEY HANDLING
  // ═══════════════════════════════════════════════════════════════

  handleKey(key: { name: string; ctrl?: boolean; shift?: boolean }): void {
    const { screen, portfolioLoading } = this.state;

    log('Key pressed:', key.name);

    // Global quit
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      this.quit();
      return;
    }

    // Screen-specific handlers
    switch (screen) {
      case 'error':
        if (key.name === 'r') this.retry();
        break;

      case 'portfolio':
        if (portfolioLoading) return;

        if (key.name === 'up') this.selectUp();
        else if (key.name === 'down') this.selectDown();
        else if (key.name === 'return') this.selectItem();
        else if (key.name === 'b') this.buy();
        else if (key.name === '/') this.search();
        else if (key.name === 'a') this.activity();
        else if (key.name === 'o') this.orders();
        else if (key.name === 'r') this.refreshPortfolio();
        break;

      case 'chart':
        if (key.name === 'escape' || key.name === 'left') this.navigateBack();
        else if (key.name === 'b') {
          if (this.state.chartSymbol) this.buy(this.state.chartSymbol);
        }
        else if (key.name === 's') {
          if (this.state.chartPosition) {
            this.sell(this.state.chartPosition.symbol, this.state.chartPosition.quantity);
          }
        }
        break;

      case 'buy':
      case 'sell':
      case 'search':
      case 'activity':
      case 'orders':
        if (key.name === 'escape') this.navigateBack();
        break;

      case 'order-result':
        if (key.name === 'return') {
          this.state.lastOrderResult = null;
          this.navigateHome();
          this.refreshPortfolio();
        }
        break;
    }
  }
}

export default App;
