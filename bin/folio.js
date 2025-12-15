#!/usr/bin/env node
import { spawnSync } from 'child_process';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

const tsxCliPath = require.resolve('tsx/cli');
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entrypoint = path.join(packageRoot, 'src', 'index.jsx');

const result = spawnSync(process.execPath, [tsxCliPath, entrypoint, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
