/**
 * Portfolio Manager
 * Obtiene posiciones y datos de cuenta desde IB
 */

import { IBConnection } from './ib-connection';

const ACCOUNT_SUMMARY_REQ_ID = 9001;
const PRICE_REQ_ID_BASE = 10000;

function log(...args: any[]) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  console.log(`[${timestamp}] [PORTFOLIO]`, ...args);
}

export interface Position {
  symbol: string;
  secType: string;
  quantity: number;
  avgCost: number;
  marketValue: number;
  currency: string;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  lastPrice?: number;
}

export interface AccountData {
  netLiquidation: number;
  totalCashValue: number;
  availableFunds: number;
  buyingPower: number;
  dailyPnL: number;
}

export interface PortfolioData {
  positions: Position[];
  accountData: AccountData;
}

export interface PriceData {
  last: number;
  bid: number;
  ask: number;
  close: number;
  changePercent: number;
}

export class PortfolioManager {
  ibConnection: IBConnection;
  priceReqCounter: number;
  priceCache: Map<string, { price: PriceData; timestamp: number }>;
  CACHE_TTL: number;

  constructor(ibConnection: IBConnection) {
    this.ibConnection = ibConnection;
    this.priceReqCounter = 0;
    this.priceCache = new Map();
    this.CACHE_TTL = 30000; // 30 segundos
  }

