#!/usr/bin/env node
require('dotenv').config();
const ib = require('ib');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');

const IB_HOST = process.env.IB_HOST || '127.0.0.1';
const IB_PORT = Number(process.env.IB_PORT || 7497);
const IB_CLIENT_ID = Number(process.env.IB_CLIENT_ID || 42);
const ACCOUNT_SUMMARY_REQ_ID = Number(process.env.IB_ACCOUNT_SUMMARY_REQ_ID || 9001);
const MARKET_DATA_REQ_ID = Number(process.env.IB_MARKET_DATA_REQ_ID || 5001);
const SYMBOL = 'TSLA';
const EXCHANGE = process.env.IB_EXCHANGE || 'SMART';
const CURRENCY = process.env.IB_CURRENCY || 'USD';

let client;

function createClient() {
  const instance = new ib({ clientId: IB_CLIENT_ID, host: IB_HOST, port: IB_PORT });
  instance.on('error', (err, data) => {
    const code = data?.code;
    const message = err?.message || String(err);
    const infoCodes = new Set([2104, 2106, 2158]);
    const ignoredCodes = new Set([300]);

    if (code && ignoredCodes.has(code)) {
      return;
    }

    if (code && infoCodes.has(code)) {
      console.log(chalk.gray(`IB info: ${message}`));
      return;
    }

    const suffix = data ? ` (${JSON.stringify(data)})` : '';
    console.error(chalk.red(`IB error: ${message}${suffix}`));
  });
  return instance;
}

function waitForConnection(instance) {
  return new Promise((resolve, reject) => {
    let isConnected = false;

    const onConnected = () => {
      isConnected = true;
      cleanup();
      resolve();
    };

    const onError = (err) => {
      if (!isConnected) {
        cleanup();
        reject(new Error(err?.message || 'Fallo conectando a Interactive Brokers'));
      }
    };

    const onDisconnected = () => {
      if (!isConnected) {
        cleanup();
        reject(new Error('Conexión cerrada antes de establecerse'));
      }
    };

    const cleanup = () => {
      instance.removeListener('connected', onConnected);
      instance.removeListener('error', onError);
      instance.removeListener('disconnected', onDisconnected);
    };

    instance.once('connected', onConnected);
    instance.once('disconnected', onDisconnected);
    instance.on('error', onError);
  });
}

function requestNextOrderId(instance) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timeout esperando nextValidId de IB'));
    }, 5000);

    const onNextValidId = (orderId) => {
      cleanup();
      resolve(orderId);
    };

    const onError = (err) => {
      cleanup();
      reject(new Error(err?.message || 'Error obteniendo nextValidId'));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      instance.removeListener('nextValidId', onNextValidId);
      instance.removeListener('error', onError);
    };

    instance.once('nextValidId', onNextValidId);
    instance.on('error', onError);
    instance.reqIds(1);
  });
}

function fetchAccountFunds(instance) {
  return new Promise((resolve, reject) => {
    const summary = { availableFunds: null, totalCashValue: null, buyingPower: null, currency: null };
    const timeout = setTimeout(() => {
      cleanup();
      if (summary.availableFunds !== null || summary.totalCashValue !== null) {
        resolve(summary);
      } else {
        reject(new Error('Timeout obteniendo fondos de la cuenta'));
      }
    }, 6000);

    const onAccountSummary = (reqId, account, tag, value, currency) => {
      if (reqId !== ACCOUNT_SUMMARY_REQ_ID) return;
      if (currency) summary.currency = currency;
      if (tag === 'AvailableFunds') summary.availableFunds = parseFloat(value);
      if (tag === 'TotalCashValue') summary.totalCashValue = parseFloat(value);
      if (tag === 'BuyingPower') summary.buyingPower = parseFloat(value);
    };

    const onAccountSummaryEnd = (reqId) => {
      if (reqId !== ACCOUNT_SUMMARY_REQ_ID) return;
      cleanup();
      if (summary.availableFunds !== null || summary.totalCashValue !== null) {
        resolve(summary);
      } else {
        reject(new Error('Interactive Brokers no devolvió fondos disponibles'));
      }
    };

    const onError = (err, data) => {
      const code = data?.code;
      const infoCodes = new Set([2104, 2106, 2158]);
      if (code && infoCodes.has(code)) {
        return;
      }

      cleanup();
      reject(new Error(err?.message || 'Error solicitando resumen de cuenta'));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      instance.removeListener('accountSummary', onAccountSummary);
      instance.removeListener('accountSummaryEnd', onAccountSummaryEnd);
      instance.removeListener('error', onError);
      try {
        instance.cancelAccountSummary(ACCOUNT_SUMMARY_REQ_ID);
      } catch (e) {
        // ignore
      }
    };

    instance.on('accountSummary', onAccountSummary);
    instance.once('accountSummaryEnd', onAccountSummaryEnd);
    instance.on('error', onError);
    instance.reqAccountSummary(ACCOUNT_SUMMARY_REQ_ID, 'All', ['AvailableFunds', 'TotalCashValue', 'BuyingPower']);
  });
}

