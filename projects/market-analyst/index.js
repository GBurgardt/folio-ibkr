import 'dotenv/config';
import ib from 'ib';
import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';
import OpenAI from 'openai';
import inquirer from 'inquirer';

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
let reqIdCounter = 10;

function nextReqId() {
  reqIdCounter += 1;
  return reqIdCounter;
}

console.clear();
console.log(chalk.blue.bold('🧠 Market Intelligence Analyst'));
console.log(chalk.gray('━'.repeat(50)));
console.log(chalk.cyan('Your personal market analyst — crisp, pragmatic, no fluff.\n'));

// Selector de ambiente
async function selectEnvironment() {
  const { environment } = await inquirer.prompt([
    {
      type: 'list',
      name: 'environment',
      message: 'Select environment:',
      choices: [
        {
          name: '💎 Live (port 7496)',
          value: { port: 7496, name: 'LIVE', color: 'green' }
        },
        {
          name: '🧪 Paper (port 7497)',
          value: { port: 7497, name: 'PAPER', color: 'yellow' }
        }
      ],
      default: 1
    }
  ]);

  return environment;
}

// Fase 1: Búsqueda REAL de noticias tecnológicas
async function searchTechNews() {
  const spinner = ora('🔍 Scanning the tech market...').start();
  
  try {
    const techSymbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'META'];
    const newsItems = [];
    const marketData = {};
    
    // Obtener noticias de cada empresa
    for (const symbol of techSymbols) {
      try {
        const url = `https://news.google.com/rss/search?q=${symbol}+stock+market+today&hl=en-US&gl=US&ceid=US:en`;
        const response = await axios.get(url, { timeout: 5000 });
        
        // Parsear RSS
        const matches = response.data.match(/<title>(.*?)<\/title>/g) || [];
        const headlines = matches.slice(2, 5); // Top 3 noticias
        
        const companyNews = [];
        headlines.forEach(headline => {
          const cleanHeadline = headline.replace(/<\/?title>/g, '').replace(/&[^;]+;/g, '');
          
          // Análisis de sentimiento mejorado
          const positiveWords = /surge|soar|jump|rally|gain|profit|revenue|beat|breakthrough|innovation|upgrade|record|boost/i;
          const negativeWords = /plunge|crash|fall|drop|loss|decline|miss|lawsuit|investigation|concern|cut|layoff|warning/i;
          
          let sentiment = 'neutral';
          let intensity = 'normal';
          
          if (positiveWords.test(cleanHeadline)) {
            sentiment = 'positive';
            if (/surge|soar|jump|rally|record/i.test(cleanHeadline)) intensity = 'strong';
          }
          if (negativeWords.test(cleanHeadline)) {
            sentiment = 'negative';
            if (/plunge|crash|lawsuit|layoff/i.test(cleanHeadline)) intensity = 'strong';
          }
          
          companyNews.push({
            headline: cleanHeadline,
            sentiment: sentiment,
            intensity: intensity
          });
        });
        
        marketData[symbol] = companyNews;
        newsItems.push(...companyNews.map(n => ({ symbol, ...n })));
        
      } catch (err) {
        // Silenciosamente continuar
      }
    }
    
    spinner.succeed(`✅ Market scan completed`);
    console.log(chalk.yellow(`\n📊 Detected ${newsItems.length} market signals`));
    
    return { newsItems, marketData };
  } catch (error) {
    spinner.fail('❌ Market scan error');
    return { newsItems: [], marketData: {} };
  }
}

