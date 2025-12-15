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
  console.log('\n❌ DIAGNOSIS: TWS is not accepting TCP connections');
  console.log('\nCheck in TWS:');
  console.log('  1. Edit → Global Configuration → API → Settings');
  console.log('  2. ✅ "Enable ActiveX and Socket Clients" = ENABLED');
  console.log(`  3. ✅ Socket port = ${port}`);
  console.log('  4. ✅ "Allow connections from localhost only" = YES');
  console.log('\nAlso check:');
  console.log('  - Is TWS open and logged in?');
  console.log('  - Is a firewall blocking the port?');
  console.log('  - Are you using the right port? (7496=live, 7497=paper)');
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
      console.log('❌ IB API: Handshake timeout (TWS did not respond to the API handshake)');
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
      console.log('❌ IB API error:', msg);
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
console.log('\n[3/3] Diagnostic summary');
console.log('='.repeat(50));

if (ibOk) {
  console.log('✅ All good! TWS connection works.');
  console.log('\nRun the app with:');
  console.log('  npm start              (live)');
  console.log('  npm start -- --paper   (paper)');
} else if (tcpOk) {
  console.log('⚠️  TCP OK but IB API handshake failed');
  console.log('\nPossible causes:');
  console.log('  1. "Enable ActiveX and Socket Clients" is disabled');
  console.log('  2. Another app is connected with the same clientId');
  console.log('  3. TWS requires manual approval for API connections');
  console.log('\nSteps:');
  console.log('  1. In TWS: Edit → Global Configuration → API → Settings');
  console.log('  2. Enable "Enable ActiveX and Socket Clients"');
  console.log('  3. Disable "Read-Only API" if you want to place orders');
  console.log('  4. Check Help → Data Connections for active sessions');
} else {
  console.log('❌ No connectivity to TWS');
}

console.log('\n');
process.exit(ibOk ? 0 : 1);
