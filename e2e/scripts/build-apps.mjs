// Builds production bundles of both web apps into e2e/.dist/<app> (never touches the apps' own dist/).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const apps = process.argv.slice(2).length ? process.argv.slice(2) : ['user', 'admin'];

for (const app of apps) {
  const cwd = path.join(root, 'website', app);
  const outDir = path.join(root, 'e2e', '.dist', app);
  console.log(`\n▶ building website/${app} → ${path.relative(root, outDir)}`);
  const r = spawnSync('npx', ['vite', 'build', '--outDir', JSON.stringify(outDir), '--emptyOutDir'], { cwd, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
