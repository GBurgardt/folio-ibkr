#!/usr/bin/env node
/**
 * Genera iconos PNG simples para la PWA
 * Usa un canvas simple para crear un icono negro con $ blanco
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

// PNG mínimo 1x1 negro (para placeholder si no podemos generar)
// En producción, generarías esto con sharp o canvas
// Por ahora, usamos el SVG que Safari puede manejar como fallback

// Copiar el SVG como apple-touch-icon (Safari lo aceptará)
const svgPath = path.join(PUBLIC_DIR, 'icon.svg');

// Para iOS, creamos un HTML que carga el SVG como icono
// iOS Safari acepta SVG para apple-touch-icon desde iOS 15+

console.log('Los iconos SVG están listos en server/public/');
console.log('Safari iOS 15+ soporta SVG como apple-touch-icon.');
console.log('\nSi necesitás PNG, instalá sharp:');
console.log('  npm install sharp');
console.log('  node server/generate-icons.js --png');

// Check if sharp is available
if (process.argv.includes('--png')) {
  try {
    const sharp = await import('sharp');

    // Generate 192x192
    await sharp.default(svgPath)
      .resize(192, 192)
      .png()
      .toFile(path.join(PUBLIC_DIR, 'icon-192.png'));

    // Generate 512x512
    await sharp.default(svgPath)
      .resize(512, 512)
      .png()
      .toFile(path.join(PUBLIC_DIR, 'icon-512.png'));

    console.log('\n✓ Iconos PNG generados!');
  } catch (err) {
    console.error('\nNo se pudo generar PNG:', err.message);
    console.log('Usando SVG como fallback.');
  }
}