function fetchMarketPrice(instance) {
  return new Promise((resolve, reject) => {
    const contract = instance.contract.stock(SYMBOL, EXCHANGE, CURRENCY);
    const interestingFields = new Set([
      instance.TICK_TYPE.LAST,
      instance.TICK_TYPE.DELAYED_LAST,
      instance.TICK_TYPE.MARK_PRICE,
      instance.TICK_TYPE.BID,
      instance.TICK_TYPE.ASK,
      instance.TICK_TYPE.CLOSE,
      instance.TICK_TYPE.DELAYED_CLOSE
    ]);
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        cleanup();
        reject(new Error(`Timeout obteniendo precio de mercado para ${SYMBOL}`));
      }
    }, 7000);

    const onTickPrice = (tickerId, field, price) => {
      if (tickerId !== MARKET_DATA_REQ_ID || !interestingFields.has(field) || price <= 0 || resolved) return;
      resolved = true;
      cleanup();
      resolve({
        price,
        field,
        fieldLabel: instance.util.tickTypeToString(field)
      });
    };

    const onTickSnapshotEnd = (tickerId) => {
      if (tickerId !== MARKET_DATA_REQ_ID || resolved) return;
      cleanup();
      reject(new Error('IB cerró el snapshot sin precio válido para TSLA'));
    };

    const onError = (err, data) => {
      const code = data?.code;
      const infoCodes = new Set([2104, 2106, 2158]);
      if (code && infoCodes.has(code)) {
        return;
      }

      if (resolved) return;
      cleanup();
      const message = err?.message || 'Error obteniendo datos de mercado de TSLA';
      reject(new Error(message));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      instance.removeListener('tickPrice', onTickPrice);
      instance.removeListener('tickSnapshotEnd', onTickSnapshotEnd);
      instance.removeListener('error', onError);
      try {
        instance.cancelMktData(MARKET_DATA_REQ_ID);
      } catch (e) {
        // ignore
      }
    };

    instance.on('tickPrice', onTickPrice);
    instance.once('tickSnapshotEnd', onTickSnapshotEnd);
    instance.on('error', onError);
    instance.reqMarketDataType(3); // delayed data if realtime no disponible
    instance.reqMktData(MARKET_DATA_REQ_ID, contract, '', true, false);
  });
}

function submitMarketOrder(instance, orderId, quantity) {
  return new Promise((resolve, reject) => {
    const contract = instance.contract.stock(SYMBOL, EXCHANGE, CURRENCY);
    const order = instance.order.market('BUY', quantity);
    let lastStatus = 'Enviando';
    let resolved = false;

    const terminalStatuses = new Set(['Filled', 'Cancelled', 'Inactive']);

    const timeout = setTimeout(() => {
      if (resolved) return;
      cleanup();
      resolve({
        status: lastStatus,
        filled: null,
        avgFillPrice: null
      });
    }, 30000);

    const onOrderStatus = (id, status, filled, remaining, avgFillPrice) => {
      if (id !== orderId) return;
      lastStatus = status;
      console.log(chalk.cyan(`Estado orden ${id}: ${status} | Ejecutadas: ${filled} | Restantes: ${remaining} | Precio promedio: ${avgFillPrice}`));
      if (!resolved && terminalStatuses.has(status)) {
        resolved = true;
        cleanup();
        resolve({ status, filled, avgFillPrice });
      }
    };

    const onError = (err) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(new Error(err?.message || 'Error al enviar la orden de compra'));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      instance.removeListener('orderStatus', onOrderStatus);
      instance.removeListener('error', onError);
    };

    instance.on('orderStatus', onOrderStatus);
    instance.on('error', onError);
    instance.placeOrder(orderId, contract, order);
  });
}

