import 'dotenv/config';
import ib from 'ib';
import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';
import OpenAI from 'openai';

// Configuración OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Variables globales
let ibClient = null;
let portfolio = {
  positions: [],
  cash: 0,
  totalValue: 0,
  accountId: null
};
let nextOrderId = null;

console.clear();
console.log(chalk.blue.bold('🤖 Interactive Brokers Trading Bot'));
console.log(chalk.gray('━'.repeat(50)));

// Phase 1: Real tech news search
async function searchTechNews() {
  const spinner = ora('🔍 Fetching real tech news...').start();
  
  try {
    // Lista de empresas tech a buscar
    const techSymbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'META'];
    const newsItems = [];
    
    // Usar Google News RSS como fuente gratuita
    for (const symbol of techSymbols) {
      try {
        // Buscar en Google News RSS (alternativa gratuita)
        const url = `https://news.google.com/rss/search?q=${symbol}+stock+market&hl=en-US&gl=US&ceid=US:en`;
        const response = await axios.get(url, { timeout: 5000 });
        
        // Parsear RSS básico
        const matches = response.data.match(/<title>(.*?)<\/title>/g) || [];
        const headlines = matches.slice(2, 4); // Tomar 2 noticias por empresa
        
        headlines.forEach(headline => {
          const cleanHeadline = headline.replace(/<\/?title>/g, '').replace(/&[^;]+;/g, '');
          
          // Análisis básico de sentimiento
          const positiveWords = /surge|rise|gain|profit|revenue|beat|breakthrough|innovation|upgrade/i;
          const negativeWords = /fall|drop|loss|decline|miss|lawsuit|investigation|concern|cut/i;
          
          let sentiment = 'neutral';
          if (positiveWords.test(cleanHeadline)) sentiment = 'positive';
          if (negativeWords.test(cleanHeadline)) sentiment = 'negative';
          
          newsItems.push({
            symbol: symbol,
            headline: cleanHeadline,
            sentiment: sentiment,
            impact: sentiment !== 'neutral' ? 'medium' : 'low',
            time: new Date().toISOString()
          });
        });
      } catch (err) {
        console.log(chalk.yellow(`  ⚠️  Could not fetch news for ${symbol}`));
      }
    }
    
    spinner.succeed(`✅ Found ${newsItems.length} news items`);
    console.log(chalk.yellow(`\n📰 News summary:`));
    newsItems.slice(0, 5).forEach(news => {
      const color = news.sentiment === 'positive' ? 'green' : news.sentiment === 'negative' ? 'red' : 'gray';
      console.log(chalk[color](`  • ${news.symbol}: ${news.headline.substring(0, 60)}...`));
    });
    
    return newsItems;
  } catch (error) {
    spinner.fail('❌ Error fetching news');
    console.error(error.message);
    return [];
  }
}

