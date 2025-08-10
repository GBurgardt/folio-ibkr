#!/usr/bin/env node
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const inquirer = require('inquirer');
const chalk = require('chalk');

async function listProjects() {
  const baseDir = path.resolve(__dirname, 'projects');
  if (!fs.existsSync(baseDir)) {
    console.log(chalk.red('No existe la carpeta de proyectos'));
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
      message: 'Selecciona un proyecto para ejecutar:',
      choices: projects,
    },
  ]);
  return project;
}

async function runProject(projectSlug) {
  const entry = path.resolve(__dirname, 'projects', projectSlug, 'index.js');
  if (!fs.existsSync(entry)) {
    console.log(chalk.red(`No se encontró entrypoint: ${entry}`));
    process.exit(1);
  }

  // Ejecutar como subproceso
  const { spawn } = require('child_process');
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
  console.log(chalk.blue.bold('\n🧭 Interactive Brokers CLI'));
  console.log(chalk.gray('━'.repeat(60)));

  const projects = await listProjects();
  if (projects.length === 0) {
    console.log(chalk.yellow('No hay proyectos disponibles en ./projects'));
    process.exit(0);
  }

  const selected = await selectProject(projects);
  await runProject(selected);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
