import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'android', 'gradle-overrides', 'capacitor-geolocation.build.gradle');
const target = join(root, 'node_modules', '@capacitor', 'geolocation', 'android', 'build.gradle');

if (!existsSync(source) || !existsSync(dirname(target))) {
  process.exit(0);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
