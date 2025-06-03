require('dotenv').config();
const ib = require('ib');
const chalk = require('chalk');
const ora = require('ora');
const axios = require('axios');
const OpenAI = require('openai');

// Configuración OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Variables globales
let ibClient = null;
let portfolio = {
  positions: [],
  cash: 0,
  totalValue: 0
};

console.clear();
console.log(chalk.blue.bold('🤖 Interactive Brokers Trading Bot'));
console.log(chalk.gray('━'.repeat(50)));

// Fase 1: Búsqueda de noticias tecnológicas
async function searchTechNews() {
  const spinner = ora('🔍 Buscando noticias tecnológicas...').start();
  
  try {
    // Lista de empresas tech a buscar
    const techCompanies = ['Apple', 'Google', 'Microsoft', 'Tesla', 'NVIDIA', 'Amazon', 'Meta'];
    const newsItems = [];
    
    // Simulación de búsqueda de noticias (en producción usar NewsAPI o similar)
    for (const company of techCompanies) {
      // Por ahora simulamos con datos mock
      newsItems.push({
        company: company,
        headline: `${company} announces new developments`,
        sentiment: Math.random() > 0.5 ? 'positive' : 'negative',
        impact: Math.random() > 0.7 ? 'high' : 'medium',
        time: new Date().toISOString()
      });
    }
    
    spinner.succeed(`✅ Encontradas ${newsItems.length} noticias relevantes`);
    console.log(chalk.yellow(`\n📰 Resumen de noticias:`));
    newsItems.slice(0, 3).forEach(news => {
      const color = news.sentiment === 'positive' ? 'green' : 'red';
      console.log(chalk[color](`  • ${news.company}: ${news.sentiment} (${news.impact} impact)`));
    });
    
    return newsItems;
  } catch (error) {
    spinner.fail('❌ Error buscando noticias');
    console.error(error);
    return [];
  }
}

// Fase 2: Análisis con GPT-4.5
async function analyzeWithGPT(newsData, portfolio) {
  const spinner = ora('🧠 Analizando con GPT-4.5...').start();
  
  try {
    // Construir el prompt según el plan
    const portfolioContext = `
Portfolio actual:
- Posiciones: ${portfolio.positions.map(p => `${p.symbol}: ${p.shares} acciones a $${p.avgCost}`).join(', ') || 'Ninguna'}
- Efectivo disponible: $${portfolio.cash.toFixed(2)}
- Valor total: $${portfolio.totalValue.toFixed(2)}
`;

    const newsContext = `
Noticias recientes del sector tecnológico:
${newsData.map(n => `- ${n.company}: ${n.headline} (${n.sentiment}, impacto ${n.impact})`).join('\n')}
`;

    const prompt = `
${portfolioContext}

${newsContext}

Basándote en esta información, sugiere UNA SOLA acción de trading. 
Responde ÚNICAMENTE en el siguiente formato XML:

<trading_decision>
    <action>BUY/SELL/HOLD</action>
    <symbol>SYMBOL</symbol>
    <quantity>NUMBER</quantity>
    <reasoning>Explicación breve</reasoning>
    <confidence>HIGH/MEDIUM/LOW</confidence>
    <expected_impact>Impacto esperado</expected_impact>
</trading_decision>
`;

    // Preparar el input para GPT-4.5
    const apiInput = [
      {
        "role": "system",
        "content": [
          {
            "type": "input_text",
            "text": "Eres un experto analista financiero especializado en el sector tecnológico. Analiza la información y sugiere UNA acción de trading conservadora."
          }
        ]
      },
      {
        "role": "user",
        "content": [
          {
            "type": "input_text",
            "text": prompt
          }
        ]
      }
    ];

    // Llamar a GPT-4.5
    const response = await openai.responses.create({
      model: "gpt-4.5-preview",
      input: apiInput,
      text: {
        "format": {
          "type": "text"
        }
      },
      reasoning: {},
      tools: [],
      temperature: 0.3,
      max_output_tokens: 500,
      top_p: 0.9,
      store: true
    });

    const responseText = response.output?.[0]?.content?.[0]?.text || "";
    
    spinner.succeed('✅ Análisis completado');
    
    // Parsear la respuesta XML
    const decision = parseDecision(responseText);
    
    console.log(chalk.cyan('\n🎯 Decisión de trading:'));
    console.log(chalk.white(`  Acción: ${chalk.bold(decision.action)}`));
    if (decision.symbol) console.log(chalk.white(`  Símbolo: ${chalk.bold(decision.symbol)}`));
    if (decision.quantity) console.log(chalk.white(`  Cantidad: ${chalk.bold(decision.quantity)}`));
    console.log(chalk.gray(`  Confianza: ${decision.confidence}`));
    console.log(chalk.gray(`  Razón: ${decision.reasoning}`));
    
    return decision;
  } catch (error) {
    spinner.fail('❌ Error en análisis GPT-4.5');
    console.error(error);
    return { action: 'HOLD', reasoning: 'Error en análisis' };
  }
}

