require('dotenv').config();
const ib = require('ib');
const chalk = require('chalk');
const ora = require('ora');
const axios = require('axios');
const OpenAI = require('openai');
const inquirer = require('inquirer');

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
console.log(chalk.cyan('Tu analista personal de mercado al estilo Steve Jobs\n'));

// Selector de ambiente
async function selectEnvironment() {
  const { environment } = await inquirer.prompt([
    {
      type: 'list',
      name: 'environment',
      message: 'Selecciona el ambiente:',
      choices: [
        {
          name: '💎 Cuenta Real (puerto 7496)',
          value: { port: 7496, name: 'REAL', color: 'green' }
        },
        {
          name: '🧪 Paper Trading (puerto 7497)',
          value: { port: 7497, name: 'DEMO', color: 'yellow' }
        }
      ],
      default: 1
    }
  ]);

  return environment;
}

// Fase 1: Búsqueda REAL de noticias tecnológicas
async function searchTechNews() {
  const spinner = ora('🔍 Escaneando el mercado tecnológico...').start();
  
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
    
    spinner.succeed(`✅ Análisis de mercado completado`);
    console.log(chalk.yellow(`\n📊 Detectadas ${newsItems.length} señales del mercado`));
    
    return { newsItems, marketData };
  } catch (error) {
    spinner.fail('❌ Error en análisis de mercado');
    return { newsItems: [], marketData: {} };
  }
}