// Fase 2: Análisis profundo con OpenAI
async function analyzeMarketWithGPT(marketData, portfolio) {
  const spinner = ora('🤖 Processing market intelligence with OpenAI (GPT-5)...').start();
  
  try {
    // Prepare portfolio context (real IB data)
    const portfolioContext = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT PORTFOLIO (REAL DATA FROM INTERACTIVE BROKERS):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FINANCIAL SUMMARY:
• Total portfolio value: $${portfolio.totalValue.toFixed(2)}
• Available cash: $${portfolio.cash.toFixed(2)}
• Invested capital: $${(portfolio.totalValue - portfolio.cash).toFixed(2)}

CURRENT POSITIONS:
${portfolio.positions.length > 0 ? 
    portfolio.positions.map(p => {
      const currentValue = p.shares * p.avgCost;
      const percentage = ((currentValue / portfolio.totalValue) * 100).toFixed(1);
      return `
• ${p.symbol}: 
  - Shares: ${p.shares}
  - Avg price: $${p.avgCost.toFixed(2)}
  - Total value: $${currentValue.toFixed(2)}
  - Portfolio weight: ${percentage}%
  - Max sellable: ${p.shares} shares`;
    }).join('') : 
    '\n• No open positions'}

ORDER CONSTRAINTS:
• You can BUY only if the estimated cost ≤ $${portfolio.cash.toFixed(2)} (available cash)
• You can SELL only shares you currently own
• Sellable symbols:
${portfolio.positions.length > 0 ? 
    portfolio.positions.map(p => `  - ${p.symbol}: max ${p.shares} shares`).join('\n') : 
    '  - None (no positions)'}

IMPORTANT: For executable actions, respect these limits exactly.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

    // Prepare news context
    const newsContext = `
TECH MARKET SNAPSHOT TODAY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${Object.entries(marketData.marketData).map(([symbol, news]) => {
  if (news.length === 0) return '';
  const sentiment = news.filter(n => n.sentiment === 'positive').length > news.filter(n => n.sentiment === 'negative').length ? '📈' : '📉';
  return `
${symbol} ${sentiment}:
${news.slice(0, 2).map(n => `• ${n.headline}`).join('\n')}`;
}).filter(s => s).join('\n')}
`;

    const systemPrompt = `You are two versions of Steve Jobs debating with surgical precision and extreme simplicity. Your goal: respond in clear, pragmatic English to: "Are my investments doing well or poorly, and what minimal decision can I execute right now?" Use only the provided portfolio + market signals; do not invent data.

Output format (MANDATORY): respond ONLY with the following XML (exactly these 5 sections) and no extra text outside the XML:

<analysis>
  <panorama> … brief market snapshot, simple metaphors grounded in signals … </panorama>
  <monologo>
    … EXACTLY 100 numbered lines, 1..100, alternating "SJ1:" and "SJ2:" …
  </monologo>
  <conclusion> … direct verdict: "doing well/poorly and why" in ≤3 sentences … </conclusion>
  <accion_estrategica> … strategic context: how to think over months, no orders … </accion_estrategica>
  <accion_ejecutable>
    … ONE immediate, executable action in Interactive Brokers …
  </accion_ejecutable>
</analysis>

Rules for <monologo>:
- Must be exactly 100 lines, numbered 1..100.
- Each line must start with "SJ1:" or "SJ2:" alternating naturally.
- Minimal, visual, concrete. This is thinking, not the order.

Absolute rules for <accion_ejecutable>:
- Allowed structure (choose ONLY one):
  BUY option:
    <accion_ejecutable>
      <side>BUY</side>
      <symbol>ONE_OF[AAPL,GOOGL,GOOG,MSFT,TSLA,NVDA,AMZN,META]</symbol>
      <quantity>POSITIVE_INTEGER</quantity>
      <order_type>MARKET</order_type>
    </accion_ejecutable>
  SELL option:
    <accion_ejecutable>
      <side>SELL</side>
      <symbol>ONE_OF_THE_SYMBOLS_YOU_OWN</symbol>
      <quantity>POSITIVE_INTEGER</quantity>
      <order_type>MARKET</order_type>
    </accion_ejecutable>
  HOLD option:
    <accion_ejecutable>
      <side>HOLD</side>
    </accion_ejecutable>

Validations (MANDATORY) before the action:
- BUY: (quantity × estimated_price) ≤ available_cash. If you cannot estimate or funds are insufficient, choose HOLD.
- SELL: quantity ≤ shares actually owned for the selected symbol.
- If the user owns GOOG/GOOGL, map and use the ticker that actually exists in positions.
- If validations fail, respond HOLD.

Decision criteria:
- Cash is limited: if insufficient, avoid BUY.
- Only SELL with a clear reason (rebalance, risk management, broken thesis). Avoid panic selling.
- If there is no high-quality, low-friction executable action, choose HOLD with a short strong justification.

Style:
- Simple English. Short sentences. No jargon.
- No emojis. No text outside the XML.
- Be strict with formatting (easy parsing).`;

    const userPrompt = `${portfolioContext}

${newsContext}

Generate the response using the exact XML specified. Reminder: <monologo> must be 100 lines alternating SJ1/SJ2 and <accion_ejecutable> must respect all validations.`;

    // Preparar input para OpenAI
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

    // Llamar a OpenAI con GPT-5 (parámetros mínimos compatibles)
    const response = await openai.responses.create({
      model: "gpt-5",
      input: apiInput,
      max_output_tokens: 5000
    });

    const responseText =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text || "";
    
    spinner.succeed('✅ Analysis completed');
    
    return parseAnalysis(responseText);
    
  } catch (error) {
    spinner.fail('❌ Analysis failed');
    console.error(chalk.red('Details:'), error.message);
    return null;
  }
}

