/**
 * Regenera la lista de archivos que el service worker precarga.
 * Uso:  node tools/update-precache.mjs
 * Ejecútalo cada vez que agregues, renombres o elimines archivos estáticos.
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const INCLUDE_DIRS = ['css', 'js', 'assets', 'vendor', 'supabase'];
const SKIP = new Set(['.DS_Store', 'Thumbs.db']);
const SKIP_EXT = ['.md', '.txt'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (!SKIP_EXT.some((ext) => entry.toLowerCase().endsWith(ext))) out.push('./' + relative(ROOT, full).split(sep).join('/'));
  }
  return out;
}

const files = ['./', './index.html', './manifest.json', './config.js'];
for (const dir of INCLUDE_DIRS) {
  files.push(...walk(join(ROOT, dir)).sort());
}

const swPath = join(ROOT, 'service-worker.js');
const source = readFileSync(swPath, 'utf8');
const block = `/* precache:start */\nconst PRECACHE = [\n${files.map((f) => `  '${f}',`).join('\n')}\n];\n/* precache:end */`;
const updated = source.replace(/\/\* precache:start \*\/[\s\S]*?\/\* precache:end \*\//, block);
writeFileSync(swPath, updated);
console.log(`Precache actualizado: ${files.length} archivos.`);
