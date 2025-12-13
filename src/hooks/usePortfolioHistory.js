import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appendJsonl, portfolioHistoryPath, readJsonl } from '../lib/persistedJsonl.js';

const debug = (...args) => {
  if (process.argv.includes('--debug')) {
    console.error('[PORTFOLIO-HISTORY]', ...args);
  }
};

function normalizePoint(p) {
  const ts = Number(p?.ts);
  const netLiquidation = Number(p?.netLiquidation);
  const cash = p?.cash === null || p?.cash === undefined ? null : Number(p.cash);
  if (!Number.isFinite(ts) || !Number.isFinite(netLiquidation)) return null;
  return {
    ts,
    netLiquidation,
    cash: Number.isFinite(cash) ? cash : null,
  };
}

function dedupeAndSort(points) {
  const map = new Map();
  for (const p of points) {
    const n = normalizePoint(p);
    if (!n) continue;
    // keep the last for a given timestamp
    map.set(n.ts, n);
  }
  return Array.from(map.values()).sort((a, b) => a.ts - b.ts);
}

export function usePortfolioHistory({
  accountId,
  isConnected,
  netLiquidation,
  cash,
}) {
  const [history, setHistory] = useState([]);
  const filePath = useMemo(() => portfolioHistoryPath(accountId), [accountId]);
  const loadKey = useMemo(() => String(accountId || 'unknown'), [accountId]);
  const isLoadedRef = useRef(false);
  const appendQueueRef = useRef(Promise.resolve());
  const lastAppendRef = useRef(null);

  // Load persisted history when account changes.
  useEffect(() => {
    let cancelled = false;
    isLoadedRef.current = false;
    setHistory([]);

    (async () => {
      try {
        const points = await readJsonl(filePath);
        if (cancelled) return;
        setHistory(dedupeAndSort(points));
        isLoadedRef.current = true;
        debug('Loaded history points:', points.length, 'for', loadKey);
      } catch (e) {
        if (cancelled) return;
        debug('Failed to load history:', e?.message);
        isLoadedRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filePath, loadKey]);

  const appendPoint = useCallback((point) => {
    const normalized = normalizePoint(point);
    if (!normalized) return;

    // Update in-memory state immediately (dedupe by ts).
    setHistory(prev => {
      const last = prev[prev.length - 1];
      if (last?.ts === normalized.ts) return prev;
      const next = [...prev, normalized];
      // Keep bounded in memory; disk keeps full.
      if (next.length > 50_000) next.splice(0, next.length - 50_000);
      return next;
    });

    // Serialize appends to avoid interleaving.
    appendQueueRef.current = appendQueueRef.current
      .then(() => appendJsonl(filePath, normalized))
      .catch(() => {});
  }, [filePath]);

  // Record points while connected.
  useEffect(() => {
    if (!isConnected) return;
    if (!Number.isFinite(netLiquidation) || netLiquidation <= 0) return;
    if (!isLoadedRef.current) return;

    const now = Date.now();
    const last = lastAppendRef.current;

    const cashNum = Number.isFinite(cash) ? cash : null;
    const nextPoint = { ts: now, netLiquidation, cash: cashNum };

    // Throttle: store at most every ~5 minutes unless it moved meaningfully.
    const MIN_INTERVAL_MS = 5 * 60 * 1000;
    if (last) {
      const dt = now - last.ts;
      const dNet = netLiquidation - last.netLiquidation;
      const threshold = Math.max(50, Math.abs(last.netLiquidation) * 0.001);
      if (dt < MIN_INTERVAL_MS && Math.abs(dNet) < threshold) return;
    }

    lastAppendRef.current = nextPoint;
    appendPoint(nextPoint);
  }, [isConnected, netLiquidation, cash, appendPoint]);

  const seedIfEmpty = useCallback(() => {
    if (!Number.isFinite(netLiquidation) || netLiquidation <= 0) return;
    if (!isLoadedRef.current) return;
    const cashNum = Number.isFinite(cash) ? cash : null;
    setHistory(prev => {
      if (prev.length >= 2) return prev;
      const now = Date.now();
      const point = { ts: now, netLiquidation, cash: cashNum };
      if (prev.length === 0) {
        const seeded = [{ ...point, ts: now - 60_000 }, point];
        // persist both
        lastAppendRef.current = point;
        appendPoint(seeded[0]);
        appendPoint(seeded[1]);
        return seeded;
      }
      if (prev.length === 1) {
        const first = prev[0];
        const seededFirst = { ...first, ts: Math.min(first.ts, now - 60_000) };
        lastAppendRef.current = point;
        appendPoint(seededFirst);
        appendPoint(point);
        return [seededFirst, point];
      }
      return prev;
    });
  }, [netLiquidation, cash, appendPoint]);

  return {
    history,
    seedIfEmpty,
  };
}

export default usePortfolioHistory;

