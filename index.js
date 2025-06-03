const ib = require('ib');

// Crear cliente IB
const client = new ib({
  clientId: 0,
  host: '127.0.0.1',
  port: 7497  // Puerto para TWS paper trading (7496 para live)
});

// Manejador de errores
client.on('error', (err) => {
  console.error('❌ Error:', err.message);
});

// Cuando se conecta exitosamente
client.on('nextValidId', (orderId) => {
  console.log('✅ Conectado exitosamente. Próximo Order ID:', orderId);
  
  // Solicitar cuentas manejadas
  client.reqManagedAccts();
  
  // Solicitar información de la cuenta
  client.reqAccountSummary(1, 'All', 'AccountType,NetLiquidation,TotalCashValue');
});

// Respuesta de cuentas manejadas
client.on('managedAccounts', (accounts) => {
  console.log('📊 Cuentas disponibles:', accounts);
});

// Respuesta del resumen de cuenta
client.on('accountSummary', (reqId, account, tag, value, currency) => {
  console.log(`💰 ${tag}: ${value} ${currency || ''} (Cuenta: ${account})`);
});

// Cuando termina el resumen de cuenta
client.on('accountSummaryEnd', (reqId) => {
  console.log('✅ Información de cuenta obtenida');
  client.disconnect();
});

// Iniciar conexión
console.log('🔗 Conectando a Interactive Brokers...');
client.connect();

// Solicitar el próximo ID válido para iniciar
client.reqIds(1);