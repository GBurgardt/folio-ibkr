import ib from 'ib';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';

console.clear();

// Header estilo Apple
console.log(chalk.blue.bold('\n📊 Interactive Brokers Portfolio Tracker\n'));

async function selectEnvironment() {
  const { environment } = await inquirer.prompt([
    {
      type: 'list',
      name: 'environment',
      message: 'Select environment:',
      choices: [
        {
          name: '💎 Live account',
          value: { port: 7496, name: 'LIVE', color: 'green' }
        },
        {
          name: '🧪 Paper trading',
          value: { port: 7497, name: 'PAPER', color: 'yellow' }
        }
      ],
      default: 1
    }
  ]);

  return environment;
}

async function connectToIB(config) {
  const spinner = ora(`Connecting to ${config.name}...`).start();
  
  // Variables para cálculos
  let totalInvestment = 0;
  let positions = [];
  let netLiquidation = 0;
  let accountSummaryComplete = false;
  let positionsComplete = false;

  // Crear cliente IB
  const client = new ib({
    clientId: 0,
    host: '127.0.0.1',
    port: config.port
  });

  return new Promise((resolve, reject) => {
    let connectionTimeout = setTimeout(() => {
      spinner.fail('Timeout — make sure TWS is running and configured');
      reject(new Error('Connection timeout'));
    }, 10000);

    // Manejador de errores - filtrar mensajes informativos
    client.on('error', (err) => {
      const message = err.message.toLowerCase();
      if (!message.includes('conexión') && 
          !message.includes('funciona correctamente') && 
          !message.includes('hmds') &&
          !message.includes('modo solo lectura')) {
        spinner.fail(`Error: ${err.message}`);
        reject(err);
      }
    });

    // Cuando se conecta exitosamente
    client.on('nextValidId', (orderId) => {
      clearTimeout(connectionTimeout);
      spinner.succeed(`Connected to ${chalk[config.color].bold(config.name)}`);
      
      const dataSpinner = ora('Fetching your portfolio...').start();
      
      // Solicitar cuentas manejadas
      client.reqManagedAccts();
      
      // Solicitar información de la cuenta
      client.reqAccountSummary(1, 'All', 'AccountType,NetLiquidation,TotalCashValue');
      
      // Solicitar posiciones actuales
      client.reqPositions();
      
      setTimeout(() => {
        dataSpinner.succeed('Data received');
      }, 2000);
    });

    // Respuesta de cuentas manejadas
    client.on('managedAccounts', (accounts) => {
      console.log(chalk.gray(`\n👤 Account: ${accounts}`));
    });

    // Respuesta del resumen de cuenta
    client.on('accountSummary', (reqId, account, tag, value, currency) => {
      // Capturar NetLiquidation para cálculos
      if (tag === 'NetLiquidation' && currency === 'USD') {
        netLiquidation = parseFloat(value);
      }
    });

    // Respuesta de posiciones
    client.on('position', (account, contract, position, avgCost) => {
      if (position !== 0) {
        const currentValue = position * avgCost;
        const positionData = {
          symbol: contract.symbol,
          position: position,
          avgCost: avgCost,
          currentValue: currentValue
        };
        positions.push(positionData);
        totalInvestment += currentValue;
      }
    });

    // Cuando termina el resumen de cuenta
    client.on('accountSummaryEnd', (reqId) => {
      accountSummaryComplete = true;
      checkIfComplete();
    });

    // Cuando terminan las posiciones
    client.on('positionEnd', () => {
      positionsComplete = true;
      checkIfComplete();
    });

    function checkIfComplete() {
      if (accountSummaryComplete && positionsComplete) {
        showResults();
        client.disconnect();
        resolve();
      }
    }

    function showResults() {
      console.log('\n' + chalk.blue('═'.repeat(50)));
      console.log(chalk.blue.bold('📈 YOUR PORTFOLIO'));
      console.log(chalk.blue('═'.repeat(50)));

      // Mostrar posiciones individuales
      if (positions.length > 0) {
        console.log(chalk.yellow('\n📊 Positions:'));
        positions.forEach(pos => {
          console.log(`  ${chalk.cyan(pos.symbol)}: ${pos.position} shares @ $${pos.avgCost.toFixed(2)} avg`);
        });
      } else {
        console.log(chalk.yellow('\n📊 No open positions'));
      }

      // Cálculos principales
      const estimatedGain = netLiquidation - totalInvestment;
      const gainPercentage = totalInvestment > 0 ? (estimatedGain / totalInvestment) * 100 : 0;
      const annualizedReturn = gainPercentage * 6; // Asumiendo 2 meses
      const gainPerDay = estimatedGain / 60; // Asumiendo 60 días

      console.log(chalk.green('\n💰 Summary:'));
      console.log(`  Total value: ${chalk.bold.white('$' + netLiquidation.toFixed(2))}`);
      
      if (totalInvestment > 0) {
        const gainColor = estimatedGain >= 0 ? 'green' : 'red';
        const gainSign = estimatedGain >= 0 ? '+' : '';
        
        console.log(`  Gain: ${chalk[gainColor].bold(gainSign + '$' + estimatedGain.toFixed(2))}`);
        console.log(`  Return: ${chalk[gainColor].bold(gainSign + gainPercentage.toFixed(2) + '%')}`);
        console.log(`  Annualized: ${chalk[gainColor].bold(gainSign + annualizedReturn.toFixed(2) + '%')}`);
        console.log(`  Per day: ${chalk[gainColor].bold(gainSign + '$' + gainPerDay.toFixed(2))}`);
      }

      console.log(chalk.blue('\n' + '═'.repeat(50)));
      
      if (config.name === 'PAPER') {
        console.log(chalk.yellow.bold('\n⚠️  PAPER MODE — these are not your live numbers'));
        console.log(chalk.gray('   To use your live account, re-run and select "Live account"'));
      }
      
      console.log('');
    }

    // Iniciar conexión
    client.connect();
    client.reqIds(1);
  });
}

async function main() {
  try {
    const config = await selectEnvironment();
    console.clear(); // Limpiar después de seleccionar
    await connectToIB(config);
  } catch (error) {
    console.log(chalk.red('\n❌ Error: '), error.message);
    console.log(chalk.gray('\n💡 Make sure TWS is running and the API is enabled'));
  }
}

main();
