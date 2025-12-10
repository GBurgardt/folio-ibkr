#!/usr/bin/env node
/**
 * Genera certificados SSL self-signed para el servidor móvil
 *
 * Uso: node server/setup-certs.js
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
  console.log('Los certificados ya existen en server/certs/');
  console.log('Para regenerarlos, borrá los archivos existentes primero.');
  process.exit(0);
}

console.log('Generando certificados SSL...\n');

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

  console.log('\n✓ Certificados generados exitosamente!\n');
  console.log('Archivos:');
  console.log(`  - ${keyPath}`);
  console.log(`  - ${certPath}`);
  console.log('\n');
  console.log('NOTA: Al abrir la app en tu iPhone por primera vez,');
  console.log('Safari mostrará una advertencia de seguridad.');
  console.log('Tocá "Mostrar detalles" → "Visitar sitio" para continuar.');
  console.log('\n');

} catch (err) {
  console.error('Error generando certificados:', err.message);
  console.error('\nAsegurate de tener OpenSSL instalado.');
  console.error('En macOS viene preinstalado.');
  process.exit(1);
}
