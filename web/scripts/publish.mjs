// Copy the Angular build (dist/web/browser) into ../public, next to api/ and data/.
// ng build is never pointed at ../public directly because it would wipe the folder (and the data!).
// Files of the previous build are listed in public/.build-manifest.json and removed first, so old hashed
// bundles don't pile up; nothing else in public/ is touched.
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'dist', 'web', 'browser');
const dest = join(here, '..', '..', 'public');
const manifest = join(dest, '.build-manifest.json');
const PROTECTED = ['api', 'data', '.htaccess', '.build-manifest.json'];

if (!existsSync(src)) {
  console.error(`No build found in ${src}: run "ng build" first.`);
  process.exit(1);
}
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

if (existsSync(manifest)) {
  for (const f of JSON.parse(readFileSync(manifest, 'utf8'))) {
    if (!PROTECTED.includes(f.split('/')[0])) rmSync(join(dest, f), { force: true });
  }
}
const files = walk(src).map((p) => relative(src, p).split('\\').join('/'));
for (const f of files) {
  if (PROTECTED.includes(f.split('/')[0])) throw new Error(`build output would overwrite ${f}`);
  cpSync(join(src, f), join(dest, f));
}
writeFileSync(manifest, JSON.stringify(files, null, 1) + '\n');
console.log(`Published ${files.length} files to ${dest}`);
