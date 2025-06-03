const ib = require('ib');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');

console.clear();

// Header estilo Apple
console.log(chalk.blue.bold('\n📊 Interactive Brokers Portfolio Tracker\n'));

async function selectEnvironment() {
  const { environment } = await inquirer.prompt([
    {
      type: 'list',
      name: 'environment',
      message: 'Selecciona tu ambiente:',
      choices: [
        {
          name: '💎 Cuenta Real (tu plata de verdad)',
          value: { port: 7496, name: 'REAL', color: 'green' }
        },
        {
          name: '🧪 Paper Trading (dinero de prueba)',
          value: { port: 7497, name: 'DEMO', color: 'yellow' }
        }
      ],
      default: 1
    }
  ]);

  return environment;
}

async function connectToIB(config) {
  const spinner = ora(`Conectando a ${config.name}...`).start();
  
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
      spinner.fail('Timeout - Revisa que TWS esté abierto y configurado');
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
      spinner.succeed(`Conectado a ${chalk[config.color].bold(config.name)}`);
      
      const dataSpinner = ora('Obteniendo información de tu portfolio...').start();
      
      // Solicitar cuentas manejadas
      client.reqManagedAccts();
      
      // Solicitar información de la cuenta
      client.reqAccountSummary(1, 'All', 'AccountType,NetLiquidation,TotalCashValue');
      
      // Solicitar posiciones actuales
      client.reqPositions();
      
      setTimeout(() => {
        dataSpinner.succeed('Datos obtenidos');
      }, 2000);
    });

    // Respuesta de cuentas manejadas
    client.on('managedAccounts', (accounts) => {
      console.log(chalk.gray(`\n👤 Cuenta: ${accounts}`));
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
      console.log(chalk.blue.bold('📈 TU PORTFOLIO'));
      console.log(chalk.blue('═'.repeat(50)));

      // Mostrar posiciones individuales
      if (positions.length > 0) {
        console.log(chalk.yellow('\n📊 Tus Acciones:'));
        positions.forEach(pos => {
          console.log(`  ${chalk.cyan(pos.symbol)}: ${pos.position} acciones a $${pos.avgCost.toFixed(2)} promedio`);
        });
      } else {
        console.log(chalk.yellow('\n📊 No tienes posiciones abiertas'));
      }

      // Cálculos principales
      const estimatedGain = netLiquidation - totalInvestment;
      const gainPercentage = totalInvestment > 0 ? (estimatedGain / totalInvestment) * 100 : 0;
      const annualizedReturn = gainPercentage * 6; // Asumiendo 2 meses
      const gainPerDay = estimatedGain / 60; // Asumiendo 60 días

      console.log(chalk.green('\n💰 Resumen Financiero:'));
      console.log(`  Valor total: ${chalk.bold.white('$' + netLiquidation.toFixed(2))}`);
      
      if (totalInvestment > 0) {
        const gainColor = estimatedGain >= 0 ? 'green' : 'red';
        const gainSign = estimatedGain >= 0 ? '+' : '';
        
        console.log(`  Ganancia: ${chalk[gainColor].bold(gainSign + '$' + estimatedGain.toFixed(2))}`);
        console.log(`  Rendimiento: ${chalk[gainColor].bold(gainSign + gainPercentage.toFixed(2) + '%')}`);
        console.log(`  Anualizado: ${chalk[gainColor].bold(gainSign + annualizedReturn.toFixed(2) + '%')}`);
        console.log(`  Por día: ${chalk[gainColor].bold(gainSign + '$' + gainPerDay.toFixed(2))}`);
      }

      console.log(chalk.blue('\n' + '═'.repeat(50)));
      
      if (config.name === 'DEMO') {
        console.log(chalk.yellow.bold('\n⚠️  MODO DEMO - Estos no son tus números reales'));
        console.log(chalk.gray('   Para ver tu cuenta real, ejecuta de nuevo y selecciona "Cuenta Real"'));
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
    console.log(chalk.gray('\n💡 Asegúrate de que TWS esté abierto y la API habilitada'));
  }
}

main();