/**
 * Conexión a Interactive Brokers (sin React)
 *
 * Wrapper sobre la librería 'ib' que maneja:
 * - Conexión/reconexión
 * - Eventos
 * - Estado de conexión
 */

import IB from 'ib';
import { EventEmitter } from 'events';

// Códigos que son informativos, no errores
const INFO_CODES = new Set([2104, 2106, 2158, 2119]);
const IGNORED_CODES = new Set([300, 354, 10167]);

function log(...args) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  console.log(`[${timestamp}] [IB-CONNECTION]`, ...args);
}

export class IBConnection extends EventEmitter {
  constructor(options = {}) {
    super();

    this.host = options.host || '127.0.0.1';
    this.port = options.port || 7496;
    this.clientId = options.clientId || 1;

    this.client = null;
    this.connected = false;
    this.accountId = null;
    this.nextOrderId = null;
  }

  /**
   * Conectar a TWS/Gateway
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this.connected) {
        resolve();
        return;
      }

      log(`Connecting to ${this.host}:${this.port} (clientId: ${this.clientId})`);

      this.client = new IB({
        clientId: this.clientId,
        host: this.host,
        port: this.port,
      });

      // Timeout de conexión
      const timeout = setTimeout(() => {
        log('Connection timeout');
        reject(new Error('Timeout connecting to TWS'));
      }, 10000);

      // Eventos de error
      this.client.on('error', (err, data) => {
        const code = data?.code;
        const message = err?.message || String(err);

        // Ignorar códigos informativos
        if (code && (INFO_CODES.has(code) || IGNORED_CODES.has(code))) {
          return;
        }

        if (message.includes('ECONNREFUSED')) {
          clearTimeout(timeout);
          reject(new Error('TWS is not running or the port is blocked'));
          return;
        }

        if (message.includes('ETIMEDOUT')) {
          clearTimeout(timeout);
          reject(new Error('Connection timeout'));
          return;
        }

        // Errores que se pueden ignorar
        if (message.includes('Cannot send data when disconnected') ||
            message.includes('Cannot disconnect if already disconnected')) {
          return;
        }

        log('Error:', message);
        this.emit('error', new Error(message));
      });

      // Conexión exitosa (recibimos nextValidId) - usar once para evitar duplicados
      this.client.once('nextValidId', (orderId) => {
        log('Connected. Next order ID:', orderId);
        clearTimeout(timeout);

        this.connected = true;
        this.nextOrderId = orderId;

        // Solicitar lista de cuentas
        this.client.reqManagedAccts();

        this.emit('connected');
        resolve();
      });

      // Recibir cuenta(s) - usar once para evitar duplicados
      this.client.once('managedAccounts', (accounts) => {
        this.accountId = accounts.split(',')[0];
        log('Account ID:', this.accountId);
        this.emit('account', this.accountId);
      });

      // Desconexión
      this.client.on('disconnected', () => {
        log('Disconnected');
        this.connected = false;
        this.emit('disconnected');
      });

      // Iniciar conexión
      try {
        this.client.connect();
        this.client.reqIds(1);
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  /**
   * Desconectar
   */
  disconnect() {
    if (this.client) {
      try {
        this.client.disconnect();
      } catch (e) {
        // Ignorar
      }
      this.client = null;
    }
    this.connected = false;
  }

  /**
   * Is it connected?
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Obtener el cliente IB subyacente
   */
  getClient() {
    return this.client;
  }

  /**
   * Obtener el próximo order ID
   */
  getNextOrderId() {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.connected) {
        reject(new Error('Not connected'));
        return;
      }

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout getting order ID'));
      }, 5000);

      const onNextValidId = (orderId) => {
        cleanup();
        this.nextOrderId = orderId;
        resolve(orderId);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.client.removeListener('nextValidId', onNextValidId);
      };

      this.client.once('nextValidId', onNextValidId);
      this.client.reqIds(1);
    });
  }
}

export default IBConnection;
