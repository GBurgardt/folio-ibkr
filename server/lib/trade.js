/**
 * Trade Executor (sin React)
 *
 * Ejecuta órdenes de compra/venta en IB
 */

function log(...args) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  console.log(`[${timestamp}] [TRADE]`, ...args);
}

// Mensajes que se pueden ignorar
const IGNORABLE_MESSAGES = [
  'Order TIF was set to DAY based on order preset',
];

// Patrones de warning (orden aceptada pero con nota)
const WARNING_PATTERNS = [
  { pattern: /no se enviará al mercado hasta el (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/, type: 'market_closed' },
  { pattern: /will not be sent to the market until (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/, type: 'market_closed' },
  { pattern: /order will not be active until/, type: 'market_closed' },
  { pattern: /order is being held/, type: 'order_held' },
];

// Patrones de rechazo
const REJECTION_PATTERNS = [
  { pattern: /Orden rechazada\. Motivo:(.+)/, type: 'rejected' },
  { pattern: /Order rejected\. Reason:(.+)/, type: 'rejected' },
  { pattern: /Efectivo liquidado disponible/, type: 'insufficient_funds' },
  { pattern: /Insufficient funds/, type: 'insufficient_funds' },
];

function isIgnorableMessage(message) {
  if (!message) return false;
  return IGNORABLE_MESSAGES.some((text) => message.includes(text));
}

function extractWarning(message) {
  if (!message) return null;
  for (const { pattern, type } of WARNING_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      return { type, timestamp: match[1] || null };
    }
  }
  return null;
}

function extractRejection(message) {
  if (!message) return null;
  for (const { pattern, type } of REJECTION_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      let reason = match[1] || message;
      reason = reason.replace(/<br\s*\/?>/gi, ' ').trim();
      return { type, reason };
    }
  }
  return null;
}

export class TradeExecutor {
  constructor(ibConnection) {
    this.ibConnection = ibConnection;
  }

  /**
   * Comprar acciones
   */
  buy(symbol, quantity) {
    return this._submitOrder({ symbol, action: 'BUY', quantity });
  }

  /**
   * Vender acciones
   */
  sell(symbol, quantity) {
    return this._submitOrder({ symbol, action: 'SELL', quantity });
  }

  /**
   * Enviar orden a IB
   */
  async _submitOrder({ symbol, action, quantity, orderType = 'MKT', exchange = 'SMART', currency = 'USD' }) {
    const client = this.ibConnection.getClient();
    if (!client || !this.ibConnection.isConnected()) {
      throw new Error('No conectado a IB');
    }

    log(`Enviando orden: ${action} ${quantity} ${symbol}`);

    // Obtener order ID
    const orderId = await this.ibConnection.getNextOrderId();
    log(`Order ID: ${orderId}`);

    // Crear contrato y orden
    const contract = client.contract.stock(symbol, exchange, currency);
    const order = client.order.market(action, quantity);
    order.tif = 'DAY';

    return new Promise((resolve, reject) => {
      let lastStatus = 'Enviando';
      let resolved = false;
      let orderWarning = null;
      let orderRejection = null;

      const terminalStatuses = new Set(['Filled', 'Cancelled', 'Inactive']);
      const acceptedStatuses = new Set(['Submitted', 'PreSubmitted', 'Filled']);

      // Timeout
      const timeout = setTimeout(() => {
        if (!resolved) {
          cleanup();
          // Si tenemos warning, la orden fue aceptada
          if (orderWarning) {
            resolve({
              orderId,
              status: 'Submitted',
              filled: null,
              avgFillPrice: null,
              warning: orderWarning,
            });
          } else if (orderRejection) {
            reject(new Error(orderRejection.reason));
          } else {
            resolve({
              orderId,
              status: lastStatus,
              filled: null,
              avgFillPrice: null,
            });
          }
        }
      }, 30000);

      const onOrderStatus = (id, status, filled, remaining, avgFillPrice) => {
        if (id !== orderId) return;

        log(`Status de orden ${id}: ${status} (filled: ${filled}, avg: ${avgFillPrice})`);
        lastStatus = status;

        // Resolver en estado terminal o aceptado
        if (!resolved && (terminalStatuses.has(status) || acceptedStatuses.has(status))) {
          resolved = true;
          cleanup();

          if (status === 'Inactive' && orderRejection) {
            reject(new Error(orderRejection.reason));
          } else {
            resolve({
              orderId: id,
              status,
              filled,
              avgFillPrice,
              warning: orderWarning,
            });
          }
        }
      };

      const onError = (err, data) => {
        if (resolved) return;

        const message = err?.message || 'Error al enviar orden';
        const errorId = data?.id;

        // Ignorar errores de otras órdenes
        if (errorId !== undefined && errorId !== -1 && errorId !== orderId) {
          return;
        }

        // Ignorar mensajes completamente
        if (isIgnorableMessage(message)) {
          return;
        }

        // Verificar si es rechazo
        const rejection = extractRejection(message);
        if (rejection) {
          orderRejection = rejection;
          return;
        }

        // Verificar si es warning
        const warning = extractWarning(message);
        if (warning) {
          orderWarning = warning;
          log(`Warning: ${warning.type}`);
          return;
        }

        // Error real
        log('Error de orden:', message);
        resolved = true;
        cleanup();
        reject(new Error(message));
      };

      const cleanup = () => {
        clearTimeout(timeout);
        client.removeListener('orderStatus', onOrderStatus);
        client.removeListener('error', onError);
      };

      // Registrar listeners
      client.on('orderStatus', onOrderStatus);
      client.on('error', onError);

      // Enviar orden
      try {
        client.placeOrder(orderId, contract, order);
        log('Orden enviada');
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }
}

export default TradeExecutor;
