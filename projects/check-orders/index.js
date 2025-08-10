require('dotenv').config();
const ib = require('ib');
const chalk = require('chalk');
const ora = require('ora');

// Variables para verificación
let pendingOrders = [];
let ibClient = null;

console.clear();
console.log(chalk.blue.bold('📋 VERIFICADOR DE ÓRDENES PENDIENTES'));
console.log(chalk.gray('━'.repeat(50)));
console.log(chalk.cyan('Verificando órdenes programadas y estado del mercado\n'));

// Función para verificar si el mercado está abierto
function isMarketOpen() {
  const now = new Date();
  const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  const day = easternTime.getDay(); // 0 = Domingo, 6 = Sábado
  const hour = easternTime.getHours();
  const minute = easternTime.getMinutes();
  
  // Mercado cerrado en fines de semana
  if (day === 0 || day === 6) {
    return { isOpen: false, reason: 'Fin de semana' };
  }
  
  // Horario del mercado: 9:30 AM - 4:00 PM EST
  const marketOpen = 9.5; // 9:30 AM
  const marketClose = 16; // 4:00 PM
  const currentTime = hour + (minute / 60);
  
  if (currentTime < marketOpen) {
    return { isOpen: false, reason: `Mercado abre a las 9:30 AM EST (faltan ${marketOpen - currentTime} horas aprox)` };
  } else if (currentTime >= marketClose) {
    return { isOpen: false, reason: 'Mercado cerrado (cierra a las 4:00 PM EST)' };
  }
  
  return { isOpen: true, reason: 'Mercado abierto' };
}

async function checkOrders() {
  const spinner = ora('Conectando a Interactive Brokers...').start();
  
  return new Promise((resolve, reject) => {
    ibClient = new ib({
      clientId: 88, // ID diferente
      host: '127.0.0.1',
      port: 7496 // Cuenta real
    });

    let connectionTimeout = setTimeout(() => {
      spinner.fail('Timeout de conexión');
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
      spinner.succeed('✅ Conectado a IB');
      
      console.log(chalk.gray('📋 Solicitando órdenes abiertas...'));
      
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
      
      console.log(chalk.blue(`📋 Orden ${orderId}: ${order.action} ${order.totalQuantity} ${contract.symbol} (${orderState.status})`));
      
      if (orderState.filled > 0) {
        console.log(chalk.green(`   ✅ Ejecutadas: ${orderState.filled} @ $${orderState.avgFillPrice}`));
      }
      if (orderState.remaining > 0) {
        console.log(chalk.yellow(`   ⏳ Pendientes: ${orderState.remaining}`));
      }
    });

    ibClient.on('orderStatus', (orderId, status, filled, remaining, avgFillPrice) => {
      console.log(chalk.cyan(`📊 Status Orden ${orderId}: ${status} (${filled}/${filled + remaining})`));
    });

    ibClient.on('openOrderEnd', () => {
      console.log(chalk.cyan(`\n🏁 Total órdenes encontradas: ${pendingOrders.length}`));
    });

    ibClient.connect();
    ibClient.reqIds(1);
  });
}

function showResults() {
  // Verificar estado del mercado
  const marketStatus = isMarketOpen();
  
  console.log(chalk.yellow('\n' + '═'.repeat(60)));
  console.log(chalk.yellow.bold('📊 ESTADO DEL MERCADO'));
  console.log(chalk.yellow('═'.repeat(60)));
  
  if (marketStatus.isOpen) {
    console.log(chalk.green('🟢 MERCADO ABIERTO'));
  } else {
    console.log(chalk.red('🔴 MERCADO CERRADO'));
  }
  console.log(chalk.white(`Razón: ${marketStatus.reason}`));
  
  const now = new Date();
  const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  console.log(chalk.gray(`Hora actual EST: ${easternTime.toLocaleTimeString()}`));
  
  // Mostrar órdenes
  console.log(chalk.yellow('\n' + '═'.repeat(60)));
  console.log(chalk.yellow.bold('📋 ÓRDENES ABIERTAS/PENDIENTES'));
  console.log(chalk.yellow('═'.repeat(60)));
  
  if (pendingOrders.length > 0) {
    pendingOrders.forEach(order => {
      console.log(chalk.white(`\n🔸 Orden ${order.orderId}:`));
      console.log(chalk.white(`   ${order.action} ${order.quantity} ${order.symbol}`));
      console.log(chalk.white(`   Tipo: ${order.orderType}`));
      console.log(chalk.white(`   Estado: ${order.status}`));
      
      if (order.filled > 0) {
        console.log(chalk.green(`   ✅ Ejecutadas: ${order.filled} @ $${order.avgFillPrice}`));
      }
      if (order.remaining > 0) {
        console.log(chalk.yellow(`   ⏳ Pendientes: ${order.remaining}`));
      }
      
      // Verificar si es nuestra orden de Google
      if (order.symbol === 'GOOG' && order.action === 'SELL' && order.quantity === 5) {
        console.log(chalk.magenta('\n🎯 ¡ESTA ES TU ORDEN DE VENTA DE GOOGLE!'));
        if (order.status === 'Submitted' || order.status === 'PreSubmitted') {
          console.log(chalk.cyan('📅 Se ejecutará cuando abra el mercado mañana'));
        }
      }
    });
  } else {
    console.log(chalk.gray('❌ No se encontraron órdenes abiertas'));
    console.log(chalk.yellow('💡 Esto puede significar que:'));
    console.log(chalk.yellow('   - La orden ya se ejecutó'));
    console.log(chalk.yellow('   - La orden fue cancelada'));
    console.log(chalk.yellow('   - No se programó correctamente'));
  }
  
  // Próxima apertura del mercado
  if (!marketStatus.isOpen) {
    console.log(chalk.yellow('\n📅 PRÓXIMA APERTURA:'));
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1); // Si es domingo, saltar a lunes
    if (tomorrow.getDay() === 6) tomorrow.setDate(tomorrow.getDate() + 2); // Si es sábado, saltar a lunes
    
    console.log(chalk.white(`Mañana a las 9:30 AM EST`));
    console.log(chalk.gray('Las órdenes pendientes se ejecutarán automáticamente'));
  }
  
  console.log(chalk.yellow('\n' + '═'.repeat(60)));
}

async function main() {
  try {
    await checkOrders();
  } catch (error) {
    console.error(chalk.red('\n❌ Error verificando órdenes:'), error.message);
    console.log(chalk.yellow('💡 Asegúrate de que TWS esté abierto y conectado'));
  }
  
  console.log(chalk.gray('\n✨ Verificación de órdenes completada'));
}

// Manejo de cierre
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n👋 Cerrando verificador...'));
  if (ibClient) ibClient.disconnect();
  process.exit(0);
});

main().catch(console.error);