// Fase 2: Análisis profundo con OpenAI
async function analyzeMarketWithGPT(marketData, portfolio) {
  const spinner = ora('🤖 Procesando inteligencia de mercado con OpenAI...').start();
  
  try {
    // Preparar contexto del portfolio con datos REALES y completos
    const portfolioContext = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MI PORTFOLIO ACTUAL (DATOS REALES DE INTERACTIVE BROKERS):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RESUMEN FINANCIERO:
• Valor total del portfolio: $${portfolio.totalValue.toFixed(2)}
• Efectivo disponible: $${portfolio.cash.toFixed(2)}
• Capital invertido: $${(portfolio.totalValue - portfolio.cash).toFixed(2)}

POSICIONES ACTUALES DETALLADAS:
${portfolio.positions.length > 0 ? 
    portfolio.positions.map(p => {
      const currentValue = p.shares * p.avgCost;
      const percentage = ((currentValue / portfolio.totalValue) * 100).toFixed(1);
      return `
• ${p.symbol}: 
  - Cantidad: ${p.shares} acciones
  - Precio promedio: $${p.avgCost.toFixed(2)}
  - Valor total: $${currentValue.toFixed(2)}
  - Porcentaje del portfolio: ${percentage}%
  - Máximo vendible: ${p.shares} acciones`;
    }).join('') : 
    '\n• Sin posiciones abiertas actualmente'}

LIMITACIONES PARA ÓRDENES:
• Solo puedes COMPRAR si el costo estimado ≤ $${portfolio.cash.toFixed(2)} (efectivo disponible)
• Solo puedes VENDER acciones que POSEES actualmente
• Acciones disponibles para venta:
${portfolio.positions.length > 0 ? 
    portfolio.positions.map(p => `  - ${p.symbol}: máximo ${p.shares} acciones`).join('\n') : 
    '  - Ninguna (sin posiciones)'}

IMPORTANTE: Al sugerir acciones ejecutables, RESPETA estos límites exactos.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

    // Preparar contexto de noticias
    const newsContext = `
PANORAMA DEL MERCADO TECNOLÓGICO HOY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${Object.entries(marketData.marketData).map(([symbol, news]) => {
  if (news.length === 0) return '';
  const sentiment = news.filter(n => n.sentiment === 'positive').length > news.filter(n => n.sentiment === 'negative').length ? '📈' : '📉';
  return `
${symbol} ${sentiment}:
${news.slice(0, 2).map(n => `• ${n.headline}`).join('\n')}`;
}).filter(s => s).join('\n')}
`;

    const systemPrompt = `Eres dos versiones de Steve Jobs debatiendo entre sí con precisión quirúrgica y simplicidad extrema.
Tu trabajo es analizar el mercado tecnológico y explicarlo de forma SIMPLE, DIRECTA y ACCIONABLE.
Hablas en español, sin rodeos, yendo al grano. Usas analogías simples cuando es necesario.
Piensas en términos de oportunidades y riesgos REALES, no teorías académicas.

CRÍTICO: Tu respuesta DEBE estar estructurada en exactamente 5 secciones XML:
1. <panorama> - Explicación pragmática del mercado hoy
2. <monologo> - Diálogo entre DOS Steve Jobs de EXACTAMENTE 100 líneas numeradas del 1 al 100. Cada línea inicia con "SJ1:" o "SJ2:", alternando de forma natural. Sé concreto, visual y minimalista.
3. <conclusion> - Sugerencia final concreta
4. <accion_estrategica> - Contexto y explicación de la estrategia
5. <accion_ejecutable> - ÚNICAMENTE órdenes que se pueden ejecutar en Interactive Brokers

FORMATO CRÍTICO PARA ACCION_EJECUTABLE:
Debes responder con UNA de estas opciones EXACTAS:

OPCIÓN 1 - COMPRAR:
<accion_ejecutable>
  <side>BUY</side>
  <symbol>AAPL</symbol>
  <quantity>10</quantity>
  <order_type>MARKET</order_type>
</accion_ejecutable>

OPCIÓN 2 - VENDER:
<accion_ejecutable>
  <side>SELL</side>
  <symbol>TSLA</symbol>
  <quantity>5</quantity>
  <order_type>MARKET</order_type>
</accion_ejecutable>

OPCIÓN 3 - NO HACER NADA:
<accion_ejecutable>
  <side>HOLD</side>
</accion_ejecutable>

REGLAS ABSOLUTAS PARA ACCION_EJECUTABLE:
- JAMÁS pongas "establecer alerta", "monitorear", "esperar" en accion_ejecutable
- side SOLO puede ser: BUY, SELL, HOLD (nada más)
- symbol SOLO tickers válidos: AAPL, GOOGL, MSFT, TSLA, NVDA, AMZN, META
- quantity SOLO números enteros positivos
- order_type SOLO puede ser: MARKET (por ahora)
- Si no hay acción inmediata que ejecutar → HOLD
- Las estrategias van en accion_estrategica, NO en accion_ejecutable

CRÍTICO - VALIDACIONES OBLIGATORIAS:
- Para BUY: El costo (quantity × precio_estimado) DEBE ser ≤ efectivo disponible
- Para SELL: La quantity DEBE ser ≤ acciones que POSEE realmente
- NUNCA sugieras vender más acciones de las que el usuario tiene
- NUNCA sugieras comprar si no hay efectivo suficiente
- USA LA INFORMACIÓN DEL PORTFOLIO que te proporciono arriba para validar

EJEMPLOS DE LO QUE NO DEBES HACER:
❌ Sugerir vender 10 GOOGL si solo tiene 5
❌ Sugerir comprar $5000 en acciones si solo tiene $139 en efectivo
❌ Ignorar las limitaciones reales del portfolio`;

    const userPrompt = `${portfolioContext}

${newsContext}

Analiza esta situación y responde en el formato XML exacto que te especifiqué.

EJEMPLO COMPLETO DE RESPUESTA ESPERADA:

<analysis>
<panorama>
Hoy el mercado tech está mostrando señales mixtas interesantes. NVIDIA sigue en su rally imparable - básicamente están vendiendo palas en la fiebre del oro de la IA. Tesla por otro lado está tomando un respiro después de semanas alcistas, típica corrección saludable.

Lo más relevante: Microsoft y Google están en una guerra silenciosa por dominar la IA empresarial. Es como la carrera espacial pero con modelos de lenguaje. Apple se mantiene lateral, esperando su momento para lanzar algo que cambie el juego - típico de ellos.
</panorama>

<monologo>
1. Ok, mirando mi portfolio actual, tengo $${portfolio.cash.toFixed(2)} en efectivo.
2. Eso es poder de fuego considerable en este mercado.
3. Las posiciones que tengo están ${portfolio.positions.length > 0 ? 'generando retornos decentes' : 'por definirse aún'}.
4. NVIDIA está cara, pero ¿cuándo no lo ha estado en los últimos 2 años?
5. El que esperó el "pullback perfecto" se perdió 300% de ganancia.
6. Tesla... siempre es una montaña rusa emocional.
7. Pero Elon está ejecutando bien, Model 3 highland vendiendo como pan caliente.
8. Microsoft es el gigante dormido que todos subestiman.
9. Tienen Azure, tienen OpenAI, tienen Office - es un monopolio legal.
10. Google está asustado y eso me gusta - el miedo los hace innovar.
11. Bard era mediocre, Gemini está mejorando rápido.
12. Apple... siempre tan misteriosos, pero el Vision Pro se viene.
13. ¿Será otro iPad o otro Apple Watch? Apuesto por lo segundo.
14. Mi portfolio necesita más exposición a IA pura.
15. Pero no a precios estúpidos - hay que ser paciente.
16. Amazon AWS está imprimiendo dinero mientras todos miran la tienda online.
17. Es como Tesla - todos ven autos, yo veo software y energía.
18. Meta pivoteó bien, Zuckerberg aprendió la lección del metaverso.
19. Ahora están enfocados en IA generativa y eficiencia.
20. Cortaron grasa, mejoraron márgenes - me gusta eso.
21. El mercado general está nervioso con las tasas.
22. Pero tech grande tiene tanto cash que les importa poco.
23. Apple tiene $160B en efectivo - es un banco disfrazado.
24. ¿Debería aumentar mi posición en alguna de estas?
25. O tal vez es momento de tomar ganancias en las que subieron mucho.
26. El FOMO es real, pero la disciplina paga más a largo plazo.
27. Warren Buffett dice "sé codicioso cuando otros tienen miedo".
28. Pero también dice "no pierdas dinero" - contradicción productiva.
29. Mi estrategia: concentrarme en ganadores probados.
30. No necesito encontrar el próximo Tesla, ya existe Tesla.
31. NVIDIA es obvio pero por algo es obvio - están dominando.
32. Microsoft es aburrido pero los aburridos pagan las cuentas.
33. Google tiene el moat más grande: datos infinitos.
34. ¿Y si esta corrección es la oportunidad que esperaba?
35. Los débiles venden en pánico, los fuertes compran con convicción.
36. Pero tampoco hay que atrapar cuchillos cayendo.
37. Timing perfecto es imposible, direccionalidad correcta es suficiente.
38. Mi cash está perdiendo contra inflación cada día.
39. Pero también es munición para oportunidades.
40. Tesla bajo $200 sería regalo, NVIDIA bajo $700 también.
41. Microsoft sobre $400 ya es stretch, esperaría corrección.
42. Amazon está en precio justo, podría escalar posición.
43. Meta... aún no confío 100% en Zuckerberg pero está mejorando.
44. Apple siempre es "caro" hasta que no lo es.
45. El mercado tech es bipolar: euforia o pánico, nunca equilibrio.
46. Ahora estamos en "cautela optimista" - el mejor momento.
47. Ni muy caliente ni muy frío - Goldilocks para entrar.
48. Mi movimiento debe ser calculado, no emocional.
49. Pensar en horizonte 2-3 años, no 2-3 días.
50. Decisión tomada: es momento de actuar, pero con cabeza fría.
</monologo>

<conclusion>
El mercado está dándote una ventana de oportunidad en tech de calidad. No es momento de apostar todo, pero sí de incrementar exposición estratégicamente.

RECOMENDACIÓN PRAGMÁTICA: 
Con tu efectivo disponible, aprovecha la debilidad temporal en Amazon (AWS está infravalorado) o aumenta posición en Microsoft si tienes menos del 20% de tu portfolio ahí. Ambos son jugadas conservadoras con upside significativo.
</conclusion>

<accion_estrategica>
La jugada inteligente es usar 30% del efectivo disponible para aumentar exposición a Amazon. AWS está infravalorado por el mercado, retail se está recuperando, y la integración de IA en Alexa será un game changer. Horizonte 18-24 meses con target de $200+ (25-30% upside esperado). Mantener 70% del cash para próximas oportunidades.
</accion_estrategica>

<accion_ejecutable>
  <side>BUY</side>
  <symbol>AMZN</symbol>
  <quantity>15</quantity>
  <order_type>MARKET</order_type>
</accion_ejecutable>
</analysis>`;

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

    // Llamar a OpenAI con un modelo disponible
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: apiInput,
      text: {
        "format": {
          "type": "text"
        }
      },
      reasoning: {},
      tools: [],
      temperature: 0.4,
      max_output_tokens: 4000,
      top_p: 0.9,
      store: true
    });

    const responseText = response.output?.[0]?.content?.[0]?.text || "";
    
    spinner.succeed('✅ Análisis completado');
    
    return parseAnalysis(responseText);
    
  } catch (error) {
    spinner.fail('❌ Error en análisis');
    console.error(chalk.red('Detalle:'), error.message);
    return null;
  }
}

