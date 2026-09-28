import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const logo = readFileSync(resolve(root, 'public/logo.svg'), 'utf8');
const outDir = resolve(root, 'public/_master');
mkdirSync(outDir, { recursive: true });

for (const name of ['favicon.svg', 'icon-192.svg', 'icon-512.svg']) {
  writeFileSync(resolve(root, 'public', name), logo);
}

const mark = logo.replace(/\s*<rect width="512" height="512" rx="114"[\s\S]*?\/>\s*<rect width="512" height="512" rx="114"[\s\S]*?\/>/, '');

const bleed = logo
  .replaceAll('rx="114"', 'rx="0"')
  .replace(
    '<g filter="url(#soft)">',
    '<g filter="url(#soft)" transform="translate(256 256) scale(0.9) translate(-256 -256)">',
  );

function png(svg, width, file) {
  const rendered = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
  writeFileSync(resolve(outDir, file), rendered);
}

png(logo, 1024, 'rounded.png');
png(bleed, 1024, 'bleed.png');
png(mark, 1024, 'mark.png');
png(readFileSync(resolve(root, 'public/qapla-mark-white.svg')), 1024, 'white.png');

const compose = spawnSync('python', [resolve(root, 'scripts/compose-brand-icons.py')], {
  cwd: root,
  stdio: 'inherit',
});
if (compose.status !== 0) process.exit(compose.status ?? 1);