// Phase 2: Analysis with GPT-4.5
async function analyzeWithGPT(newsData, portfolio) {
  const spinner = ora('🧠 Analyzing with GPT-4.5...').start();
  
  try {
    // Construir el prompt según el plan
    const portfolioContext = `
Current portfolio:
- Positions: ${portfolio.positions.length > 0 ? 
    portfolio.positions.map(p => `${p.symbol}: ${p.shares} shares @ $${p.avgCost.toFixed(2)}`).join(', ') : 
    'No open positions'}
- Available cash: $${portfolio.cash.toFixed(2)}
- Total portfolio value: $${portfolio.totalValue.toFixed(2)}
`;

    const newsContext = `
Recent tech news:
${newsData.slice(0, 10).map(n => 
  `- ${n.symbol}: ${n.headline} (Sentiment: ${n.sentiment}, Impact: ${n.impact})`
).join('\n')}
`;

    const systemPrompt = `You are a conservative financial analyst focused on the technology sector.
Analyze the news and the current portfolio and suggest ONE conservative trading action.
Important:
- Only suggest BUY if there is available cash
- Only suggest SELL if we own the symbol
- Limit BUY to at most 10% of available cash
- Respond ONLY using the exact XML format`;

    const userPrompt = `${portfolioContext}

${newsContext}

Based on this information, suggest ONE trading action.
Respond ONLY in the following exact XML format (no extra text):

<trading_decision>
    <action>BUY/SELL/HOLD</action>
    <symbol>SYMBOL</symbol>
    <quantity>NUMBER</quantity>
    <reasoning>Brief explanation (max 50 words)</reasoning>
    <confidence>HIGH/MEDIUM/LOW</confidence>
    <expected_impact>Expected impact in one line</expected_impact>
</trading_decision>`;

    // Preparar el input para GPT-4.5
    const apiInput = [
      {
        "role": "system",
        "content": [
          {
            "type": "input_text",
            "text": systemPrompt
          }
        ]
      },
      {
        "role": "user",
        "content": [
          {
            "type": "input_text",
            "text": userPrompt
          }
        ]
      }
    ];

    console.log(chalk.gray('\n  📤 Sending to GPT-4.5...'));

    // Llamar a GPT-4.5 con el formato correcto
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
    
    spinner.succeed('✅ GPT-4.5 analysis completed');
    console.log(chalk.gray('\n  📥 Raw response:'), responseText.substring(0, 100) + '...');
    
    // Parsear la respuesta XML
    const decision = parseDecision(responseText);
    
    console.log(chalk.cyan('\n🎯 Trading decision:'));
    console.log(chalk.white(`  Action: ${chalk.bold(decision.action)}`));
    if (decision.symbol) console.log(chalk.white(`  Symbol: ${chalk.bold(decision.symbol)}`));
    if (decision.quantity) console.log(chalk.white(`  Quantity: ${chalk.bold(decision.quantity)}`));
    console.log(chalk.gray(`  Confidence: ${decision.confidence}`));
    console.log(chalk.gray(`  Reason: ${decision.reasoning}`));
    
    return decision;
  } catch (error) {
    spinner.fail('❌ Error in GPT-4.5 analysis');
    console.error(chalk.red('  Details:'), error.message);
    return { action: 'HOLD', reasoning: 'Analysis error: ' + error.message };
  }
}

// Parse XML decision
function parseDecision(xmlText) {
  try {
    // Extract only XML
    const xmlMatch = xmlText.match(/<trading_decision>[\s\S]*?<\/trading_decision>/);
    if (!xmlMatch) {
      console.error(chalk.red('  ❌ No valid XML found in the response'));
      return { action: 'HOLD', reasoning: 'Invalid XML format' };
    }
    
    const xml = xmlMatch[0];
    
    const action = xml.match(/<action>(.*?)<\/action>/)?.[1]?.trim() || 'HOLD';
    const symbol = xml.match(/<symbol>(.*?)<\/symbol>/)?.[1]?.trim() || '';
    const quantity = parseInt(xml.match(/<quantity>(.*?)<\/quantity>/)?.[1] || '0');
    const reasoning = xml.match(/<reasoning>(.*?)<\/reasoning>/s)?.[1]?.trim() || '';
    const confidence = xml.match(/<confidence>(.*?)<\/confidence>/)?.[1]?.trim() || 'LOW';
    const impact = xml.match(/<expected_impact>(.*?)<\/expected_impact>/)?.[1]?.trim() || '';
    
    // Validation
    if (!['BUY', 'SELL', 'HOLD'].includes(action)) {
      console.error(chalk.red(`  ❌ Invalid action: ${action}`));
      return { action: 'HOLD', reasoning: 'Invalid action' };
    }
    
    if ((action === 'BUY' || action === 'SELL') && (!symbol || quantity <= 0)) {
      console.error(chalk.red(`  ❌ Invalid symbol or quantity`));
      return { action: 'HOLD', reasoning: 'Invalid parameters' };
    }
    
    return { action, symbol, quantity, reasoning, confidence, impact };
  } catch (error) {
    console.error('Error parsing decision:', error);
    return { action: 'HOLD', reasoning: 'Error parsing: ' + error.message };
  }
}