async function main() {
  client = createClient();

  const connectSpinner = ora('Conectando a Interactive Brokers...').start();
  client.connect();
  try {
    await waitForConnection(client);
    connectSpinner.succeed('Conectado a Interactive Brokers');
  } catch (error) {
    connectSpinner.fail('No se pudo conectar a Interactive Brokers');
    throw error;
  }

  let nextOrderId;
  const orderIdSpinner = ora('Solicitando próximo orderId...').start();
  try {
    nextOrderId = await requestNextOrderId(client);
    orderIdSpinner.succeed(`Próximo orderId: ${nextOrderId}`);
  } catch (error) {
    orderIdSpinner.fail('No se pudo obtener un orderId válido');
    throw error;
  }

  let account;
  const fundsSpinner = ora('Obteniendo fondos disponibles...').start();
  try {
    account = await fetchAccountFunds(client);
    const effectiveCurrency = account.currency || CURRENCY;
    const available = account.availableFunds ?? account.totalCashValue ?? 0;
    fundsSpinner.succeed(`Fondos disponibles: $${available.toFixed(2)} ${effectiveCurrency}`);
  } catch (error) {
    fundsSpinner.fail('Error obteniendo fondos');
    throw error;
  }

  let market;
  const priceSpinner = ora(`Consultando precio actual de ${SYMBOL}...`).start();
  try {
    market = await fetchMarketPrice(client);
    priceSpinner.succeed(`Precio ${market.fieldLabel} de ${SYMBOL}: $${market.price.toFixed(2)}`);
  } catch (error) {
    priceSpinner.fail('Error obteniendo precio de mercado');
    console.log(chalk.yellow(`Aviso: ${error.message}`));

    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'manualPrice',
        message: `Ingresa manualmente el precio estimado por acción de ${SYMBOL} (por ejemplo 200.00):`,
        validate: (value) => {
          const parsed = Number(value);
          if (!Number.isFinite(parsed) || parsed <= 0) {
            return 'Introduce un número mayor a 0';
          }
          return true;
        }
      }
    ]);

    market = {
      price: Number(answer.manualPrice),
      fieldLabel: 'precio ingresado manualmente'
    };
  }

  const cashToUse = account.availableFunds ?? account.totalCashValue ?? 0;
  if (!Number.isFinite(cashToUse) || cashToUse <= 0) {
    console.log(chalk.yellow('No hay efectivo disponible para comprar TSLA.'));
    return;
  }

  const maxShares = Math.floor(cashToUse / market.price);
  if (maxShares <= 0) {
    console.log(chalk.yellow('El efectivo disponible no alcanza para una acción de TSLA al precio actual.'));
    return;
  }

  const estimatedCost = maxShares * market.price;

  console.log(chalk.green(`\nCon efectivo disponible ≈ $${cashToUse.toFixed(2)}, puedes comprar ${maxShares} acciones de ${SYMBOL}.`));
  console.log(chalk.green(`Costo estimado: ≈ $${estimatedCost.toFixed(2)} (${market.fieldLabel}).`));

  const confirmation = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'accept',
      default: false,
      message: `¿Estás seguro de que quieres comprar ${maxShares} acciones de ${SYMBOL} a aproximadamente $${market.price.toFixed(2)} cada una?`
    }
  ]);

  if (!confirmation.accept) {
    console.log(chalk.yellow('Operación cancelada por el usuario.'));
    return;
  }

  const orderSpinner = ora(`Enviando orden de compra de ${maxShares} ${SYMBOL}...`).start();
  try {
    const result = await submitMarketOrder(client, nextOrderId, maxShares);
    orderSpinner.succeed(`Orden ${nextOrderId} enviada (${result.status}).`);
  } catch (error) {
    orderSpinner.fail('La orden de compra falló');
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(chalk.red(`\n❌ ${error.message}`));
    process.exitCode = 1;
  })
  .finally(() => {
    if (client) {
      try {
        client.disconnect();
      } catch (err) {
        // ignore
      }
    }
  });
