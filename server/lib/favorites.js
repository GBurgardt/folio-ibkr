/**
 * Carga la lista de favoritos (watchlist)
 *
 * Los favoritos se definen en `server/favorites.json` (local, no se commitea).
 * En el repo se incluye `server/favorites.example.json` como referencia.
 * Es un simple array de símbolos.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAVORITES_FILE = path.join(__dirname, '..', 'favorites.json');
const FAVORITES_EXAMPLE_FILE = path.join(__dirname, '..', 'favorites.example.json');

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
    console.log('[FAVORITES] Error loading favorites:', err.message);
  }

  // Crear archivo por defecto (desde el ejemplo si existe)
  let seed = DEFAULT_FAVORITES;
  try {
    if (fs.existsSync(FAVORITES_EXAMPLE_FILE)) {
      const example = JSON.parse(fs.readFileSync(FAVORITES_EXAMPLE_FILE, 'utf-8'));
      if (Array.isArray(example) && example.length > 0) {
        seed = example;
      }
    }
    fs.writeFileSync(FAVORITES_FILE, JSON.stringify(seed, null, 2));
    console.log('[FAVORITES] Favorites file created with defaults');
  } catch (err) {
    // Ignorar
  }

  return seed.map(s => String(s).toUpperCase());
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
    console.log('[FAVORITES] Error saving favorites:', err.message);
    return false;
  }
}

export default { loadFavorites, saveFavorites };
