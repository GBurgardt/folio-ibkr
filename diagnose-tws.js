#!/usr/bin/env node
/**
 * TWS Connection Diagnostic Script
 * Run with: node diagnose-tws.js [port]
 *
 * This tests raw IB connection without React/Ink overhead.
 */

import IB from 'ib';
import net from 'net';

const port = parseInt(process.argv[2] || '7496', 10);
const clientId = 999; // Use different ID to avoid conflicts

// Try multiple hosts (IPv4 and IPv6)
const hosts = ['127.0.0.1', '::1', 'localhost'];

console.log('\n🔍 TWS Connection Diagnostic');
console.log('='.repeat(50));
console.log(`Port: ${port}`);
console.log(`ClientId: ${clientId}`);
console.log(`Testing hosts: ${hosts.join(', ')}`);
console.log('='.repeat(50));

// Step 1: Raw TCP connection test on multiple hosts
console.log('\n[1/3] Testing raw TCP connection...');

async function testTcp(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);

    socket.on('connect', () => {
      socket.destroy();
      resolve({ host, ok: true });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ host, ok: false, error: 'timeout' });
    });

    socket.on('error', (err) => {
      resolve({ host, ok: false, error: err.code });
    });

    socket.connect(port, host);
  });
}

let workingHost = null;
for (const host of hosts) {
  process.stdout.write(`   Testing ${host}:${port}... `);
  const result = await testTcp(host, port);
  if (result.ok) {
    console.log('✅ OK');
    workingHost = host;
    break;
  } else {
    console.log(`❌ ${result.error}`);
  }
}

const tcpOk = workingHost !== null;
const host = workingHost || '127.0.0.1';

if (workingHost) {
  console.log(`\n✅ TCP: Connected via ${workingHost}`);
}

if (!tcpOk) {
  console.log('\n❌ DIAGNÓSTICO: TWS no está aceptando conexiones TCP');
  console.log('\nVerificá en TWS:');
  console.log('  1. Edit → Global Configuration → API → Settings');
  console.log('  2. ✅ "Enable ActiveX and Socket Clients" = HABILITADO');
  console.log(`  3. ✅ Socket port = ${port}`);
  console.log('  4. ✅ "Allow connections from localhost only" = SI');
  console.log('\nTambién verificá:');
  console.log('  - TWS está abierto y logueado?');
  console.log('  - Hay un firewall bloqueando?');
  console.log('  - Estás usando el puerto correcto? (7496=live, 7497=paper)');
  process.exit(1);
}

// Step 2: IB API connection test
console.log('\n[2/3] Testing IB API handshake...');

const ibTest = new Promise((resolve) => {
  const client = new IB({ clientId, host, port });
  let resolved = false;

  const timeout = setTimeout(() => {
    if (!resolved) {
      resolved = true;
      console.log('❌ IB API: Handshake timeout (TWS no respondió al API handshake)');
      try { client.disconnect(); } catch (e) {}
      resolve(false);
    }
  }, 10000);

  client.on('error', (err, data) => {
    const code = data?.code;
    const msg = err?.message || String(err);

    // Ignore info codes
    if (code && [2104, 2106, 2158, 2119].includes(code)) return;

    if (!resolved && (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT'))) {
      resolved = true;
      clearTimeout(timeout);
      console.log('❌ IB API Error:', msg);
      resolve(false);
    }
  });

  client.on('nextValidId', (orderId) => {
    if (!resolved) {
      resolved = true;
      clearTimeout(timeout);
      console.log('✅ IB API: Connection successful! nextValidId:', orderId);

      // Request account info
      client.reqManagedAccts();
    }
  });

  client.on('managedAccounts', (accounts) => {
    console.log('✅ IB API: Account(s):', accounts);
    client.disconnect();
    resolve(true);
  });

  client.on('disconnected', () => {
    if (!resolved) {
      resolved = true;
      clearTimeout(timeout);
      resolve(false);
    }
  });

  console.log('   Connecting...');
  client.connect();
  client.reqIds(1);
});

const ibOk = await ibTest;

// Step 3: Summary
console.log('\n[3/3] Diagnóstico completo');
console.log('='.repeat(50));

if (ibOk) {
  console.log('✅ TODO OK! La conexión a TWS funciona correctamente.');
  console.log('\nPodés correr la app con:');
  console.log('  npm start           (cuenta real)');
  console.log('  npm start -- --paper    (paper trading)');
} else if (tcpOk) {
  console.log('⚠️  TCP OK pero IB API handshake falló');
  console.log('\nPosibles causas:');
  console.log('  1. "Enable ActiveX and Socket Clients" está deshabilitado');
  console.log('  2. Otra app está conectada con el mismo clientId');
  console.log('  3. TWS requiere confirmar la conexión manualmente');
  console.log('\nPasos:');
  console.log('  1. En TWS: Edit → Global Configuration → API → Settings');
  console.log('  2. Habilitá "Enable ActiveX and Socket Clients"');
  console.log('  3. Deshabilitá "Read-Only API" si querés hacer trades');
  console.log('  4. Revisá Help → Data Connections para ver conexiones activas');
} else {
  console.log('❌ No hay conectividad a TWS');
}

console.log('\n');
process.exit(ibOk ? 0 : 1);
