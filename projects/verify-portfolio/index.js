require('dotenv').config();
const ib = require('ib');
const chalk = require('chalk');
const ora = require('ora');

// Variables para verificación
let portfolio = {
  positions: [],
  cash: 0,
  totalValue: 0,
  lastUpdate: null
};
let ibClient = null;

console.clear();
console.log(chalk.blue.bold('🔍 VERIFICADOR DE PORTFOLIO'));
console.log(chalk.gray('━'.repeat(50)));
console.log(chalk.cyan('Verificando estado actual de tu cuenta en IB\n'));

async function verifyPortfolio() {
  const spinner = ora('Conectando a Interactive Brokers...').start();
  
  return new Promise((resolve, reject) => {
    ibClient = new ib({
      clientId: 99, // ID diferente para no interferir
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

    ibClient.on('nextValidId', () => {
      clearTimeout(connectionTimeout);
      spinner.succeed('✅ Conectado a IB');
      
      console.log(chalk.gray('📊 Solicitando datos del portfolio...'));
      
      // Solicitar datos
      ibClient.reqAccountSummary(1, 'All', 'TotalCashValue,NetLiquidation');
      ibClient.reqPositions();
      
      // Dar tiempo para recibir datos
      setTimeout(() => {
        portfolio.lastUpdate = new Date();
        showResults();
        ibClient.disconnect();
        resolve();
      }, 5000);
    });

    // Recibir datos de cuenta
    ibClient.on('accountSummary', (reqId, account, tag, value, currency) => {
      if (tag === 'TotalCashValue' && currency === 'USD') {
        portfolio.cash = parseFloat(value);
        console.log(chalk.green(`💰 Efectivo: $${portfolio.cash.toFixed(2)}`));
      }
      if (tag === 'NetLiquidation' && currency === 'USD') {
        portfolio.totalValue = parseFloat(value);
        console.log(chalk.green(`📊 Valor total: $${portfolio.totalValue.toFixed(2)}`));
      }
    });

    // Recibir posiciones
    ibClient.on('position', (account, contract, pos, avgCost) => {
      if (pos !== 0) {
        const position = {
          symbol: contract.symbol,
          shares: pos,
          avgCost: avgCost,
          currentValue: pos * avgCost
        };
        portfolio.positions.push(position);
        console.log(chalk.blue(`📈 ${contract.symbol}: ${pos} acciones @ $${avgCost.toFixed(2)}`));
      }
    });

    ibClient.on('positionEnd', () => {
      console.log(chalk.cyan(`\n🏁 Total posiciones: ${portfolio.positions.length}`));
    });

    ibClient.connect();
    ibClient.reqIds(1);
  });
}

function showResults() {
  console.log(chalk.yellow('\n' + '═'.repeat(60)));
  console.log(chalk.yellow.bold('📋 RESUMEN DEL PORTFOLIO'));
  console.log(chalk.yellow('═'.repeat(60)));
  
  console.log(chalk.white(`Última actualización: ${portfolio.lastUpdate.toLocaleTimeString()}`));
  console.log(chalk.white(`Valor total: $${portfolio.totalValue.toFixed(2)}`));
  console.log(chalk.white(`Efectivo: $${portfolio.cash.toFixed(2)}`));
  console.log(chalk.white(`Capital invertido: $${(portfolio.totalValue - portfolio.cash).toFixed(2)}`));
  
  console.log(chalk.cyan('\n📊 POSICIONES DETALLADAS:'));
  if (portfolio.positions.length > 0) {
    portfolio.positions.forEach(pos => {
      const percentage = ((pos.currentValue / portfolio.totalValue) * 100).toFixed(1);
      console.log(chalk.white(`• ${pos.symbol}: ${pos.shares} acciones @ $${pos.avgCost.toFixed(2)}`));
      console.log(chalk.gray(`  Valor: $${pos.currentValue.toFixed(2)} (${percentage}% del portfolio)`));
    });
  } else {
    console.log(chalk.red('❌ No se detectaron posiciones'));
  }
  
  // Verificar si hubo cambios desde la última ejecución
  const googPosition = portfolio.positions.find(p => p.symbol === 'GOOG' || p.symbol === 'GOOGL');
  if (googPosition) {
    console.log(chalk.magenta('\n🔍 VERIFICACIÓN GOOGLE:'));
    console.log(chalk.white(`Tienes ${googPosition.shares} acciones de ${googPosition.symbol}`));
    
    if (googPosition.shares === 44) {
      console.log(chalk.green('✅ LA VENTA SE EJECUTÓ! (49 → 44 acciones)'));
    } else if (googPosition.shares === 49) {
      console.log(chalk.red('❌ La venta NO se ejecutó (sigues con 49 acciones)'));
    } else {
      console.log(chalk.yellow(`⚠️  Cantidad inesperada: ${googPosition.shares} acciones`));
    }
  } else {
    console.log(chalk.red('\n❌ No se encontraron acciones de Google'));
  }
  
  console.log(chalk.yellow('\n' + '═'.repeat(60)));
}

async function main() {
  try {
    await verifyPortfolio();
  } catch (error) {
    console.error(chalk.red('\n❌ Error verificando portfolio:'), error.message);
    console.log(chalk.yellow('💡 Asegúrate de que TWS esté abierto y conectado'));
  }
  
  console.log(chalk.gray('\n✨ Verificación completada'));
}

// Manejo de cierre
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n👋 Cerrando verificador...'));
  if (ibClient) ibClient.disconnect();
  process.exit(0);
});

main().catch(console.error);