// Parser mejorado para el análisis
function parseAnalysis(xmlText) {
  try {
    const analysisMatch = xmlText.match(/<analysis>([\s\S]*?)<\/analysis>/);
    if (!analysisMatch) {
      console.error(chalk.red('No se encontró análisis válido'));
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
          console.error(chalk.red(`❌ Side inválido: ${side}`));
          tradingAction = { side: 'HOLD' };
        }
        
        if ((side === 'BUY' || side === 'SELL') && (!symbol || quantity <= 0)) {
          console.error(chalk.red(`❌ Parámetros inválidos para ${side}`));
          tradingAction = { side: 'HOLD' };
        }
        
        const validSymbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'META'];
        if (symbol && !validSymbols.includes(symbol)) {
          console.error(chalk.red(`❌ Símbolo inválido: ${symbol}`));
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
    console.error('Error parseando análisis:', error);
    return null;
  }
}

// Mostrar análisis de forma visual
async function displayAnalysis(analysis) {
  if (!analysis) return;
  
  // PANORAMA
  console.log(chalk.blue('\n' + '═'.repeat(60)));
  console.log(chalk.blue.bold('📊 PANORAMA DEL MERCADO'));
  console.log(chalk.blue('═'.repeat(60)));
  console.log(chalk.white(analysis.panorama));
  
  // MONÓLOGO
  console.log(chalk.yellow('\n' + '═'.repeat(60)));
  console.log(chalk.yellow.bold('🧠 MONÓLOGO INTERNO'));
  console.log(chalk.yellow('═'.repeat(60)));
  const monologoLines = analysis.monologo.split('\n');
  monologoLines.forEach(line => {
    console.log(chalk.gray(line));
  });
  
  // CONCLUSIÓN
  console.log(chalk.green('\n' + '═'.repeat(60)));
  console.log(chalk.green.bold('💡 CONCLUSIÓN Y ESTRATEGIA'));
  console.log(chalk.green('═'.repeat(60)));
  console.log(chalk.white(analysis.conclusion));
  
  // ACCIÓN ESTRATÉGICA
  console.log(chalk.magenta('\n' + '═'.repeat(60)));
  console.log(chalk.magenta.bold('📋 CONTEXTO ESTRATÉGICO'));
  console.log(chalk.magenta('═'.repeat(60)));
  console.log(chalk.white(analysis.accionEstrategica));
  
  // ACCIÓN EJECUTABLE
  console.log(chalk.cyan('\n' + '═'.repeat(60)));
  console.log(chalk.cyan.bold('⚡ ACCIÓN EJECUTABLE'));
  console.log(chalk.cyan('═'.repeat(60)));
  
  const { tradingAction } = analysis;
  
  if (tradingAction.side === 'HOLD') {
    console.log(chalk.blue('📊 MANTENER posiciones actuales (HOLD)'));
  } else if (tradingAction.side === 'BUY') {
    console.log(chalk.green(`📈 COMPRAR ${tradingAction.quantity} acciones de ${tradingAction.symbol}`));
    console.log(chalk.gray(`   Tipo de orden: ${tradingAction.orderType}`));
    
    // Estimar costo
    const estimatedPrice = 150; // Precio promedio estimado
    const estimatedCost = tradingAction.quantity * estimatedPrice;
    console.log(chalk.gray(`   Costo estimado: $${estimatedCost.toLocaleString()}`));
  } else if (tradingAction.side === 'SELL') {
    console.log(chalk.red(`📉 VENDER ${tradingAction.quantity} acciones de ${tradingAction.symbol}`));
    console.log(chalk.gray(`   Tipo de orden: ${tradingAction.orderType}`));
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
    message = `¿COMPRAR ${tradingAction.quantity} ${tradingAction.symbol} a precio de mercado?`;
  } else if (tradingAction.side === 'SELL') {
    message = `¿VENDER ${tradingAction.quantity} ${tradingAction.symbol} a precio de mercado?`;
  }
  
  console.log(chalk.yellow('\n⚠️  ¿Quieres ejecutar esta operación?'));
  
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
    console.log(chalk.blue('\n📊 Manteniendo posiciones actuales (HOLD)'));
    return;
  }
  
  if (!ibClient || !nextOrderId) {
    console.error(chalk.red('\n❌ No hay conexión válida con Interactive Brokers'));
    return;
  }
  
  try {
    const { side, symbol, quantity, orderType } = tradingAction;
    
    // Validaciones adicionales
    if (side === 'BUY') {
      const estimatedCost = quantity * 150; // Precio estimado
      if (estimatedCost > portfolio.cash) {
        console.log(chalk.red(`\n❌ Fondos insuficientes. Necesario: $${estimatedCost.toLocaleString()}, Disponible: $${portfolio.cash.toFixed(2)}`));
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
            console.log(chalk.yellow(`📝 Nota: Ajustando GOOGL → GOOG para la orden`));
            // Actualizar el símbolo para la ejecución
            tradingAction.symbol = 'GOOG';
          }
        } else if (symbol === 'GOOG') {
          position = portfolio.positions.find(p => p.symbol === 'GOOGL');
          if (position) {
            console.log(chalk.yellow(`📝 Nota: Ajustando GOOG → GOOGL para la orden`));
            tradingAction.symbol = 'GOOGL';
          }
        }
      }
      
      if (!position || position.shares < quantity) {
        console.log(chalk.red(`\n❌ No tienes suficientes acciones de ${symbol} para vender`));
        console.log(chalk.gray(`   Posiciones disponibles: ${portfolio.positions.map(p => `${p.symbol}(${p.shares})`).join(', ')}`));
        return;
      }
      
      console.log(chalk.green(`✅ Verificado: Tienes ${position.shares} acciones de ${position.symbol}`));
    }
    
    // Crear contrato y orden (usar el símbolo actualizado si fue ajustado)
    const finalSymbol = tradingAction.symbol; // Podría haberse actualizado arriba
    const contract = ib.contract.stock(finalSymbol, 'SMART', 'USD');
    let order;
    
    if (orderType === 'MARKET') {
      order = ib.order.market(side, quantity);
    } else {
      console.error(chalk.red(`❌ Tipo de orden no soportado: ${orderType}`));
      return;
    }
    
    // Mostrar detalles de la orden
    if (side === 'BUY') {
      console.log(chalk.green(`\n📈 Ejecutando COMPRA: ${quantity} ${finalSymbol} @ MARKET`));
    } else {
      console.log(chalk.red(`\n📉 Ejecutando VENTA: ${quantity} ${finalSymbol} @ MARKET`));
    }
    
    console.log(chalk.gray(`   Order ID: ${nextOrderId}`));
    console.log(chalk.gray(`   Contrato: ${finalSymbol} (SMART/USD)`));
    
    // Configurar listener para esta orden específica
    const currentOrderId = nextOrderId;
    
    const orderStatusHandler = (orderId, status, filled, remaining, avgFillPrice) => {
      if (orderId === currentOrderId) {
        const color = side === 'BUY' ? 'green' : 'red';
        console.log(chalk[color](`\n📋 Orden ${orderId}: ${status}`));
        console.log(chalk.gray(`   Ejecutadas: ${filled}/${quantity}`));
        if (avgFillPrice > 0) {
          console.log(chalk.gray(`   Precio promedio: $${avgFillPrice}`));
          console.log(chalk.gray(`   Valor total: $${(filled * avgFillPrice).toFixed(2)}`));
        }
        
        if (status === 'Filled') {
          console.log(chalk.green.bold('\n✅ ¡Orden ejecutada completamente!'));
          // Remover el listener para evitar spam
          ibClient.removeListener('orderStatus', orderStatusHandler);
        }
      }
    };
    
    ibClient.on('orderStatus', orderStatusHandler);
    
    // Verificar conexión antes de enviar
    if (!ibClient.connected) {
      console.error(chalk.red('\n❌ Conexión perdida con IB - Reintentando conexión...'));
      
      // Intentar reconectar
      try {
        ibClient.connect();
        await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar reconexión
      } catch (reconnectError) {
        console.error(chalk.red('❌ No se pudo reconectar. Orden cancelada.'));
        return;
      }
    }
    
    // Enviar orden a Interactive Brokers
    try {
      ibClient.placeOrder(currentOrderId, contract, order);
      console.log(chalk.cyan('\n⏳ Orden enviada a Interactive Brokers...'));
      console.log(chalk.gray('   Esperando confirmación...'));
      nextOrderId++;
      
      // Timeout de seguridad para la orden
      setTimeout(() => {
        console.log(chalk.yellow('\n⏰ Timeout esperando confirmación de orden'));
        console.log(chalk.gray('   La orden puede haberse ejecutado igualmente'));
      }, 10000);
      
    } catch (orderError) {
      console.error(chalk.red('\n❌ Error enviando orden:'), orderError.message);
      console.log(chalk.yellow('💡 Usa "npm run verify" para verificar si se ejecutó'));
    }
    
  } catch (error) {
    console.error(chalk.red('\n❌ Error ejecutando orden:'), error.message);
  }
}

