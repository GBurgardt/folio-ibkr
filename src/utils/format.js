export function formatMoney(value, showSign = false) {
  if (value === null || value === undefined || isNaN(value)) {
    return '$--';
  }

  const absValue = Math.abs(value);
  const formatted = absValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (showSign && value !== 0) {
    return value >= 0 ? `+$${formatted}` : `-$${formatted}`;
  }

  return value >= 0 ? `$${formatted}` : `-$${formatted}`;
}

export function formatPercent(value, showSign = false) {
  if (value === null || value === undefined || isNaN(value)) {
    return '--%';
  }

  const formatted = Math.abs(value).toFixed(2);

  if (showSign && value !== 0) {
    return value >= 0 ? `+${formatted}%` : `-${formatted}%`;
  }

  return value >= 0 ? `${formatted}%` : `-${formatted}%`;
}

export function formatQuantity(value) {
  if (value === null || value === undefined) {
    return '--';
  }

  return value.toLocaleString('en-US');
}

export function padRight(str, len) {
  str = String(str);
  while (str.length < len) {
    str += ' ';
  }
  return str;
}

export function padLeft(str, len) {
  str = String(str);
  while (str.length < len) {
    str = ' ' + str;
  }
  return str;
}

/**
 * Format a timestamp to human-readable relative time
 * Examples: "ahora", "hace 5 min", "hace 2 horas", "hace 3 días", "el lunes"
 */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return '';

  const now = Date.now();
  const date = new Date(timestamp);
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  // Less than 1 minute
  if (diffSeconds < 60) {
    return 'ahora';
  }

  // Less than 1 hour
  if (diffMinutes < 60) {
    return `hace ${diffMinutes} min`;
  }

  // Less than 24 hours
  if (diffHours < 24) {
    return diffHours === 1 ? 'hace 1 hora' : `hace ${diffHours} horas`;
  }

  // Less than 7 days - show day name for this week
  if (diffDays < 7) {
    const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const dayName = days[date.getDay()];
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    if (diffDays === 1) {
      return `ayer ${hours}:${minutes}`;
    }

    return `el ${dayName}`;
  }

  // Less than 4 weeks
  if (diffWeeks < 4) {
    return diffWeeks === 1 ? 'hace 1 semana' : `hace ${diffWeeks} semanas`;
  }

  // Less than 12 months
  if (diffMonths < 12) {
    return diffMonths === 1 ? 'hace 1 mes' : `hace ${diffMonths} meses`;
  }

  // Years
  return diffYears === 1 ? 'hace 1 año' : `hace ${diffYears} años`;
}

/**
 * Format future execution time for pending orders
 * Examples: "en segundos", "mañana 9:30", "lunes 9:30"
 *
 * US Market hours: 9:30 AM - 4:00 PM ET (Eastern Time)
 */
export function formatFutureTime(status, warningTimestamp = null) {
  // If we have a specific timestamp from the warning, use it
  if (warningTimestamp) {
    try {
      const date = new Date(warningTimestamp.replace(' ', 'T'));
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;

      const isToday = date.toDateString() === now.toDateString();
      const isTomorrow = date.toDateString() === tomorrow.toDateString();

      if (isToday) {
        return `hoy ${timeStr}`;
      } else if (isTomorrow) {
        return `mañana ${timeStr}`;
      } else {
        const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        return `${days[date.getDay()]} ${timeStr}`;
      }
    } catch {
      // Fall through to status-based logic
    }
  }

  // Status-based messages
  switch (status) {
    case 'PendingSubmit':
      return 'enviando...';
    case 'PreSubmitted':
      return 'procesando...';
    case 'Submitted':
      // Check if market is open (simplified: weekday 9:30-16:00 ET)
      const now = new Date();
      const etHour = getETHour(now);
      const dayOfWeek = now.getDay(); // 0=Sunday, 6=Saturday

      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isMarketHours = etHour >= 9.5 && etHour < 16;

      if (!isWeekend && isMarketHours) {
        return 'ejecutando...';
      } else {
        return getNextMarketOpen();
      }
    default:
      return 'pendiente';
  }
}

/**
 * Get current hour in ET (Eastern Time) as decimal
 * e.g., 9:30 AM = 9.5
 */
function getETHour(date) {
  // Simple approximation: assume local time is close enough
  // For production, use proper timezone library
  const utcHour = date.getUTCHours() + date.getUTCMinutes() / 60;
  // ET is UTC-5 (or UTC-4 during DST)
  // Simplified: assume UTC-5
  let etHour = utcHour - 5;
  if (etHour < 0) etHour += 24;
  return etHour;
}

/**
 * Calculate next market open time
 */
function getNextMarketOpen() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const etHour = getETHour(now);

  // If it's a weekday and before market close
  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    if (etHour < 9.5) {
      return 'hoy 9:30';
    } else if (etHour >= 16) {
      // After close, next day
      if (dayOfWeek === 5) {
        return 'lunes 9:30';
      }
      return 'mañana 9:30';
    }
  }

  // Weekend
  if (dayOfWeek === 6) { // Saturday
    return 'lunes 9:30';
  }
  if (dayOfWeek === 0) { // Sunday
    return 'mañana 9:30';
  }

  return 'próxima apertura';
}