// Parser mejorado para el análisis
function parseAnalysis(xmlText) {
  try {
    const analysisMatch = xmlText.match(/<analysis>([\s\S]*?)<\/analysis>/);
    if (!analysisMatch) {
      console.error(chalk.red('No valid analysis found'));
      return null;
    }
    
    const analysis = analysisMatch[1];
    
    const panorama = analysis.match(/<panorama>([\s\S]*?)<\/panorama>/)?.[1]?.trim() || '';
    const monologo = analysis.match(/<monologo>([\s\S]*?)<\/monologo>/)?.[1]?.trim() || '';
    const conclusion = analysis.match(/<conclusion>([\s\S]*?)<\/conclusion>/)?.[1]?.trim() || '';
    const accionEstrategica = analysis.match(/<accion_estrategica>([\s\S]*?)<\/accion_estrategica>/)?.[1]?.trim() || '';
    const accionEjecutable = analysis.match(/<accion_ejecutable>([\s\S]*?)<\/accion_ejecutable>/)?.[1]?.trim() || '';
    
    // Parsear la acción ejecutable
    let tradingAction = null;
    if (accionEjecutable) {
      const side = accionEjecutable.match(/<side>(.*?)<\/side>/)?.[1]?.trim();
      const symbol = accionEjecutable.match(/<symbol>(.*?)<\/symbol>/)?.[1]?.trim();
      const quantity = parseInt(accionEjecutable.match(/<quantity>(.*?)<\/quantity>/)?.[1] || '0');
      const orderType = accionEjecutable.match(/<order_type>(.*?)<\/order_type>/)?.[1]?.trim();
      
      if (side) {
        tradingAction = { side, symbol, quantity, orderType };
        
        // Validar la acción
        if (!['BUY', 'SELL', 'HOLD'].includes(side)) {
          console.error(chalk.red(`❌ Invalid side: ${side}`));
          tradingAction = { side: 'HOLD' };
        }
        
        if ((side === 'BUY' || side === 'SELL') && (!symbol || quantity <= 0)) {
          console.error(chalk.red(`❌ Invalid parameters for ${side}`));
          tradingAction = { side: 'HOLD' };
        }
        
        const validSymbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'META'];
        if (symbol && !validSymbols.includes(symbol)) {
          console.error(chalk.red(`❌ Invalid symbol: ${symbol}`));
          tradingAction = { side: 'HOLD' };
        }
      }
    }
    
    return { 
      panorama, 
      monologo, 
      conclusion, 
      accionEstrategica, 
      accionEjecutable: accionEjecutable,
      tradingAction: tradingAction || { side: 'HOLD' }
    };
    
  } catch (error) {
    console.error('Error parsing analysis:', error);
    return null;
  }
}