// Conectar a IB
async function connectToIB(config) {
  const spinner = ora(`Conectando con Interactive Brokers (${config.name})...`).start();
  
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
        console.error(chalk.red(`Error IB: ${err.message}`));
      }
    });

    ibClient.on('nextValidId', (orderId) => {
      spinner.succeed(`✅ Conectado a ${chalk[config.color].bold(config.name)}`);
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
      console.log(chalk.blue(`📊 Posición recibida: ${contract.symbol} = ${pos} @ ${avgCost}`));
      
      if (pos !== 0) {
        const existingPos = portfolio.positions.find(p => p.symbol === contract.symbol);
        if (!existingPos) {
          portfolio.positions.push({
            symbol: contract.symbol,
            shares: pos,
            avgCost: avgCost
          });
          console.log(chalk.green(`✅ Agregada posición: ${contract.symbol}`));
        } else {
          // Actualizar posición existente
          existingPos.shares = pos;
          existingPos.avgCost = avgCost;
          console.log(chalk.yellow(`🔄 Actualizada posición: ${contract.symbol}`));
        }
      }
    });

    ibClient.on('positionEnd', () => {
      console.log(chalk.cyan('🏁 Fin de posiciones recibidas'));
      console.log(chalk.cyan(`Total posiciones en portfolio: ${portfolio.positions.length}`));
    });

    ibClient.connect();
    ibClient.reqIds(1);
  });
}

