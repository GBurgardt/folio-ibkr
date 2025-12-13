#!/usr/bin/env node
/**
 * Import portfolio NAV/equity history into Folio's local store (~/.folio).
 *
 * Supports:
 * - IBKR Client Portal API PortfolioAnalyst:
 *   - POST /pa/performance response JSON (nav.dates + nav.data[].navs)
 *   - POST /pa/allperiods response JSON (ACCOUNT_ID.{1Y|YTD|1M|...}.nav + dates)
 * - Simple CSV: date,netLiquidation[,cash]
 *   - date formats: YYYYMMDD | YYYY-MM-DD
 *
 * Examples:
 *   node projects/import-portfolio-history.js --account U1234567 --file pa-performance.json
 *   node projects/import-portfolio-history.js --account U1234567 --file allperiods.json --period 1Y
 *   node projects/import-portfolio-history.js --account U1234567 --file history.csv
 */

import fs from 'fs/promises';
import path from 'path';
import { appendJsonl, portfolioHistoryPath } from '../src/lib/persistedJsonl.js';

function usage() {
  console.log(`
Usage:
  node projects/import-portfolio-history.js --account <Uxxxxxxx> --file <path> [--period 1Y] [--dry-run]
`);
}

function parseArgs(argv) {
  const args = { period: '1Y', dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--account') args.account = argv[++i];
    else if (a === '--file') args.file = argv[++i];
    else if (a === '--period') args.period = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function tsFromYyyymmdd(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  // Use noon UTC to avoid DST shifts when rendered locally.
  return Date.UTC(year, month, day, 12, 0, 0, 0);
}

function tsFromIsoDate(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  return Date.UTC(year, month, day, 12, 0, 0, 0);
}

function parseNumber(x) {
  const n = typeof x === 'number' ? x : Number(String(x).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function extractFromPaPerformance(json) {
  const dates = json?.nav?.dates;
  const navs = json?.nav?.data?.[0]?.navs;
  if (!Array.isArray(dates) || !Array.isArray(navs) || dates.length !== navs.length) return null;
  return dates.map((d, i) => ({ date: d, nav: navs[i] }));
}

function extractFromPaAllPeriods(json, accountId, period) {
  const acct = json?.[accountId];
  if (!acct) return null;
  const block = acct?.[period];
  if (!block) return null;
  const dates = block?.dates;
  const nav = block?.nav;
  if (!Array.isArray(dates) || !Array.isArray(nav) || dates.length !== nav.length) return null;
  return dates.map((d, i) => ({ date: d, nav: nav[i] }));
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const rows = [];
  for (const line of lines) {
    if (line.trim().startsWith('#')) continue;
    const parts = line.split(',').map(p => p.trim());
    if (parts.length < 2) continue;
    const [dateRaw, netRaw, cashRaw] = parts;
    rows.push({ dateRaw, netRaw, cashRaw });
  }
  return rows;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.account || !args.file) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const inputPath = path.resolve(process.cwd(), args.file);
  const ext = path.extname(inputPath).toLowerCase();
  const raw = await fs.readFile(inputPath, 'utf8');

  const points = [];
  if (ext === '.json') {
    const json = JSON.parse(raw);
    const fromPerf = extractFromPaPerformance(json);
    const fromAll = extractFromPaAllPeriods(json, args.account, args.period);
    const series = fromPerf || fromAll;
    if (!series) {
      throw new Error('No pude encontrar una serie NAV en el JSON (esperaba /pa/performance o /pa/allperiods).');
    }
    for (const p of series) {
      const ts = tsFromYyyymmdd(String(p.date));
      const nav = parseNumber(p.nav);
      if (!ts || nav === null) continue;
      points.push({ ts, netLiquidation: nav, cash: null });
    }
  } else {
    // CSV fallback
    const rows = parseCsv(raw);
    for (const r of rows) {
      const ts = tsFromYyyymmdd(r.dateRaw) ?? tsFromIsoDate(r.dateRaw);
      const net = parseNumber(r.netRaw);
      const cash = r.cashRaw !== undefined ? parseNumber(r.cashRaw) : null;
      if (!ts || net === null) continue;
      points.push({ ts, netLiquidation: net, cash });
    }
  }

  points.sort((a, b) => a.ts - b.ts);
  if (points.length === 0) {
    throw new Error('No se importó ningún punto (archivo vacío o formato incorrecto).');
  }

  const outPath = portfolioHistoryPath(args.account);
  console.log(`Importando ${points.length} puntos → ${outPath}`);
  if (args.dryRun) {
    console.log('dry-run: no escribo nada.');
    return;
  }

  for (const p of points) {
    await appendJsonl(outPath, p);
  }
  console.log('OK');
}

main().catch((e) => {
  console.error('ERROR:', e?.message || e);
  process.exit(1);
});

