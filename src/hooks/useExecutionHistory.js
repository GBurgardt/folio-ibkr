import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appendJsonl, executionsHistoryPath, readJsonl } from '../lib/persistedJsonl.js';

const debug = (...args) => {
  if (process.argv.includes('--debug')) {
    console.error('[EXECUTIONS-HISTORY]', ...args);
  }
};

function normalizeExec(e) {
  const id = e?.id || e?.execId;
  if (!id) return null;
  return {
    id: String(id),
    symbol: e?.symbol,
    side: e?.side,
    quantity: e?.quantity,
    price: e?.price,
    time: e?.time,
    orderId: e?.orderId,
  };
}

function mergeUniqueById(existing, incoming) {
  const map = new Map();
  for (const e of existing || []) {
    const n = normalizeExec(e);
    if (n) map.set(n.id, n);
  }
  for (const e of incoming || []) {
    const n = normalizeExec(e);
    if (n) map.set(n.id, n);
  }
  // Keep deterministic ordering by time string, then id.
  return Array.from(map.values()).sort((a, b) => {
    const ta = a.time || '';
    const tb = b.time || '';
    if (ta !== tb) return ta.localeCompare(tb);
    return a.id.localeCompare(b.id);
  });
}

export function useExecutionHistory({ accountId, isConnected, executions }) {
  const [allExecutions, setAllExecutions] = useState([]);
  const filePath = useMemo(() => executionsHistoryPath(accountId), [accountId]);
  const loadKey = useMemo(() => String(accountId || 'unknown'), [accountId]);
  const isLoadedRef = useRef(false);
  const appendQueueRef = useRef(Promise.resolve());
  const knownIdsRef = useRef(new Set());

  useEffect(() => {
    let cancelled = false;
    isLoadedRef.current = false;
    knownIdsRef.current = new Set();
    setAllExecutions([]);

    (async () => {
      try {
        const rows = await readJsonl(filePath);
        if (cancelled) return;
        const merged = mergeUniqueById([], rows);
        setAllExecutions(merged);
        knownIdsRef.current = new Set(merged.map(e => e.id));
        isLoadedRef.current = true;
        debug('Loaded executions:', merged.length, 'for', loadKey);
      } catch (e) {
        if (cancelled) return;
        debug('Failed to load executions:', e?.message);
        isLoadedRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filePath, loadKey]);

  const appendExecution = useCallback((exec) => {
    const n = normalizeExec(exec);
    if (!n) return;
    if (knownIdsRef.current.has(n.id)) return;
    knownIdsRef.current.add(n.id);

    setAllExecutions(prev => mergeUniqueById(prev, [n]));
    appendQueueRef.current = appendQueueRef.current
      .then(() => appendJsonl(filePath, n))
      .catch(() => {});
  }, [filePath]);

  useEffect(() => {
    if (!isConnected) return;
    if (!isLoadedRef.current) return;
    for (const e of executions || []) appendExecution(e);
  }, [isConnected, executions, appendExecution]);

  return { allExecutions };
}

export default useExecutionHistory;