  /**
   * Obtener portfolio completo (posiciones + datos de cuenta)
   */
  fetch(): Promise<PortfolioData> {
    return new Promise((resolve, reject) => {
      const client = this.ibConnection.getClient();
      if (!client || !this.ibConnection.isConnected()) {
        reject(new Error('Not connected to IB'));
        return;
      }

      const positions: Position[] = [];
      const accountData: AccountData = {
        netLiquidation: 0,
        totalCashValue: 0,
        availableFunds: 0,
        buyingPower: 0,
        dailyPnL: 0,
      };

      let accountSummaryDone = false;
      let positionsDone = false;

      const checkComplete = () => {
        if (accountSummaryDone && positionsDone) {
          cleanup();
          log(`Fetch complete: ${positions.length} positions, NLV: $${accountData.netLiquidation.toFixed(2)}`);
          resolve({ positions, accountData });
        }
      };

      // Timeout
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout fetching portfolio'));
      }, 15000);

      // Account Summary
      const onAccountSummary = (reqId: number, account: string, tag: string, value: string, currency: string) => {
        if (reqId !== ACCOUNT_SUMMARY_REQ_ID) return;

        const numValue = parseFloat(value);

        switch (tag) {
          case 'NetLiquidation':
            accountData.netLiquidation = numValue;
            break;
          case 'TotalCashValue':
            accountData.totalCashValue = numValue;
            break;
          case 'AvailableFunds':
            accountData.availableFunds = numValue;
            break;
          case 'BuyingPower':
            accountData.buyingPower = numValue;
            break;
        }
      };

      const onAccountSummaryEnd = (reqId: number) => {
        if (reqId !== ACCOUNT_SUMMARY_REQ_ID) return;
        accountSummaryDone = true;
        checkComplete();
      };

      // Positions
      const onPosition = (account: string, contract: any, position: number, avgCost: number) => {
        if (position !== 0 && contract.secType === 'STK') {
          const existingIndex = positions.findIndex(p => p.symbol === contract.symbol);

          const positionData: Position = {
            symbol: contract.symbol,
            secType: contract.secType,
            quantity: position,
            avgCost: avgCost,
            marketValue: position * avgCost,
            currency: contract.currency || 'USD',
            unrealizedPnL: 0,
            unrealizedPnLPercent: 0,
          };

          if (existingIndex >= 0) {
            positions[existingIndex] = positionData;
          } else {
            positions.push(positionData);
          }
        }
      };

      const onPositionEnd = () => {
        positionsDone = true;
        checkComplete();
      };

      // PnL updates (para P&L diario)
      const onPnL = (reqId: number, dailyPnL: number, unrealizedPnL: number, realizedPnL: number) => {
        accountData.dailyPnL = dailyPnL || 0;
      };

      const cleanup = () => {
        clearTimeout(timeout);
        client.removeListener('accountSummary', onAccountSummary);
        client.removeListener('accountSummaryEnd', onAccountSummaryEnd);
        client.removeListener('position', onPosition);
        client.removeListener('positionEnd', onPositionEnd);
        client.removeListener('pnl', onPnL);

        try {
          client.cancelAccountSummary(ACCOUNT_SUMMARY_REQ_ID);
        } catch (e) {
          // Ignorar
        }
      };

      // Registrar listeners
      client.on('accountSummary', onAccountSummary);
      client.on('accountSummaryEnd', onAccountSummaryEnd);
      client.on('position', onPosition);
      client.on('positionEnd', onPositionEnd);
      client.on('pnl', onPnL);

      // Solicitar datos
      client.reqAccountSummary(
        ACCOUNT_SUMMARY_REQ_ID,
        'All',
        ['NetLiquidation', 'TotalCashValue', 'AvailableFunds', 'BuyingPower']
      );
      client.reqPositions();

      // Solicitar PnL de la cuenta
      if (this.ibConnection.accountId) {
        try {
          client.reqPnL(9002, this.ibConnection.accountId, '');
        } catch (e) {
          // Puede no estar disponible
        }
      }
    });
  }

  /**
   * Obtener precio de un símbolo
   */
  getPrice(symbol: string): Promise<PriceData> {
    // Verificar cache
    const cached = this.priceCache.get(symbol);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      return Promise.resolve(cached.price);
    }

    return new Promise((resolve, reject) => {
      const client = this.ibConnection.getClient();
      if (!client || !this.ibConnection.isConnected()) {
        reject(new Error('Not connected to IB'));
        return;
      }

      const reqId = PRICE_REQ_ID_BASE + (++this.priceReqCounter);
      const priceData: PriceData = { last: 0, bid: 0, ask: 0, close: 0, changePercent: 0 };
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          cleanup();
          // Si tenemos algún precio, usarlo
          if (priceData.last || priceData.close) {
            this.priceCache.set(symbol, { price: priceData, timestamp: Date.now() });
            resolve(priceData);
          } else {
            reject(new Error(`Timeout fetching price for ${symbol}`));
          }
        }
      }, 5000);

      const onTickPrice = (tickerId: number, field: number, price: number, canAutoExecute: number) => {
        if (tickerId !== reqId) return;

        // Field codes: 1=bid, 2=ask, 4=last, 9=close
        switch (field) {
          case 1:
            priceData.bid = price;
            break;
          case 2:
            priceData.ask = price;
            break;
          case 4:
            priceData.last = price;
            break;
          case 9:
            priceData.close = price;
            break;
        }

        // Si tenemos precio last o bid/ask, resolver
        if (priceData.last > 0 || (priceData.bid > 0 && priceData.ask > 0)) {
          if (!resolved) {
            resolved = true;
            cleanup();
            this.priceCache.set(symbol, { price: priceData, timestamp: Date.now() });
            resolve(priceData);
          }
        }
      };

      const onTickGeneric = (tickerId: number, field: number, value: number) => {
        if (tickerId !== reqId) return;
        // Field 49 = halted
      };

      const cleanup = () => {
        clearTimeout(timeout);
        client.removeListener('tickPrice', onTickPrice);
        client.removeListener('tickGeneric', onTickGeneric);

        try {
          client.cancelMktData(reqId);
        } catch (e) {
          // Ignorar
        }
      };

      client.on('tickPrice', onTickPrice);
      client.on('tickGeneric', onTickGeneric);

      // Solicitar datos de mercado
      const contract = client.contract.stock(symbol, 'SMART', 'USD');
      client.reqMktData(reqId, contract, '', true, false, []);
    });
  }
}

export default PortfolioManager;
