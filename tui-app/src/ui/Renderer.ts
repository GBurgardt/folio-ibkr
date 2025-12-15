/**
 * FOLIO TUI - UI Renderer
 *
 * Renderiza la interfaz usando OpenTUI basándose en el estado de App
 * SIMPLIFICADO - Sin ocultar/mostrar elementos dinámicamente
 */

import {
  createCliRenderer,
  TextRenderable,
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  type CliRenderer,
} from "@opentui/core";

import { App, AppState, Screen } from '../app/App';
import { formatMoney, formatPercent, padRight, padLeft } from '../utils/format';

// Colors
const COLORS = {
  primary: '#4a9eff',
  secondary: '#666666',
  success: '#00ff00',
  danger: '#ff4444',
  warning: '#ffaa00',
  muted: '#888888',
  bg: '#1a1a2e',
  text: '#ffffff',
};

function log(...args: any[]) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  console.log(`[${timestamp}] [RENDERER]`, ...args);
}

export class UIRenderer {
  private app: App;
  private renderer: CliRenderer | null = null;

  // UI Elements
  private header: BoxRenderable | null = null;
  private headerValue: TextRenderable | null = null;
  private headerGain: TextRenderable | null = null;
  private positionsList: SelectRenderable | null = null;
  private statusBar: TextRenderable | null = null;
  private messageText: TextRenderable | null = null;

  constructor(app: App) {
    this.app = app;
  }

  async init(): Promise<void> {
    log('Creating CLI renderer...');

    this.renderer = await createCliRenderer({
      exitOnCtrlC: false,
      targetFps: 60,
    });

    log('Renderer created, building UI...');
    this.buildUI();
    this.setupKeyHandlers();

    // Listen to app state changes
    this.app.on('stateChange', () => this.updateUI());
    this.app.on('quit', () => this.stop());

    // Initial UI update
    this.updateUI();

    log('Renderer ready');
  }

  stop(): void {
    log('Stopping renderer...');
    if (this.renderer) {
      this.renderer.stop();
    }
    process.exit(0);
  }

  private buildUI(): void {
    if (!this.renderer) return;

    const { width, height } = this.renderer;
    log(`Screen size: ${width}x${height}`);

    // Header box
    this.header = new BoxRenderable(this.renderer, {
      id: 'header',
      width: width - 2,
      height: 4,
      backgroundColor: COLORS.bg,
      borderStyle: 'round',
      borderColor: COLORS.primary,
      position: 'absolute',
      left: 1,
      top: 0,
    });

    // Header value text
    this.headerValue = new TextRenderable(this.renderer, {
      id: 'header-value',
      content: '  Total Portfolio: $--',
      fg: COLORS.text,
      position: 'absolute',
      left: 2,
      top: 1,
    });

    // Header gain text
    this.headerGain = new TextRenderable(this.renderer, {
      id: 'header-gain',
      content: '',
      fg: COLORS.success,
      position: 'absolute',
      left: 2,
      top: 2,
    });

    // Positions list
    this.positionsList = new SelectRenderable(this.renderer, {
      id: 'positions',
      width: width - 4,
      height: height - 8,
      options: [{ name: 'Connecting to TWS...', description: '' }],
      position: 'absolute',
      left: 2,
      top: 5,
      selectedColor: COLORS.primary,
      unselectedColor: COLORS.secondary,
    });

    // Status bar
    this.statusBar = new TextRenderable(this.renderer, {
      id: 'status',
      content: ' [↑↓] Navigate  [Enter] Open  [b] Buy  [/] Search  [q] Quit',
      fg: COLORS.muted,
      position: 'absolute',
      left: 0,
      top: height - 2,
    });

    // Message/connection text
    this.messageText = new TextRenderable(this.renderer, {
      id: 'message',
      content: '',
      fg: COLORS.warning,
      position: 'absolute',
      left: 0,
      top: height - 1,
    });

    // Add to root
    this.renderer.root.add(this.header);
    this.renderer.root.add(this.headerValue);
    this.renderer.root.add(this.headerGain);
    this.renderer.root.add(this.positionsList);
    this.renderer.root.add(this.statusBar);
    this.renderer.root.add(this.messageText);

    // Focus
    this.positionsList.focus();
  }

