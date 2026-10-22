// Post-build: copy non-TS runtime assets (SQL migrations, seed JSON) next to the compiled JS in dist/.
import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const rel of ['src/db/migrations', 'src/db/seed/data']) {
  const to = path.join(root, 'dist', rel);
  mkdirSync(to, { recursive: true });
  cpSync(path.join(root, rel), to, { recursive: true });
  console.log(`copied ${rel} → dist/${rel}`);
}
