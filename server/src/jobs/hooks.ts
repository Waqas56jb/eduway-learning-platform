/**
 * Cross-module job hooks. Jobs owned by src/jobs call domain functions implemented by other modules
 * (e.g. C's `expireSubscriptionsAndRemind()`, B's `autoSubmitExpiredAttempts()`) WITHOUT a static import, so the
 * jobs package compiles and runs even while a module is missing. Resolution order:
 *   1. an explicit `provideJobHook(name, fn)` registration (preferred for modules that want to be explicit);
 *   2. the first `src/modules/<dir>/index` exporting a function with that name (scanned once, cached).
 * A missing hook is logged once and the job is a no-op.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../config/logger.js';

export type HookFn = (...args: unknown[]) => unknown;

const provided = new Map<string, HookFn>();
const resolved = new Map<string, HookFn | null>();
const warned = new Set<string>();
const MODULES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'modules');

export function provideJobHook(name: string, fn: HookFn): void {
  provided.set(name, fn);
  resolved.delete(name);
}

/** Module folders to scan (preferred candidates first, then every other module). */
function moduleDirs(preferred: string[]): string[] {
  let all: string[] = [];
  try {
    all = readdirSync(MODULES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    all = [];
  }
  return [...preferred.filter((p) => all.includes(p)), ...all.filter((d) => !preferred.includes(d))];
}

export async function resolveHook(name: string, preferred: string[] = []): Promise<HookFn | null> {
  const p = provided.get(name);
  if (p) return p;
  if (resolved.has(name)) return resolved.get(name) ?? null;
  for (const dir of moduleDirs(preferred)) {
    const spec = `../modules/${dir}/index.js`;
    try {
      const mod = (await import(spec)) as Record<string, unknown>;
      const fn = mod[name];
      if (typeof fn === 'function') {
        resolved.set(name, fn as HookFn);
        return fn as HookFn;
      }
    } catch {
      /* module without index / failed import — keep scanning */
    }
  }
  resolved.set(name, null);
  return null;
}

/** Call a hook if it exists. Returns `{ ran: false }` when the implementing module is not present. */
export async function callHook<R = unknown>(name: string, preferred: string[], ...args: unknown[]): Promise<{ ran: boolean; result?: R }> {
  const fn = await resolveHook(name, preferred);
  if (!fn) {
    if (!warned.has(name)) {
      warned.add(name);
      logger.warn({ hook: name }, 'job hook not implemented by any module yet — skipping');
    }
    return { ran: false };
  }
  return { ran: true, result: (await fn(...args)) as R };
}

/** Test helper. */
export function resetHooks(): void {
  provided.clear();
  resolved.clear();
  warned.clear();
}
