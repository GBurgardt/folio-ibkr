import 'dotenv/config';
import ib from 'ib';
import chalk from 'chalk';
import ora from 'ora';

// Variables para verificación
let portfolio = {
  positions: [],
  cash: 0,
  totalValue: 0,
  lastUpdate: null
};
let ibClient = null;

console.clear();
console.log(chalk.blue.bold('🔍 PORTFOLIO CHECKER'));
console.log(chalk.gray('━'.repeat(50)));
console.log(chalk.cyan('Checking current account state in IB\n'));

async function verifyPortfolio() {
  const spinner = ora('Connecting to Interactive Brokers...').start();
  
  return new Promise((resolve, reject) => {
    ibClient = new ib({
      clientId: 99, // ID diferente para no interferir
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

    ibClient.on('nextValidId', () => {
      clearTimeout(connectionTimeout);
      spinner.succeed('✅ Connected to IB');
      
      console.log(chalk.gray('📊 Requesting portfolio data...'));
      
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
        console.log(chalk.green(`💰 Cash: $${portfolio.cash.toFixed(2)}`));
      }
      if (tag === 'NetLiquidation' && currency === 'USD') {
        portfolio.totalValue = parseFloat(value);
        console.log(chalk.green(`📊 Total value: $${portfolio.totalValue.toFixed(2)}`));
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
        console.log(chalk.blue(`📈 ${contract.symbol}: ${pos} shares @ $${avgCost.toFixed(2)}`));
      }
    });

    ibClient.on('positionEnd', () => {
      console.log(chalk.cyan(`\n🏁 Total positions: ${portfolio.positions.length}`));
    });

    ibClient.connect();
    ibClient.reqIds(1);
  });
}

function showResults() {
  console.log(chalk.yellow('\n' + '═'.repeat(60)));
  console.log(chalk.yellow.bold('📋 PORTFOLIO SUMMARY'));
  console.log(chalk.yellow('═'.repeat(60)));
  
  console.log(chalk.white(`Last update: ${portfolio.lastUpdate.toLocaleTimeString()}`));
  console.log(chalk.white(`Total value: $${portfolio.totalValue.toFixed(2)}`));
  console.log(chalk.white(`Cash: $${portfolio.cash.toFixed(2)}`));
  console.log(chalk.white(`Invested capital: $${(portfolio.totalValue - portfolio.cash).toFixed(2)}`));
  
  console.log(chalk.cyan('\n📊 POSITIONS:'));
  if (portfolio.positions.length > 0) {
    portfolio.positions.forEach(pos => {
      const percentage = ((pos.currentValue / portfolio.totalValue) * 100).toFixed(1);
      console.log(chalk.white(`• ${pos.symbol}: ${pos.shares} shares @ $${pos.avgCost.toFixed(2)}`));
      console.log(chalk.gray(`  Value: $${pos.currentValue.toFixed(2)} (${percentage}% of portfolio)`));
    });
  } else {
    console.log(chalk.red('❌ No positions detected'));
  }
  
  // Verificar si hubo cambios desde la última ejecución
  const googPosition = portfolio.positions.find(p => p.symbol === 'GOOG' || p.symbol === 'GOOGL');
  if (googPosition) {
    console.log(chalk.magenta('\n🔍 GOOGLE CHECK:'));
    console.log(chalk.white(`You have ${googPosition.shares} shares of ${googPosition.symbol}`));
    
    if (googPosition.shares === 44) {
      console.log(chalk.green('✅ SELL FILLED (49 → 44 shares)'));
    } else if (googPosition.shares === 49) {
      console.log(chalk.red('❌ SELL NOT FILLED (still 49 shares)'));
    } else {
      console.log(chalk.yellow(`⚠️  Unexpected quantity: ${googPosition.shares} shares`));
    }
  } else {
    console.log(chalk.red('\n❌ No Google position found'));
  }
  
  console.log(chalk.yellow('\n' + '═'.repeat(60)));
}

async function main() {
  try {
    await verifyPortfolio();
  } catch (error) {
    console.error(chalk.red('\n❌ Error checking portfolio:'), error.message);
    console.log(chalk.yellow('💡 Make sure TWS is running and the API is enabled'));
  }
  
  console.log(chalk.gray('\n✨ Check completed'));
}

// Manejo de cierre
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n👋 Shutting down...'));
  if (ibClient) ibClient.disconnect();
  process.exit(0);
});

main().catch(console.error);