  private setupKeyHandlers(): void {
    if (!this.renderer) return;

    // Select events
    this.positionsList?.on(SelectRenderableEvents.ITEM_SELECTED, (index: number) => {
      log('Item selected:', index);
      this.app.selectItem();
    });

    // Keyboard
    this.renderer.keyInput.on('keypress', (key: any) => {
      this.app.handleKey(key);
    });
  }

  private updateUI(): void {
    const state = this.app.state;
    const computed = this.app.computed;

    // Update header
    if (this.headerValue) {
      if (state.screen === 'connecting') {
        this.headerValue.content = '  Connecting to TWS...';
      } else if (state.screen === 'error') {
        this.headerValue.content = `  ERROR: ${state.connectionError || 'Unknown'}`;
        this.headerValue.fg = COLORS.danger;
      } else {
        this.headerValue.content = `  Total Portfolio: ${formatMoney(state.accountData.netLiquidation)}`;
        this.headerValue.fg = COLORS.text;
      }
    }

    // Update gain
    if (this.headerGain) {
      if (state.screen === 'portfolio' || state.screen === 'chart') {
        const isPositive = computed.totalGain >= 0;
        const arrow = isPositive ? '↑' : '↓';
        this.headerGain.content = `  ${arrow} ${formatMoney(Math.abs(computed.totalGain), false)}  ${formatPercent(computed.gainPercent, true)}  |  ${state.accountId || ''}`;
        this.headerGain.fg = isPositive ? COLORS.success : COLORS.danger;
      } else if (state.screen === 'error') {
        this.headerGain.content = '  [r] Retry  [q] Quit';
        this.headerGain.fg = COLORS.muted;
      } else {
        this.headerGain.content = '';
      }
    }

    // Update positions list
    if (this.positionsList) {
      if (state.screen === 'connecting') {
        this.positionsList.options = [
          { name: 'Connecting to TWS...', description: 'Waiting for connection' },
        ];
      } else if (state.screen === 'error') {
        this.positionsList.options = [
          { name: 'Connection error', description: state.connectionError || '' },
          { name: '[r] Retry', description: '' },
          { name: '[q] Quit', description: '' },
        ];
      } else if (state.screen === 'portfolio') {
        const options = state.positions.map(pos => {
          const price = state.prices.get(pos.symbol) || pos.avgCost;
          const value = pos.quantity * price;
          const gain = value - (pos.quantity * pos.avgCost);
          const gainPct = pos.avgCost > 0 ? (gain / (pos.quantity * pos.avgCost)) * 100 : 0;

          return {
            name: `${padRight(pos.symbol, 6)} ${padLeft(String(pos.quantity), 5)} sh    ${padLeft(formatMoney(value), 12)}`,
            description: formatPercent(gainPct, true),
          };
        });

        // Cash row
        options.push({
          name: `${padRight('CASH', 6)} ${padLeft('', 9)}   ${padLeft(formatMoney(computed.cash), 12)}`,
          description: '',
        });

        if (options.length === 1) {
          options.unshift({ name: 'No positions', description: '' });
        }

        this.positionsList.options = options;
      } else if (state.screen === 'chart') {
        this.positionsList.options = [
          { name: `Chart: ${state.chartSymbol}`, description: '' },
          { name: '[Esc] Back', description: '' },
          { name: '[b] Buy', description: '' },
          { name: '[s] Sell', description: '' },
        ];
      }
    }

    // Update message
    if (this.messageText) {
      switch (state.connectionStatus) {
        case 'connected':
          this.messageText.content = ` TWS: Connected`;
          this.messageText.fg = COLORS.success;
          break;
        case 'connecting':
          this.messageText.content = ' TWS: Connecting...';
          this.messageText.fg = COLORS.warning;
          break;
        case 'error':
          this.messageText.content = ' TWS: Connection error';
          this.messageText.fg = COLORS.danger;
          break;
        default:
          this.messageText.content = ' TWS: Disconnected';
          this.messageText.fg = COLORS.muted;
      }
    }
  }
}

export default UIRenderer;