// Phase 3: Execute decision in Interactive Brokers
async function executeDecision(decision) {
  console.log(chalk.yellow('\n⚡ Executing decision in IB...'));
  
  if (decision.action === 'HOLD') {
    console.log(chalk.blue('  ✅ Holding current positions'));
    return;
  }
  
  if (!nextOrderId) {
    console.error(chalk.red('  ❌ No Order ID available'));
    return;
  }
  
  try {
    if (decision.action === 'BUY') {
      // Verificar fondos disponibles
      const estimatedCost = decision.quantity * 150; // Precio estimado
      if (estimatedCost > portfolio.cash) {
        console.log(chalk.red(`  ❌ Insufficient funds. Needed: $${estimatedCost.toFixed(2)}, Available: $${portfolio.cash.toFixed(2)}`));
        return;
      }
      
      // Crear contrato
      const contract = ib.contract.stock(decision.symbol, 'SMART', 'USD');
      
      // Crear orden de compra
      const order = ib.order.market(decision.action, decision.quantity);
      
      console.log(chalk.green(`  📈 Submitting BUY order: ${decision.quantity} ${decision.symbol}`));
      
      // Colocar orden REAL
      ibClient.placeOrder(nextOrderId, contract, order);
      
      // Escuchar confirmación
      ibClient.on('orderStatus', (orderId, status, filled, remaining, avgFillPrice) => {
        if (orderId === nextOrderId) {
          console.log(chalk.green(`  ✅ Order ${orderId}: ${status} - Filled: ${filled}/${decision.quantity} @ $${avgFillPrice}`));
        }
      });
      
      nextOrderId++;
      
    } else if (decision.action === 'SELL') {
      // Verificar que tenemos la posición
      const position = portfolio.positions.find(p => p.symbol === decision.symbol);
      if (!position || position.shares < decision.quantity) {
        console.log(chalk.red(`  ❌ Not enough shares of ${decision.symbol}`));
        return;
      }
      
      // Crear contrato y orden
      const contract = ib.contract.stock(decision.symbol, 'SMART', 'USD');
      const order = ib.order.market(decision.action, decision.quantity);
      
      console.log(chalk.red(`  📉 Submitting SELL order: ${decision.quantity} ${decision.symbol}`));
      
      // Colocar orden REAL
      ibClient.placeOrder(nextOrderId, contract, order);
      
      // Escuchar confirmación
      ibClient.on('orderStatus', (orderId, status, filled, remaining, avgFillPrice) => {
        if (orderId === nextOrderId) {
          console.log(chalk.red(`  ✅ Order ${orderId}: ${status} - Sold: ${filled}/${decision.quantity} @ $${avgFillPrice}`));
        }
      });
      
      nextOrderId++;
    }
    
  } catch (error) {
    console.error(chalk.red('  ❌ Error executing order:'), error.message);
  }
}

