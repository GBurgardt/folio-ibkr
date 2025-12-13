import os from 'os';
import path from 'path';
import fs from 'fs/promises';

function getBaseDir() {
  return path.join(os.homedir(), '.folio');
}

async function ensureBaseDir() {
  await fs.mkdir(getBaseDir(), { recursive: true });
}

export function portfolioHistoryPath(accountId) {
  const safe = String(accountId || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_');
  return path.join(getBaseDir(), `portfolio-history-${safe}.jsonl`);
}

export function executionsHistoryPath(accountId) {
  const safe = String(accountId || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_');
  return path.join(getBaseDir(), `executions-${safe}.jsonl`);
}

export async function readJsonl(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const out = [];
    for (const line of lines) {
      try {
        out.push(JSON.parse(line));
      } catch {
        // ignore bad line
      }
    }
    return out;
  } catch (e) {
    if (e && e.code === 'ENOENT') return [];
    throw e;
  }
}

export async function appendJsonl(filePath, record) {
  await ensureBaseDir();
  await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

