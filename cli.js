#!/usr/bin/env node
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function listProjects() {
  const baseDir = path.resolve(__dirname, 'projects');
  if (!fs.existsSync(baseDir)) {
    console.log(chalk.red('Projects folder not found'));
    process.exit(1);
  }
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const projects = entries
    .filter((e) => e.isDirectory())
    .map((dir) => ({
      name: dir.name
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      value: dir.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return projects;
}

async function selectProject(projects) {
  const { project } = await inquirer.prompt([
    {
      type: 'list',
      name: 'project',
      message: 'Select a project to run:',
      choices: projects,
    },
  ]);
  return project;
}

async function runProject(projectSlug) {
  const entry = path.resolve(__dirname, 'projects', projectSlug, 'index.js');
  if (!fs.existsSync(entry)) {
    console.log(chalk.red(`Entrypoint not found: ${entry}`));
    process.exit(1);
  }

  // Ejecutar como subproceso
  const node = process.execPath;
  const child = spawn(node, [entry], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

async function main() {
  console.clear();
  console.log(chalk.blue.bold('\n🧭 Folio CLI'));
  console.log(chalk.gray('━'.repeat(60)));

  const projects = await listProjects();
  if (projects.length === 0) {
    console.log(chalk.yellow('No projects found in ./projects'));
    process.exit(0);
  }

  const selected = await selectProject(projects);
  await runProject(selected);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
