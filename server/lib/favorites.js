/**
 * Carga la lista de favoritos (watchlist)
 *
 * Los favoritos se definen en server/favorites.json
 * Es un simple array de símbolos.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAVORITES_FILE = path.join(__dirname, '..', 'favorites.json');

// Favoritos por defecto si no existe el archivo
const DEFAULT_FAVORITES = ['NVDA', 'AMD', 'MSFT', 'GOOGL', 'AMZN'];

/**
 * Cargar favoritos desde archivo
 */
export function loadFavorites() {
  try {
    if (fs.existsSync(FAVORITES_FILE)) {
      const content = fs.readFileSync(FAVORITES_FILE, 'utf-8');
      const favorites = JSON.parse(content);

      if (Array.isArray(favorites)) {
        return favorites.map(s => s.toUpperCase());
      }
    }
  } catch (err) {
    console.log('[FAVORITES] Error cargando favoritos:', err.message);
  }

  // Crear archivo por defecto
  try {
    fs.writeFileSync(FAVORITES_FILE, JSON.stringify(DEFAULT_FAVORITES, null, 2));
    console.log('[FAVORITES] Archivo de favoritos creado con valores por defecto');
  } catch (err) {
    // Ignorar
  }

  return DEFAULT_FAVORITES;
}

/**
 * Guardar favoritos
 */
export function saveFavorites(favorites) {
  try {
    const normalized = favorites.map(s => s.toUpperCase());
    fs.writeFileSync(FAVORITES_FILE, JSON.stringify(normalized, null, 2));
    return true;
  } catch (err) {
    console.log('[FAVORITES] Error guardando favoritos:', err.message);
    return false;
  }
}

export default { loadFavorites, saveFavorites };
