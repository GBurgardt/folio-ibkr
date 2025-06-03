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
  totalValue: 0,
  accountId: null
};
let nextOrderId = null;

console.clear();
console.log(chalk.blue.bold('🤖 Interactive Brokers Trading Bot'));
console.log(chalk.gray('━'.repeat(50)));

// Fase 1: Búsqueda REAL de noticias tecnológicas
async function searchTechNews() {
  const spinner = ora('🔍 Buscando noticias tecnológicas reales...').start();
  
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
        console.log(chalk.yellow(`  ⚠️  No se pudieron obtener noticias para ${symbol}`));
      }
    }
    
    spinner.succeed(`✅ Encontradas ${newsItems.length} noticias reales`);
    console.log(chalk.yellow(`\n📰 Resumen de noticias:`));
    newsItems.slice(0, 5).forEach(news => {
      const color = news.sentiment === 'positive' ? 'green' : news.sentiment === 'negative' ? 'red' : 'gray';
      console.log(chalk[color](`  • ${news.symbol}: ${news.headline.substring(0, 60)}...`));
    });
    
    return newsItems;
  } catch (error) {
    spinner.fail('❌ Error buscando noticias');
    console.error(error.message);
    return [];
  }
}

// Fase 2: Análisis REAL con GPT-4.5
async function analyzeWithGPT(newsData, portfolio) {
  const spinner = ora('🧠 Analizando con GPT-4.5 (REAL)...').start();
  
  try {
    // Construir el prompt según el plan
    const portfolioContext = `
Portfolio actual:
- Posiciones: ${portfolio.positions.length > 0 ? 
    portfolio.positions.map(p => `${p.symbol}: ${p.shares} acciones a $${p.avgCost.toFixed(2)}`).join(', ') : 
    'Ninguna posición abierta'}
- Efectivo disponible: $${portfolio.cash.toFixed(2)}
- Valor total del portfolio: $${portfolio.totalValue.toFixed(2)}
`;

    const newsContext = `
Noticias recientes del sector tecnológico:
${newsData.slice(0, 10).map(n => 
  `- ${n.symbol}: ${n.headline} (Sentimiento: ${n.sentiment}, Impacto: ${n.impact})`
).join('\n')}
`;

    const systemPrompt = `Eres un experto analista financiero especializado en el sector tecnológico. 
Analiza las noticias y el portfolio actual para sugerir UNA SOLA acción de trading conservadora.
IMPORTANTE: 
- Solo sugiere comprar si hay efectivo disponible
- Solo sugiere vender si poseemos la acción
- Limita las compras a máximo 10% del efectivo disponible
- Responde ÚNICAMENTE en formato XML exacto`;

    const userPrompt = `${portfolioContext}

${newsContext}

Basándote en esta información, sugiere UNA SOLA acción de trading.
Responde ÚNICAMENTE en el siguiente formato XML (sin texto adicional):

<trading_decision>
    <action>BUY/SELL/HOLD</action>
    <symbol>SYMBOL</symbol>
    <quantity>NUMBER</quantity>
    <reasoning>Explicación breve de máximo 50 palabras</reasoning>
    <confidence>HIGH/MEDIUM/LOW</confidence>
    <expected_impact>Impacto esperado en una línea</expected_impact>
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

    console.log(chalk.gray('\n  📤 Enviando a GPT-4.5...'));

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
    
    spinner.succeed('✅ Análisis GPT-4.5 completado');
    console.log(chalk.gray('\n  📥 Respuesta raw:'), responseText.substring(0, 100) + '...');
    
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
    console.error(chalk.red('  Error detalle:'), error.message);
    return { action: 'HOLD', reasoning: 'Error en análisis: ' + error.message };
  }
}

// Parsear decisión XML mejorado
function parseDecision(xmlText) {
  try {
    // Extraer solo el contenido XML
    const xmlMatch = xmlText.match(/<trading_decision>[\s\S]*?<\/trading_decision>/);
    if (!xmlMatch) {
      console.error(chalk.red('  ❌ No se encontró XML válido en la respuesta'));
      return { action: 'HOLD', reasoning: 'Formato XML inválido' };
    }
    
    const xml = xmlMatch[0];
    
    const action = xml.match(/<action>(.*?)<\/action>/)?.[1]?.trim() || 'HOLD';
    const symbol = xml.match(/<symbol>(.*?)<\/symbol>/)?.[1]?.trim() || '';
    const quantity = parseInt(xml.match(/<quantity>(.*?)<\/quantity>/)?.[1] || '0');
    const reasoning = xml.match(/<reasoning>(.*?)<\/reasoning>/s)?.[1]?.trim() || '';
    const confidence = xml.match(/<confidence>(.*?)<\/confidence>/)?.[1]?.trim() || 'LOW';
    const impact = xml.match(/<expected_impact>(.*?)<\/expected_impact>/)?.[1]?.trim() || '';
    
    // Validaciones
    if (!['BUY', 'SELL', 'HOLD'].includes(action)) {
      console.error(chalk.red(`  ❌ Acción inválida: ${action}`));
      return { action: 'HOLD', reasoning: 'Acción inválida' };
    }
    
    if ((action === 'BUY' || action === 'SELL') && (!symbol || quantity <= 0)) {
      console.error(chalk.red(`  ❌ Símbolo o cantidad inválida`));
      return { action: 'HOLD', reasoning: 'Parámetros inválidos' };
    }
    
    return { action, symbol, quantity, reasoning, confidence, impact };
  } catch (error) {
    console.error('Error parseando decisión:', error);
    return { action: 'HOLD', reasoning: 'Error parsing: ' + error.message };
  }
}

// Fase 3: Ejecutar decisión REAL en Interactive Brokers
async function executeDecision(decision) {
  console.log(chalk.yellow('\n⚡ Ejecutando decisión en IB...'));
  
  if (decision.action === 'HOLD') {
    console.log(chalk.blue('  ✅ Manteniendo posiciones actuales'));
    return;
  }
  
  if (!nextOrderId) {
    console.error(chalk.red('  ❌ No hay Order ID disponible'));
    return;
  }
  
  try {
    if (decision.action === 'BUY') {
      // Verificar fondos disponibles
      const estimatedCost = decision.quantity * 150; // Precio estimado
      if (estimatedCost > portfolio.cash) {
        console.log(chalk.red(`  ❌ Fondos insuficientes. Necesario: $${estimatedCost.toFixed(2)}, Disponible: $${portfolio.cash.toFixed(2)}`));
        return;
      }
      
      // Crear contrato
      const contract = ib.contract.stock(decision.symbol, 'SMART', 'USD');
      
      // Crear orden de compra
      const order = ib.order.market(decision.action, decision.quantity);
      
      console.log(chalk.green(`  📈 Enviando orden de COMPRA: ${decision.quantity} ${decision.symbol}`));
      
      // Colocar orden REAL
      ibClient.placeOrder(nextOrderId, contract, order);
      
      // Escuchar confirmación
      ibClient.on('orderStatus', (orderId, status, filled, remaining, avgFillPrice) => {
        if (orderId === nextOrderId) {
          console.log(chalk.green(`  ✅ Orden ${orderId}: ${status} - Ejecutadas: ${filled}/${decision.quantity} @ $${avgFillPrice}`));
        }
      });
      
      nextOrderId++;
      
    } else if (decision.action === 'SELL') {
      // Verificar que tenemos la posición
      const position = portfolio.positions.find(p => p.symbol === decision.symbol);
      if (!position || position.shares < decision.quantity) {
        console.log(chalk.red(`  ❌ No tienes suficientes acciones de ${decision.symbol}`));
        return;
      }
      
      // Crear contrato y orden
      const contract = ib.contract.stock(decision.symbol, 'SMART', 'USD');
      const order = ib.order.market(decision.action, decision.quantity);
      
      console.log(chalk.red(`  📉 Enviando orden de VENTA: ${decision.quantity} ${decision.symbol}`));
      
      // Colocar orden REAL
      ibClient.placeOrder(nextOrderId, contract, order);
      
      // Escuchar confirmación
      ibClient.on('orderStatus', (orderId, status, filled, remaining, avgFillPrice) => {
        if (orderId === nextOrderId) {
          console.log(chalk.red(`  ✅ Orden ${orderId}: ${status} - Vendidas: ${filled}/${decision.quantity} @ $${avgFillPrice}`));
        }
      });
      
      nextOrderId++;
    }
    
  } catch (error) {
    console.error(chalk.red('  ❌ Error ejecutando orden:'), error.message);
  }
}

// Conectar a IB y obtener portfolio REAL
async function connectAndGetPortfolio() {
  const spinner = ora('📊 Conectando a Interactive Brokers...').start();
  
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
      spinner.succeed('✅ Conectado a IB');
      nextOrderId = orderId;
      console.log(chalk.gray(`  Order ID inicial: ${nextOrderId}`));
      
      // Solicitar datos REALES del portfolio
      ibClient.reqAccountSummary(1, 'All', 'TotalCashValue,NetLiquidation');
      ibClient.reqPositions();
      
      // Esperar a que lleguen los datos
      setTimeout(() => {
        console.log(chalk.green('\n💼 Portfolio actual:'));
        console.log(`  Efectivo: $${portfolio.cash.toFixed(2)}`);
        console.log(`  Valor total: $${portfolio.totalValue.toFixed(2)}`);
        console.log(`  Posiciones: ${portfolio.positions.length}`);
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
  console.log(chalk.blue.bold(`\n🔄 Iniciando ciclo de trading - ${new Date().toLocaleTimeString()}`));
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
      console.log(chalk.yellow('⚠️  No hay noticias disponibles en este ciclo'));
      return;
    }
    
    // Fase 2: Analizar con GPT-4.5 REAL
    const decision = await analyzeWithGPT(news, portfolio);
    
    // Fase 3: Ejecutar decisión REAL
    await executeDecision(decision);
    
    // Log del ciclo completado
    console.log(chalk.green('\n✅ Ciclo completado exitosamente'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Error en ciclo de trading:'), error.message);
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