// Parsear decisión XML
function parseDecision(xmlText) {
  try {
    const action = xmlText.match(/<action>(.*?)<\/action>/)?.[1] || 'HOLD';
    const symbol = xmlText.match(/<symbol>(.*?)<\/symbol>/)?.[1] || '';
    const quantity = parseInt(xmlText.match(/<quantity>(.*?)<\/quantity>/)?.[1] || '0');
    const reasoning = xmlText.match(/<reasoning>(.*?)<\/reasoning>/)?.[1] || '';
    const confidence = xmlText.match(/<confidence>(.*?)<\/confidence>/)?.[1] || 'LOW';
    const impact = xmlText.match(/<expected_impact>(.*?)<\/expected_impact>/)?.[1] || '';
    
    return { action, symbol, quantity, reasoning, confidence, impact };
  } catch (error) {
    console.error('Error parseando decisión:', error);
    return { action: 'HOLD', reasoning: 'Error parsing' };
  }
}

// Fase 3: Ejecutar decisión
async function executeDecision(decision) {
  console.log(chalk.yellow('\n⚡ Ejecutando decisión...'));
  
  // Por ahora solo simulamos
  if (decision.action === 'BUY') {
    console.log(chalk.green(`  ✅ SIMULACIÓN: Comprando ${decision.quantity} acciones de ${decision.symbol}`));
    console.log(chalk.gray(`  Costo estimado: $${(decision.quantity * 150).toFixed(2)}`));
  } else if (decision.action === 'SELL') {
    console.log(chalk.red(`  ✅ SIMULACIÓN: Vendiendo ${decision.quantity} acciones de ${decision.symbol}`));
    console.log(chalk.gray(`  Ingreso estimado: $${(decision.quantity * 150).toFixed(2)}`));
  } else {
    console.log(chalk.blue('  ✅ Manteniendo posiciones actuales'));
  }
}

// Conectar a IB y obtener portfolio
async function connectAndGetPortfolio() {
  const spinner = ora('📊 Conectando a Interactive Brokers...').start();
  
  return new Promise((resolve) => {
    ibClient = new ib({
      clientId: 1,
      host: '127.0.0.1',
      port: 7497 // Paper trading
    });

    ibClient.on('error', (err) => {
      const message = err.message.toLowerCase();
      if (!message.includes('conexión') && 
          !message.includes('funciona correctamente') && 
          !message.includes('hmds') &&
          !message.includes('modo solo lectura')) {
        console.error(chalk.red(`Error IB: ${err.message}`));
      }
    });

    ibClient.on('nextValidId', () => {
      spinner.succeed('✅ Conectado a IB');
      
      // Solicitar datos del portfolio
      ibClient.reqAccountSummary(1, 'All', 'TotalCashValue,NetLiquidation');
      ibClient.reqPositions();
      
      // Simular que recibimos datos después de 2 segundos
      setTimeout(() => {
        portfolio.cash = 10000; // Simulado
        portfolio.totalValue = 20000; // Simulado
        resolve();
      }, 2000);
    });

    ibClient.connect();
    ibClient.reqIds(1);
  });
}

// Ciclo principal del bot
async function runTradingCycle() {
  console.log(chalk.blue.bold(`\n🔄 Iniciando ciclo de trading - ${new Date().toLocaleTimeString()}`));
  console.log(chalk.gray('━'.repeat(50)));
  
  try {
    // Fase 1: Buscar noticias
    const news = await searchTechNews();
    
    // Fase 2: Analizar con GPT-4.5
    const decision = await analyzeWithGPT(news, portfolio);
    
    // Fase 3: Ejecutar decisión
    await executeDecision(decision);
    
    // Log del ciclo completado
    console.log(chalk.green('\n✅ Ciclo completado exitosamente'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Error en ciclo de trading:'), error);
  }
  
  console.log(chalk.gray('\n' + '━'.repeat(50)));
}

// Main
async function main() {
  console.log(chalk.yellow('\n⚡ Iniciando Trading Bot...'));
  
  // Verificar API key
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'tu_api_key_aqui') {
    console.error(chalk.red('\n❌ ERROR: Configura tu OPENAI_API_KEY en el archivo .env'));
    process.exit(1);
  }
  
  // Conectar a IB
  await connectAndGetPortfolio();
  
  // Ejecutar primer ciclo inmediatamente
  await runTradingCycle();
  
  // Configurar ciclo cada 2 minutos
  console.log(chalk.cyan('\n🔄 Bot configurado para ejecutarse cada 2 minutos'));
  console.log(chalk.gray('Presiona Ctrl+C para detener\n'));
  
  setInterval(runTradingCycle, 2 * 60 * 1000); // 2 minutos
}

// Manejo de cierre graceful
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n👋 Deteniendo Trading Bot...'));
  if (ibClient) {
    ibClient.disconnect();
  }
  process.exit(0);
});

// Iniciar bot
main().catch(console.error);