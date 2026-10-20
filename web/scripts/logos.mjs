// Lists the title images in public/logos/{light,dark,medium}/ into public/logos/logos.json, which the app reads
// (a browser cannot list a folder). Run by "npm run build", "npm start" and deploy.sh.
//   light/ = light-coloured logos, shown on DARK themes;  dark/ = dark logos, shown on LIGHT themes;
//   medium/ = logos that suit any theme (added to both).
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'logos');
const IMG = /\.(png|jpe?g|webp|avif|svg|gif)$/i;
const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' }).compare;
const list = (sub) => {
  const d = join(dir, sub);
  if (!existsSync(d)) return [];
  return readdirSync(d)
    .filter((f) => IMG.test(f) && statSync(join(d, f)).isFile())
    .sort(natural)
    .map((f) => `${sub}/${f}`);
};
const out = { light: list('light'), dark: list('dark'), medium: list('medium') };
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'logos.json'), JSON.stringify(out, null, 1) + '\n');
console.log(
  `logos: ${out.light.length} light + ${out.medium.length} medium for dark themes, ` +
    `${out.dark.length} dark + ${out.medium.length} medium for light themes`,
);