// Ciclo principal
async function runAnalysisCycle() {
  console.log(chalk.blue.bold(`\n🔄 Iniciando análisis de mercado - ${new Date().toLocaleTimeString()}`));
  console.log(chalk.gray('━'.repeat(60)));
  
  try {
    // CRÍTICO: Actualizar portfolio COMPLETO antes del análisis
    console.log(chalk.gray('📊 Actualizando datos del portfolio...'));
    
    if (ibClient) {
      console.log(chalk.gray(`   Portfolio actual: ${portfolio.positions.length} posiciones`));
      
      // NO limpiar posiciones si ya las tenemos y la conexión es estable
      if (portfolio.positions.length === 0) {
        console.log(chalk.gray('   No hay posiciones, solicitando desde IB...'));
        ibClient.reqPositions();
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        console.log(chalk.green('   ✅ Usando posiciones existentes (conexión estable)'));
      }
      
      // Siempre actualizar datos de cuenta (no falla como reqPositions)
      console.log(chalk.gray('   Actualizando efectivo y valor total...'));
      ibClient.reqAccountSummary(nextReqId(), 'All', 'TotalCashValue,NetLiquidation');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mostrar portfolio actualizado
      console.log(chalk.green(`💼 Portfolio actualizado:`));
      console.log(chalk.gray(`   Efectivo: $${portfolio.cash.toFixed(2)}`));
      console.log(chalk.gray(`   Valor total: $${portfolio.totalValue.toFixed(2)}`));
      console.log(chalk.gray(`   Posiciones: ${portfolio.positions.length}`));
      
      if (portfolio.positions.length > 0) {
        portfolio.positions.forEach(p => {
          console.log(chalk.gray(`   - ${p.symbol}: ${p.shares} acciones @ $${p.avgCost.toFixed(2)}`));
        });
      } else {
        console.log(chalk.red(`   ⚠️  NO SE DETECTARON POSICIONES - Esto puede ser un problema`));
        console.log(chalk.yellow(`   💡 Revisa si TWS muestra tus posiciones correctamente`));
      }
      
      // DEBUG: Mostrar lo que vamos a enviar a GPT-4.5
      console.log(chalk.magenta('\n🔍 DEBUG - DATOS QUE SE ENVÍAN A GPT-4.5:'));
      console.log(chalk.cyan('═'.repeat(60)));
      
      const portfolioContext = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MI PORTFOLIO ACTUAL (DATOS REALES DE INTERACTIVE BROKERS):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RESUMEN FINANCIERO:
• Valor total del portfolio: $${portfolio.totalValue.toFixed(2)}
• Efectivo disponible: $${portfolio.cash.toFixed(2)}
• Capital invertido: $${(portfolio.totalValue - portfolio.cash).toFixed(2)}

POSICIONES ACTUALES DETALLADAS:
${portfolio.positions.length > 0 ? 
    portfolio.positions.map(p => {
      const currentValue = p.shares * p.avgCost;
      const percentage = ((currentValue / portfolio.totalValue) * 100).toFixed(1);
      return `
• ${p.symbol}: 
  - Cantidad: ${p.shares} acciones
  - Precio promedio: $${p.avgCost.toFixed(2)}
  - Valor total: $${currentValue.toFixed(2)}
  - Porcentaje del portfolio: ${percentage}%
  - Máximo vendible: ${p.shares} acciones`;
    }).join('') : 
    '\n• Sin posiciones abiertas actualmente'}

LIMITACIONES PARA ÓRDENES:
• Solo puedes COMPRAR si el costo estimado ≤ $${portfolio.cash.toFixed(2)} (efectivo disponible)
• Solo puedes VENDER acciones que POSEES actualmente
• Acciones disponibles para venta:
${portfolio.positions.length > 0 ? 
    portfolio.positions.map(p => `  - ${p.symbol}: máximo ${p.shares} acciones`).join('\n') : 
    '  - Ninguna (sin posiciones)'}

IMPORTANTE: Al sugerir acciones ejecutables, RESPETA estos límites exactos.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
      
      console.log(chalk.white(portfolioContext));
      console.log(chalk.cyan('═'.repeat(60)));
      console.log(chalk.magenta('🔍 FIN DEBUG\n'));
    } else {
      console.error(chalk.red('❌ No hay conexión con Interactive Brokers'));
      console.log(chalk.yellow('💡 Asegúrate de que TWS esté abierto y conectado'));
      return;
    }
    
    // Buscar noticias
    const marketData = await searchTechNews();
    
    if (marketData.newsItems.length === 0) {
      console.log(chalk.yellow('⚠️  No hay datos de mercado disponibles'));
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
        console.log(chalk.gray('\n✋ Acción cancelada por el usuario'));
      }
    } else if (tradingAction && tradingAction.side === 'HOLD') {
      console.log(chalk.blue('\n📊 No hay acción para ejecutar en este momento'));
    }
    
  } catch (error) {
    console.error(chalk.red('\n❌ Error en ciclo:'), error.message);
  }
  
  console.log(chalk.gray('\n' + '━'.repeat(60)));
}

// Main
async function main() {
  console.log(chalk.yellow('\n⚡ Iniciando Market Intelligence Analyst...'));
  
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'tu_api_key_aqui') {
    console.error(chalk.red('\n❌ ERROR: Configura tu OPENAI_API_KEY en .env'));
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
        message: '\n¿Quieres ejecutar otro análisis?',
        default: true
      }
    ]);
    
    if (next) {
      await runAnalysisCycle();
      await askForNext();
    } else {
      console.log(chalk.yellow('\n👋 Cerrando Market Intelligence Analyst...'));
      if (ibClient) ibClient.disconnect();
      process.exit(0);
    }
  };
  
  await askForNext();
}

// Manejo de cierre
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n👋 Cerrando...'));
  if (ibClient) ibClient.disconnect();
  process.exit(0);
});

// Iniciar
main().catch(console.error);