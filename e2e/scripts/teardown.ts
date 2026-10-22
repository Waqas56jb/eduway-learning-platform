import { execSync } from 'node:child_process';
import { ADMIN_URL, USER_URL } from '../tests/support/env';

/**
 * Safety net: on Windows a killed `vite` web server can leave its node child alive.
 * The suite owns its ports (never a developer's), so any listener left on them is ours to stop.
 */
export default function teardown() {
  if (process.platform !== 'win32') return;
  for (const url of [USER_URL, ADMIN_URL]) {
    const port = new URL(url).port;
    try {
      const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, { encoding: 'utf8' });
      const pids = new Set(out.split(/\r?\n/).map((l) => l.trim().split(/\s+/)).filter((c) => c[1]?.endsWith(`:${port}`)).map((c) => c[4]));
      for (const pid of pids) if (pid && pid !== '0') execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } catch {
      /* nothing listening */
    }
  }
}
