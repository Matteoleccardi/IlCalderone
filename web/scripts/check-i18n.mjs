// Checks the interface translations (run by `npm test`):
//  1. every literal key used in src/app ('x.y' | t, t('x.y'), notify.ok('x.y'), title: 'x.y', …) exists in src/i18n/it.ts;
//  2. every API error code in public/api/lib/Messages.php has an "err.<code>" translation;
//  3. keys of it.ts that nothing seems to use are listed as a warning (dynamic prefixes are skipped).
// The other languages are checked by the TypeScript build: they must have exactly the keys of it.ts.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dict = readFileSync(join(root, 'src/i18n/it.ts'), 'utf8');
const keys = new Set([...dict.matchAll(/^\s*'([a-z_]+\.[a-z0-9_]+)':/gm)].map((m) => m[1]));

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|html)$/.test(f) && !f.endsWith('.spec.ts') ? [p] : [];
  });
}

const used = new Map();
// a key-shaped string literal: two lowercase segments separated by a dot (file names like 'photo.jpg' are listed below)
const NOT_KEYS = new Set(['photo.jpg', 'icon.png', 'sw.js', 'favicon.svg', 'q.b', 'calderone.lang']);
for (const f of files(join(root, 'src/app'))) {
  for (const m of readFileSync(f, 'utf8').matchAll(/'([a-z]+\.[a-z][a-z0-9_]*)'/g)) {
    if (!NOT_KEYS.has(m[1])) used.set(m[1], f.slice(root.length));
  }
}

let errors = 0;
for (const [k, f] of used) {
  if (!keys.has(k)) {
    console.error(`missing key ${k} (used in ${f})`);
    errors++;
  }
}

const php = readFileSync(join(root, '../public/api/lib/Messages.php'), 'utf8');
const block = php.slice(php.indexOf('public const EN'), php.indexOf('];', php.indexOf('public const EN')));
for (const m of block.matchAll(/'([a-z_]+)' =>/g)) {
  if (!keys.has('err.' + m[1])) {
    console.error(`missing translation err.${m[1]} for the API error code in Messages.php`);
    errors++;
  }
}

const DYNAMIC = ['err.', 'check.', 'field.', 'kind.', 'meal.', 'visibility.'];
const unused = [...keys].filter((k) => !used.has(k) && !DYNAMIC.some((p) => k.startsWith(p)));
if (unused.length) console.warn(`unused keys (warning): ${unused.join(', ')}`);

if (errors) {
  console.error(`${errors} translation problem(s)`);
  process.exit(1);
}
console.log(`i18n: ${keys.size} keys, ${used.size} used literally, all API error codes translated`);
