import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const required = [
  'README.md', 'LICENSE', 'package.json', 'public/index.html', 'public/manifest.webmanifest',
  'src/server.js', 'src/app.js', 'docs/ARCHITECTURE.md', '.github/workflows/ci.yml',
];
const ignored = new Set(['.git', 'data', 'node_modules', 'coverage']);

function filesIn(directory) {
  return readdirSync(directory).flatMap((name) => {
    if (ignored.has(name)) return [];
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}

const missing = required.filter((path) => {
  try { readFileSync(join(root, path)); return false; } catch { return true; }
});
if (missing.length) {
  console.error(`Arquivos obrigatórios ausentes: ${missing.join(', ')}`);
  process.exit(1);
}

const javascript = filesIn(root).filter((path) => ['.js', '.mjs'].includes(extname(path)));
for (const path of javascript) {
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`Falha de sintaxe em ${relative(root, path)}\n${result.stderr}`);
    process.exit(result.status ?? 1);
  }
}
console.log(`${javascript.length} arquivos JavaScript validados.`);