// Mostrar análisis de forma visual
async function displayAnalysis(analysis) {
  if (!analysis) return;
  
  // PANORAMA (arriba para contexto)
  console.log(chalk.blue('\n' + '═'.repeat(60)));
  console.log(chalk.blue.bold('📊 MARKET SNAPSHOT'));
  console.log(chalk.blue('═'.repeat(60)));
  console.log(chalk.white(analysis.panorama));
  
  // Mostrar primero conclusión para claridad
  console.log(chalk.green('\n' + '═'.repeat(60)));
  console.log(chalk.green.bold('✅ CONCLUSION (BOTTOM LINE)'));
  console.log(chalk.green('═'.repeat(60)));
  console.log(chalk.white(analysis.conclusion));

  // Mostrar estrategia breve
  console.log(chalk.magenta('\n' + '─'.repeat(60)));
  console.log(chalk.magenta.bold('🧭 STRATEGIC CONTEXT'));
  console.log(chalk.magenta('─'.repeat(60)));
  console.log(chalk.white(analysis.accionEstrategica));

  // Preguntar si desea ver el monólogo de 100 líneas
  const { showMonologue } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'showMonologue',
      message: 'Show the full 100-line monologue (SJ1/SJ2)?',
      default: false
    }
  ]);

  if (showMonologue) {
    console.log(chalk.yellow('\n' + '═'.repeat(60)));
    console.log(chalk.yellow.bold('🧠 INTERNAL MONOLOGUE (100 LINES)'));
    console.log(chalk.yellow('═'.repeat(60)));
    const monologoLines = analysis.monologo.split('\n');
    monologoLines.forEach(line => {
      console.log(chalk.gray(line));
    });
  }
  
  // Acción ejecutable
  
  // ACCIÓN EJECUTABLE
  console.log(chalk.cyan('\n' + '═'.repeat(60)));
  console.log(chalk.cyan.bold('⚡ EXECUTABLE ACTION'));
  console.log(chalk.cyan('═'.repeat(60)));
  
  const { tradingAction } = analysis;
  
  if (tradingAction.side === 'HOLD') {
    console.log(chalk.blue('📊 HOLD current positions'));
  } else if (tradingAction.side === 'BUY') {
    console.log(chalk.green(`📈 BUY ${tradingAction.quantity} shares of ${tradingAction.symbol}`));
    console.log(chalk.gray(`   Order type: ${tradingAction.orderType}`));
    
    // Estimar costo
    const estimatedPrice = 150; // Precio promedio estimado
    const estimatedCost = tradingAction.quantity * estimatedPrice;
    console.log(chalk.gray(`   Estimated cost: $${estimatedCost.toLocaleString()}`));
  } else if (tradingAction.side === 'SELL') {
    console.log(chalk.red(`📉 SELL ${tradingAction.quantity} shares of ${tradingAction.symbol}`));
    console.log(chalk.gray(`   Order type: ${tradingAction.orderType}`));
  }
  
  console.log(chalk.cyan('═'.repeat(60)));
  
  return tradingAction;
}

// Preguntar confirmación para ejecutar
async function confirmExecution(tradingAction) {
  if (tradingAction.side === 'HOLD') {
    return false; // No hay nada que ejecutar
  }
  
  let message = '';
  if (tradingAction.side === 'BUY') {
    message = `BUY ${tradingAction.quantity} ${tradingAction.symbol} at market price?`;
  } else if (tradingAction.side === 'SELL') {
    message = `SELL ${tradingAction.quantity} ${tradingAction.symbol} at market price?`;
  }
  
  console.log(chalk.yellow('\n⚠️  Execute this trade?'));
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: message,
      default: false
    }
  ]);
  
  return confirm;
}

