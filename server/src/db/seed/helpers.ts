/** Seed helpers: deterministic ids (idempotent re-runs), batched multi-row upserts, date re-basing. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v5 as uuidv5 } from 'uuid';
import type { Executor } from '../../config/db.js';

const NAMESPACE = '6f1c2b4e-8d3a-4c57-9e21-ed0a7a11f00d';

/** Deterministic uuid for a seeded entity: sid('lesson', 'math-l1'). Same input → same id on every run. */
export function sid(kind: string, key: string | number): string {
  return uuidv5(`${kind}:${key}`, NAMESPACE);
}

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
export function loadJson<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(path.join(DATA_DIR, name), 'utf8')) as T;
}

/** Mock data was authored around this instant; seeded dates are shifted so "today" stays today. */
export const MOCK_NOW = Date.parse('2026-10-22T06:30:00.000Z');
export const SHIFT_MS = Date.now() - MOCK_NOW;
export function rebase(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  return new Date(Date.parse(iso) + SHIFT_MS);
}
export const daysAgo = (d: number, h = 0) => new Date(Date.now() - d * 86_400_000 - h * 3_600_000);
export const daysAhead = (d: number) => new Date(Date.now() + d * 86_400_000);

/**
 * Multi-row INSERT in chunks. `onConflict` e.g. `(id) DO UPDATE SET name_en = EXCLUDED.name_en` or `DO NOTHING`.
 * Table names must come from `T.*`.
 */
export async function insertMany(ex: Executor, table: string, columns: string[], rows: unknown[][], onConflict = 'DO NOTHING', chunk = 200): Promise<number> {
  let n = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    const tuples = part.map((r) => {
      if (r.length !== columns.length) throw new Error(`insertMany ${table}: expected ${columns.length} values, got ${r.length}`);
      return `(${r.map((v) => {
        params.push(v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v) ? JSON.stringify(v) : v);
        return `$${params.length}`;
      }).join(',')})`;
    });
    const conflict = onConflict.startsWith('(') || onConflict.startsWith('ON CONSTRAINT') ? `ON CONFLICT ${onConflict}` : `ON CONFLICT ${onConflict}`;
    const res = await ex.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')} ${conflict}`, params);
    n += res.rowCount ?? 0;
  }
  return n;
}

/** `DO UPDATE SET a = EXCLUDED.a, …` for the given columns. */
export function updateSet(conflictTarget: string, columns: string[]): string {
  return `${conflictTarget} DO UPDATE SET ${columns.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}`;
}

/** Iraqi mobile in mock format ("+964 770 123 4567") → E.164. */
export const e164 = (m: string) => `+${m.replace(/\D/g, '')}`;

/** Deterministic PRNG (mulberry32) for demo activity. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min, pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)] as T };
}
