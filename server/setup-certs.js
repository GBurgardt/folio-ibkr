#!/usr/bin/env node
/**
 * Generate self-signed SSL certificates for the mobile server
 *
 * Usage: node server/setup-certs.js
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CERTS_DIR = path.join(__dirname, 'certs');

// Crear directorio si no existe
if (!fs.existsSync(CERTS_DIR)) {
  fs.mkdirSync(CERTS_DIR, { recursive: true });
}

const keyPath = path.join(CERTS_DIR, 'key.pem');
const certPath = path.join(CERTS_DIR, 'cert.pem');

// Verificar si ya existen
if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  console.log('Certificates already exist in server/certs/');
  console.log('To regenerate them, delete the existing files first.');
  process.exit(0);
}

console.log('Generating SSL certificates...\n');

try {
  // Generar certificado self-signed válido por 365 días
  // Incluye localhost y IPs locales comunes
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "${keyPath}" \
    -out "${certPath}" \
    -days 365 \
    -subj "/CN=Folio Mobile Server" \
    -addext "subjectAltName=DNS:localhost,DNS:folio.local,IP:127.0.0.1,IP:192.168.1.1,IP:192.168.0.1,IP:10.0.0.1"
  `, { stdio: 'inherit' });

  console.log('\n✓ Certificates generated!\n');
  console.log('Files:');
  console.log(`  - ${keyPath}`);
  console.log(`  - ${certPath}`);
  console.log('\n');
  console.log('Note: the first time you open the app on iPhone,');
  console.log('Safari will show a security warning.');
  console.log('Tap "Show Details" → "Visit Website" to continue.');
  console.log('\n');

} catch (err) {
  console.error('Error generating certificates:', err.message);
  console.error('\nMake sure OpenSSL is installed.');
  console.error('On macOS it is usually preinstalled.');
  process.exit(1);
}