// Ejecutar acción REAL en Interactive Brokers
async function executeAction(tradingAction) {
  if (tradingAction.side === 'HOLD') {
    console.log(chalk.blue('\n📊 Holding current positions (HOLD)'));
    return;
  }
  
  if (!ibClient || !nextOrderId) {
    console.error(chalk.red('\n❌ No valid Interactive Brokers connection'));
    return;
  }
  
  try {
    const { side, symbol, quantity, orderType } = tradingAction;
    
    // Validaciones adicionales
    if (side === 'BUY') {
      const estimatedCost = quantity * 150; // Precio estimado
      if (estimatedCost > portfolio.cash) {
        console.log(chalk.red(`\n❌ Insufficient funds. Required: $${estimatedCost.toLocaleString()}, Available: $${portfolio.cash.toFixed(2)}`));
        return;
      }
    }
    
    if (side === 'SELL') {
      // Buscar posición exacta o variantes del símbolo
      let position = portfolio.positions.find(p => p.symbol === symbol);
      
      // Si no encuentra, buscar variantes comunes
      if (!position) {
        if (symbol === 'GOOGL') {
          position = portfolio.positions.find(p => p.symbol === 'GOOG');
          if (position) {
            console.log(chalk.yellow('📝 Note: mapping GOOGL → GOOG for this order'));
            // Actualizar el símbolo para la ejecución
            tradingAction.symbol = 'GOOG';
          }
        } else if (symbol === 'GOOG') {
          position = portfolio.positions.find(p => p.symbol === 'GOOGL');
          if (position) {
            console.log(chalk.yellow('📝 Note: mapping GOOG → GOOGL for this order'));
            tradingAction.symbol = 'GOOGL';
          }
        }
      }
      
      if (!position || position.shares < quantity) {
        console.log(chalk.red(`\n❌ You do not have enough ${symbol} shares to sell`));
        console.log(chalk.gray(`   Available positions: ${portfolio.positions.map(p => `${p.symbol}(${p.shares})`).join(', ')}`));
        return;
      }
      
      console.log(chalk.green(`✅ Verified: you have ${position.shares} shares of ${position.symbol}`));
    }
    
    // Crear contrato y orden (usar el símbolo actualizado si fue ajustado)
    const finalSymbol = tradingAction.symbol; // Podría haberse actualizado arriba
    const contract = ib.contract.stock(finalSymbol, 'SMART', 'USD');
    let order;
    
    if (orderType === 'MARKET') {
      order = ib.order.market(side, quantity);
    } else {
      console.error(chalk.red(`❌ Unsupported order type: ${orderType}`));
      return;
    }
    
    // Mostrar detalles de la orden
    if (side === 'BUY') {
      console.log(chalk.green(`\n📈 Executing BUY: ${quantity} ${finalSymbol} @ MARKET`));
    } else {
      console.log(chalk.red(`\n📉 Executing SELL: ${quantity} ${finalSymbol} @ MARKET`));
    }
    
    console.log(chalk.gray(`   Order ID: ${nextOrderId}`));
    console.log(chalk.gray(`   Contract: ${finalSymbol} (SMART/USD)`));
    
    // Configurar listener para esta orden específica
    const currentOrderId = nextOrderId;
    
    const orderStatusHandler = (orderId, status, filled, remaining, avgFillPrice) => {
      if (orderId === currentOrderId) {
        const color = side === 'BUY' ? 'green' : 'red';
        console.log(chalk[color](`\n📋 Order ${orderId}: ${status}`));
        console.log(chalk.gray(`   Filled: ${filled}/${quantity}`));
        if (avgFillPrice > 0) {
          console.log(chalk.gray(`   Avg price: $${avgFillPrice}`));
          console.log(chalk.gray(`   Total value: $${(filled * avgFillPrice).toFixed(2)}`));
        }
        
        if (status === 'Filled') {
          console.log(chalk.green.bold('\n✅ Order fully filled'));
          // Remover el listener para evitar spam
          ibClient.removeListener('orderStatus', orderStatusHandler);
        }
      }
    };
    
    ibClient.on('orderStatus', orderStatusHandler);
    
    // Verificar conexión antes de enviar
    if (!ibClient.connected) {
      console.error(chalk.red('\n❌ Lost IB connection — retrying...'));
      
      // Intentar reconectar
      try {
        ibClient.connect();
        await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar reconexión
      } catch (reconnectError) {
        console.error(chalk.red('❌ Reconnect failed. Order cancelled.'));
        return;
      }
    }
    
    // Enviar orden a Interactive Brokers
    try {
      ibClient.placeOrder(currentOrderId, contract, order);
      console.log(chalk.cyan('\n⏳ Order sent to Interactive Brokers...'));
      console.log(chalk.gray('   Waiting for confirmation...'));
      nextOrderId++;
      
      // Timeout de seguridad para la orden
      setTimeout(() => {
        console.log(chalk.yellow('\n⏰ Timeout waiting for order confirmation'));
        console.log(chalk.gray('   The order may have filled anyway'));
      }, 10000);
      
    } catch (orderError) {
      console.error(chalk.red('\n❌ Error placing order:'), orderError.message);
      console.log(chalk.yellow('💡 Tip: run "npm run verify" to check if it filled'));
    }
    
  } catch (error) {
    console.error(chalk.red('\n❌ Error executing order:'), error.message);
  }
}