// Connect to IB and fetch portfolio
async function connectAndGetPortfolio() {
  const spinner = ora('📊 Connecting to Interactive Brokers...').start();
  
  return new Promise((resolve) => {
    ibClient = new ib({
      clientId: 1,
      host: '127.0.0.1',
      port: 7497 // Paper trading para seguridad
    });

    // Limpiar posiciones anteriores
    portfolio.positions = [];

    ibClient.on('error', (err) => {
      const message = err.message.toLowerCase();
      if (!message.includes('conexión') && 
          !message.includes('funciona correctamente') && 
          !message.includes('hmds') &&
          !message.includes('modo solo lectura')) {
        console.error(chalk.red(`Error IB: ${err.message}`));
      }
    });

    ibClient.on('nextValidId', (orderId) => {
      spinner.succeed('✅ Connected to IB');
      nextOrderId = orderId;
      console.log(chalk.gray(`  Initial Order ID: ${nextOrderId}`));
      
      // Solicitar datos REALES del portfolio
      ibClient.reqAccountSummary(1, 'All', 'TotalCashValue,NetLiquidation');
      ibClient.reqPositions();
      
      // Esperar a que lleguen los datos
      setTimeout(() => {
        console.log(chalk.green('\n💼 Current portfolio:'));
        console.log(`  Cash: $${portfolio.cash.toFixed(2)}`);
        console.log(`  Total value: $${portfolio.totalValue.toFixed(2)}`);
        console.log(`  Positions: ${portfolio.positions.length}`);
        resolve();
      }, 3000);
    });

    // Recibir datos de cuenta REALES
    ibClient.on('accountSummary', (reqId, account, tag, value, currency) => {
      if (tag === 'TotalCashValue' && currency === 'USD') {
        portfolio.cash = parseFloat(value);
      }
      if (tag === 'NetLiquidation' && currency === 'USD') {
        portfolio.totalValue = parseFloat(value);
      }
      if (account) {
        portfolio.accountId = account;
      }
    });

    // Recibir posiciones REALES
    ibClient.on('position', (account, contract, pos, avgCost) => {
      if (pos !== 0) {
        const existingPos = portfolio.positions.find(p => p.symbol === contract.symbol);
        if (!existingPos) {
          portfolio.positions.push({
            symbol: contract.symbol,
            shares: pos,
            avgCost: avgCost,
            currentValue: pos * avgCost
          });
        }
      }
    });

    ibClient.connect();
    ibClient.reqIds(1);
  });
}

// Ciclo principal del bot
async function runTradingCycle() {
  console.log(chalk.blue.bold(`\n🔄 Starting trading cycle - ${new Date().toLocaleTimeString()}`));
  console.log(chalk.gray('━'.repeat(50)));
  
  try {
    // Actualizar datos del portfolio
    if (ibClient && ibClient.connected) {
      ibClient.reqAccountSummary(2, 'All', 'TotalCashValue,NetLiquidation');
      ibClient.reqPositions();
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Fase 1: Buscar noticias REALES
    const news = await searchTechNews();
    
    if (news.length === 0) {
      console.log(chalk.yellow('⚠️  No news available in this cycle'));
      return;
    }
    
    // Fase 2: Analizar con GPT-4.5 REAL
    const decision = await analyzeWithGPT(news, portfolio);
    
    // Fase 3: Ejecutar decisión REAL
    await executeDecision(decision);
    
    // Log del ciclo completado
    console.log(chalk.green('\n✅ Cycle completed'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Trading cycle error:'), error.message);
  }
  
  console.log(chalk.gray('\n' + '━'.repeat(50)));
}

// Main
async function main() {
  console.log(chalk.yellow('\n⚡ Starting Trading Bot...'));
  
  // Verificar API key
  if (
    !process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY === 'tu_api_key_aqui' ||
    process.env.OPENAI_API_KEY === 'your_api_key_here' ||
    process.env.OPENAI_API_KEY === 'your_key_here'
  ) {
    console.error(chalk.red('\n❌ ERROR: Set OPENAI_API_KEY in .env'));
    process.exit(1);
  }
  
  // Conectar a IB
  await connectAndGetPortfolio();
  
  // Run first cycle immediately
  await runTradingCycle();
  
  // Schedule cycle every 2 minutes
  console.log(chalk.cyan('\n🔄 Bot scheduled to run every 2 minutes'));
  console.log(chalk.gray('Press Ctrl+C to stop\n'));
  
  setInterval(runTradingCycle, 2 * 60 * 1000); // 2 minutos
}

// Manejo de cierre graceful
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n👋 Stopping Trading Bot...'));
  if (ibClient) {
    ibClient.disconnect();
  }
  process.exit(0);
});

// Iniciar bot
main().catch(console.error);
