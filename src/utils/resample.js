export function resampleLinear(values, targetLength) {
  if (!Array.isArray(values) || values.length === 0) return [];
  if (!Number.isFinite(targetLength) || targetLength <= 0) return [];

  const n = values.length;
  const m = Math.floor(targetLength);

  if (m === 1) return [values[n - 1]];
  if (n === 1) return new Array(m).fill(values[0]);

  const out = new Array(m);
  const scale = (n - 1) / (m - 1);

  for (let i = 0; i < m; i++) {
    const pos = i * scale;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, n - 1);
    const t = pos - left;
    const a = values[left];
    const b = values[right];
    out[i] = a + (b - a) * t;
  }

  return out;
}