// Conectar a IB
async function connectToIB(config) {
  const spinner = ora(`Connecting to Interactive Brokers (${config.name})...`).start();
  
  return new Promise((resolve) => {
    ibClient = new ib({
      clientId: 2,
      host: '127.0.0.1',
      port: config.port
    });

    portfolio.positions = [];

    ibClient.on('error', (err) => {
      const message = err.message.toLowerCase();
      if (!message.includes('conexión') && 
          !message.includes('funciona correctamente') && 
          !message.includes('hmds') &&
          !message.includes('modo solo lectura')) {
        console.error(chalk.red(`IB error: ${err.message}`));
      }
    });

    ibClient.on('nextValidId', (orderId) => {
      spinner.succeed(`✅ Connected to ${chalk[config.color].bold(config.name)}`);
      nextOrderId = orderId;
      
      ibClient.reqAccountSummary(nextReqId(), 'All', 'TotalCashValue,NetLiquidation');
      ibClient.reqPositions();
      
      setTimeout(resolve, 3000);
    });

    ibClient.on('accountSummary', (reqId, account, tag, value, currency) => {
      if (tag === 'TotalCashValue' && currency === 'USD') {
        portfolio.cash = parseFloat(value);
      }
      if (tag === 'NetLiquidation' && currency === 'USD') {
        portfolio.totalValue = parseFloat(value);
      }
    });

    ibClient.on('position', (account, contract, pos, avgCost) => {
      console.log(chalk.blue(`📊 Position received: ${contract.symbol} = ${pos} @ ${avgCost}`));
      
      if (pos !== 0) {
        const existingPos = portfolio.positions.find(p => p.symbol === contract.symbol);
        if (!existingPos) {
          portfolio.positions.push({
            symbol: contract.symbol,
            shares: pos,
            avgCost: avgCost
          });
          console.log(chalk.green(`✅ Added position: ${contract.symbol}`));
        } else {
          // Actualizar posición existente
          existingPos.shares = pos;
          existingPos.avgCost = avgCost;
          console.log(chalk.yellow(`🔄 Updated position: ${contract.symbol}`));
        }
      }
    });

    ibClient.on('positionEnd', () => {
      console.log(chalk.cyan('🏁 End of positions stream'));
      console.log(chalk.cyan(`Total portfolio positions: ${portfolio.positions.length}`));
    });

    ibClient.connect();
    ibClient.reqIds(1);
  });
}

