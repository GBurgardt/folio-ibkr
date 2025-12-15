import 'dotenv/config';
import ib from 'ib';
import chalk from 'chalk';
import ora from 'ora';

// Variables para verificación
let pendingOrders = [];
let ibClient = null;

console.clear();
console.log(chalk.blue.bold('📋 PENDING ORDERS CHECKER'));
console.log(chalk.gray('━'.repeat(50)));
console.log(chalk.cyan('Checking scheduled orders and market status\n'));

// Función para verificar si el mercado está abierto
function isMarketOpen() {
  const now = new Date();
  const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  const day = easternTime.getDay(); // 0 = Domingo, 6 = Sábado
  const hour = easternTime.getHours();
  const minute = easternTime.getMinutes();
  
  // Mercado cerrado en fines de semana
  if (day === 0 || day === 6) {
    return { isOpen: false, reason: 'Weekend' };
  }
  
  // Horario del mercado: 9:30 AM - 4:00 PM EST
  const marketOpen = 9.5; // 9:30 AM
  const marketClose = 16; // 4:00 PM
  const currentTime = hour + (minute / 60);
  
  if (currentTime < marketOpen) {
    return { isOpen: false, reason: `Market opens at 9:30 AM ET (~${(marketOpen - currentTime).toFixed(1)}h)` };
  } else if (currentTime >= marketClose) {
    return { isOpen: false, reason: 'Market closed (closes at 4:00 PM ET)' };
  }
  
  return { isOpen: true, reason: 'Market open' };
}

async function checkOrders() {
  const spinner = ora('Connecting to Interactive Brokers...').start();
  
  return new Promise((resolve, reject) => {
    ibClient = new ib({
      clientId: 88, // ID diferente
      host: '127.0.0.1',
      port: 7496 // Cuenta real
    });

    let connectionTimeout = setTimeout(() => {
      spinner.fail('Connection timeout');
      reject(new Error('Timeout'));
    }, 10000);

    ibClient.on('error', (err) => {
      const message = err.message.toLowerCase();
      if (!message.includes('conexión') && 
          !message.includes('funciona correctamente') && 
          !message.includes('hmds') &&
          !message.includes('modo solo lectura')) {
        console.error(chalk.red(`Error: ${err.message}`));
      }
    });

    ibClient.on('nextValidId', (orderId) => {
      clearTimeout(connectionTimeout);
      spinner.succeed('✅ Connected to IB');
      
      console.log(chalk.gray('📋 Requesting open orders...'));
      
      // Solicitar todas las órdenes abiertas
      ibClient.reqAllOpenOrders();
      
      // También solicitar órdenes globales
      ibClient.reqOpenOrders();
      
      // Dar tiempo para recibir datos
      setTimeout(() => {
        showResults();
        ibClient.disconnect();
        resolve();
      }, 5000);
    });

    // Recibir órdenes abiertas
    ibClient.on('openOrder', (orderId, contract, order, orderState) => {
      const orderInfo = {
        orderId: orderId,
        symbol: contract.symbol,
        action: order.action,
        quantity: order.totalQuantity,
        orderType: order.orderType,
        status: orderState.status,
        filled: orderState.filled,
        remaining: orderState.remaining,
        avgFillPrice: orderState.avgFillPrice
      };
      
      pendingOrders.push(orderInfo);
      
      console.log(chalk.blue(`📋 Order ${orderId}: ${order.action} ${order.totalQuantity} ${contract.symbol} (${orderState.status})`));
      
      if (orderState.filled > 0) {
        console.log(chalk.green(`   ✅ Filled: ${orderState.filled} @ $${orderState.avgFillPrice}`));
      }
      if (orderState.remaining > 0) {
        console.log(chalk.yellow(`   ⏳ Remaining: ${orderState.remaining}`));
      }
    });

    ibClient.on('orderStatus', (orderId, status, filled, remaining, avgFillPrice) => {
      console.log(chalk.cyan(`📊 Order ${orderId} status: ${status} (${filled}/${filled + remaining})`));
    });

    ibClient.on('openOrderEnd', () => {
      console.log(chalk.cyan(`\n🏁 Total orders found: ${pendingOrders.length}`));
    });

    ibClient.connect();
    ibClient.reqIds(1);
  });
}

function showResults() {
  // Verificar estado del mercado
  const marketStatus = isMarketOpen();
  
  console.log(chalk.yellow('\n' + '═'.repeat(60)));
  console.log(chalk.yellow.bold('📊 MARKET STATUS'));
  console.log(chalk.yellow('═'.repeat(60)));
  
  if (marketStatus.isOpen) {
    console.log(chalk.green('🟢 MARKET OPEN'));
  } else {
    console.log(chalk.red('🔴 MARKET CLOSED'));
  }
  console.log(chalk.white(`Reason: ${marketStatus.reason}`));
  
  const now = new Date();
  const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  console.log(chalk.gray(`Current time ET: ${easternTime.toLocaleTimeString()}`));
  
  // Mostrar órdenes
  console.log(chalk.yellow('\n' + '═'.repeat(60)));
  console.log(chalk.yellow.bold('📋 OPEN / PENDING ORDERS'));
  console.log(chalk.yellow('═'.repeat(60)));
  
  if (pendingOrders.length > 0) {
    pendingOrders.forEach(order => {
      console.log(chalk.white(`\n🔸 Order ${order.orderId}:`));
      console.log(chalk.white(`   ${order.action} ${order.quantity} ${order.symbol}`));
      console.log(chalk.white(`   Type: ${order.orderType}`));
      console.log(chalk.white(`   Status: ${order.status}`));
      
      if (order.filled > 0) {
        console.log(chalk.green(`   ✅ Filled: ${order.filled} @ $${order.avgFillPrice}`));
      }
      if (order.remaining > 0) {
        console.log(chalk.yellow(`   ⏳ Remaining: ${order.remaining}`));
      }
      
      // Verificar si es nuestra orden de Google
      if (order.symbol === 'GOOG' && order.action === 'SELL' && order.quantity === 5) {
        console.log(chalk.magenta('\n🎯 This is your GOOG sell order'));
        if (order.status === 'Submitted' || order.status === 'PreSubmitted') {
          console.log(chalk.cyan('📅 It will execute when the market opens'));
        }
      }
    });
  } else {
    console.log(chalk.gray('❌ No open orders found'));
    console.log(chalk.yellow('💡 This can mean:'));
    console.log(chalk.yellow('   - The order already filled'));
    console.log(chalk.yellow('   - The order was cancelled'));
    console.log(chalk.yellow('   - It was not submitted correctly'));
  }
  
  // Próxima apertura del mercado
  if (!marketStatus.isOpen) {
    console.log(chalk.yellow('\n📅 NEXT OPEN:'));
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1); // Si es domingo, saltar a lunes
    if (tomorrow.getDay() === 6) tomorrow.setDate(tomorrow.getDate() + 2); // Si es sábado, saltar a lunes
    
    console.log(chalk.white(`9:30 AM ET`));
    console.log(chalk.gray('Pending orders will execute automatically when the market opens'));
  }
  
  console.log(chalk.yellow('\n' + '═'.repeat(60)));
}

async function main() {
  try {
    await checkOrders();
  } catch (error) {
    console.error(chalk.red('\n❌ Error checking orders:'), error.message);
    console.log(chalk.yellow('💡 Make sure TWS is running and the API is enabled'));
  }
  
  console.log(chalk.gray('\n✨ Order check completed'));
}

// Manejo de cierre
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n👋 Shutting down...'));
  if (ibClient) ibClient.disconnect();
  process.exit(0);
});

main().catch(console.error);