// Ciclo principal
async function runAnalysisCycle() {
  console.log(chalk.blue.bold(`\n🔄 Starting market analysis - ${new Date().toLocaleTimeString()}`));
  console.log(chalk.gray('━'.repeat(60)));
  
  try {
    // CRÍTICO: Actualizar portfolio COMPLETO antes del análisis
    console.log(chalk.gray('📊 Updating portfolio data...'));
    
    if (ibClient) {
      console.log(chalk.gray(`   Current portfolio: ${portfolio.positions.length} positions`));
      
      // NO limpiar posiciones si ya las tenemos y la conexión es estable
      if (portfolio.positions.length === 0) {
        console.log(chalk.gray('   No cached positions, requesting from IB...'));
        ibClient.reqPositions();
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        console.log(chalk.green('   ✅ Using cached positions (stable connection)'));
      }
      
      // Siempre actualizar datos de cuenta (no falla como reqPositions)
      console.log(chalk.gray('   Refreshing cash and total value...'));
      ibClient.reqAccountSummary(nextReqId(), 'All', 'TotalCashValue,NetLiquidation');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mostrar portfolio actualizado
      console.log(chalk.green('💼 Portfolio updated:'));
      console.log(chalk.gray(`   Cash: $${portfolio.cash.toFixed(2)}`));
      console.log(chalk.gray(`   Total value: $${portfolio.totalValue.toFixed(2)}`));
      console.log(chalk.gray(`   Positions: ${portfolio.positions.length}`));
      
      if (portfolio.positions.length > 0) {
        portfolio.positions.forEach(p => {
          console.log(chalk.gray(`   - ${p.symbol}: ${p.shares} shares @ $${p.avgCost.toFixed(2)}`));
        });
      } else {
        console.log(chalk.red('   ⚠️  NO POSITIONS DETECTED — this may be an issue'));
        console.log(chalk.yellow('   💡 Tip: check that TWS shows your positions correctly'));
      }
      
  // DEBUG: Mostrar lo que vamos a enviar a GPT-5
  console.log(chalk.magenta('\n🔍 DEBUG — DATA SENT TO GPT-5:'));
      console.log(chalk.cyan('═'.repeat(60)));
      
      const portfolioContext = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT PORTFOLIO (REAL DATA FROM INTERACTIVE BROKERS):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FINANCIAL SUMMARY:
• Total portfolio value: $${portfolio.totalValue.toFixed(2)}
• Available cash: $${portfolio.cash.toFixed(2)}
• Invested capital: $${(portfolio.totalValue - portfolio.cash).toFixed(2)}

CURRENT POSITIONS (DETAILED):
${portfolio.positions.length > 0 ? 
    portfolio.positions.map(p => {
      const currentValue = p.shares * p.avgCost;
      const percentage = ((currentValue / portfolio.totalValue) * 100).toFixed(1);
      return `
• ${p.symbol}: 
  - Shares: ${p.shares}
  - Avg price: $${p.avgCost.toFixed(2)}
  - Total value: $${currentValue.toFixed(2)}
  - Portfolio weight: ${percentage}%
  - Max sellable: ${p.shares} shares`;
    }).join('') : 
    '\n• No open positions'}

ORDER CONSTRAINTS:
• You can BUY only if the estimated cost ≤ $${portfolio.cash.toFixed(2)} (available cash)
• You can SELL only shares you currently own
• Sellable symbols:
${portfolio.positions.length > 0 ? 
    portfolio.positions.map(p => `  - ${p.symbol}: max ${p.shares} shares`).join('\n') : 
    '  - None (no positions)'}

IMPORTANT: For executable actions, respect these limits exactly.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
      
      console.log(chalk.white(portfolioContext));
      console.log(chalk.cyan('═'.repeat(60)));
      console.log(chalk.magenta('🔍 END DEBUG\n'));
    } else {
      console.error(chalk.red('❌ No Interactive Brokers connection'));
      console.log(chalk.yellow('💡 Make sure TWS is open and connected'));
      return;
    }
    
    // Buscar noticias
    const marketData = await searchTechNews();
    
    if (marketData.newsItems.length === 0) {
      console.log(chalk.yellow('⚠️  No market data available'));
      return;
    }
    
    // Analizar con GPT-4.5
    const analysis = await analyzeMarketWithGPT(marketData, portfolio);
    
    // Mostrar análisis
    const tradingAction = await displayAnalysis(analysis);
    
    // Confirmar y ejecutar si se desea
    if (tradingAction && tradingAction.side !== 'HOLD') {
      const shouldExecute = await confirmExecution(tradingAction);
      if (shouldExecute) {
        await executeAction(tradingAction);
      } else {
        console.log(chalk.gray('\n✋ Action cancelled by user'));
      }
    } else if (tradingAction && tradingAction.side === 'HOLD') {
      console.log(chalk.blue('\n📊 No action to execute right now'));
    }
    
  } catch (error) {
    console.error(chalk.red('\n❌ Cycle error:'), error.message);
  }
  
  console.log(chalk.gray('\n' + '━'.repeat(60)));
}

// Main
async function main() {
  console.log(chalk.yellow('\n⚡ Starting Market Intelligence Analyst...'));
  
  if (
    !process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY === 'tu_api_key_aqui' ||
    process.env.OPENAI_API_KEY === 'your_api_key_here' ||
    process.env.OPENAI_API_KEY === 'your_key_here'
  ) {
    console.error(chalk.red('\n❌ ERROR: Set your OPENAI_API_KEY in .env'));
    process.exit(1);
  }
  
  // Seleccionar ambiente
  const config = await selectEnvironment();
  console.clear();
  
  await connectToIB(config);
  
  // Ejecutar análisis inmediatamente
  await runAnalysisCycle();
  
  // Preguntar si quiere otro análisis
  const askForNext = async () => {
    const { next } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'next',
        message: '\nRun another analysis?',
        default: true
      }
    ]);
    
    if (next) {
      await runAnalysisCycle();
      await askForNext();
    } else {
      console.log(chalk.yellow('\n👋 Closing Market Intelligence Analyst...'));
      if (ibClient) ibClient.disconnect();
      process.exit(0);
    }
  };
  
  await askForNext();
}

// Manejo de cierre
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n👋 Closing...'));
  if (ibClient) ibClient.disconnect();
  process.exit(0);
});

// Iniciar
main().catch(console.error);
