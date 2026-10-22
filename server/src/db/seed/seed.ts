/**
 * Seed orchestrator — idempotent (deterministic ids + ON CONFLICT). Each section runs in its own transaction.
 * Order: reference → partners → catalog → promotions → admin demo population → demo student.
 */
import type pg from 'pg';
import { T } from '../../config/constants.js';
import { tx } from '../../config/db.js';
import { seedCatalog, seedPromotions } from './catalog.js';
import { seedCommerce } from './commerce.js';
import { seedDemoStudent } from './demo.js';
import { seedEngagement } from './engagement.js';
import { loadJson } from './helpers.js';
import { seedPartners } from './partners.js';
import { seedAchievements, seedAdmins, seedCms, seedGovernorates, seedLegal, seedRbac, seedSettings, seedTemplates } from './reference.js';
import { seedStudents } from './students.js';
import type { AdminMock } from './types.js';

export interface SeedOptions {
  superAdminEmail: string;
  superAdminPassword?: string;
  /** Skip the 120-student admin demo population (e.g. production). */
  skipDemoPopulation?: boolean;
  log?: (msg: string) => void;
}

export interface SeedResult {
  generatedSuperAdminPassword: string | null;
  superAdminId: string;
}

export async function runSeed(_pool: pg.Pool, opts: SeedOptions): Promise<SeedResult> {
  const log = opts.log ?? (() => undefined);
  const mock = loadJson<AdminMock>('admin-mock.json');
  const step = async <R>(name: string, fn: (c: pg.PoolClient) => Promise<R>): Promise<R> => {
    const t0 = Date.now();
    const r = await tx(fn);
    log(`  ✓ ${name} (${Date.now() - t0} ms)`);
    return r;
  };

  await step('governorates', seedGovernorates);
  await step('roles & permissions', seedRbac);
  const admins = await step('admin users', (c) => seedAdmins(c, mock, opts.superAdminEmail, opts.superAdminPassword));
  await step('settings, app settings, feature flags, AI settings', (c) => seedSettings(c, mock));
  await step('legal documents', (c) => seedLegal(c, mock, admins.superAdminId));
  await step('CMS testimonials & FAQ', seedCms);
  await step('notification templates', (c) => seedTemplates(c, mock));
  await step('achievements', seedAchievements);
  await step('schools, marketers, incentive & milestone rules', (c) => seedPartners(c, mock, admins.superAdminId));
  const catalog = await step('subjects, lessons, videos, questions, quiz rules, exams, packages', (c) => seedCatalog(c, mock));
  await step('promotions', (c) => seedPromotions(c, mock));

  if (!opts.skipDemoPopulation) {
    await step('admin demo population (students, payments, settlements, audit, alerts…)', async (c) => {
      const rows = await c.query<{ id: string; name_en: string; email: string }>(`SELECT id, name_en, email FROM ${T.users} WHERE kind = 'admin'`);
      const byName = new Map(rows.rows.map((r) => [r.name_en, r.id]));
      const byMock = new Map<string, string>();
      for (const a of mock.adminUsers) {
        const email = a.id === 'adm_1' ? opts.superAdminEmail.toLowerCase() : a.email.toLowerCase();
        const row = rows.rows.find((r) => r.email === email);
        if (row) byMock.set(a.id, row.id);
      }
      await seedStudents(c, mock, byName, byMock);
    });
  }
  await step('demo student Ahmed Al-Baghdadi (+9647701234567)', (c) => seedDemoStudent(c, catalog));
  await step('engagement: AI prompts/models, feature flags, push token, campaign deliveries', seedEngagement);
  await step('commerce: reconciliation figures, milestone awards (Agent C)', seedCommerce);
  return { generatedSuperAdminPassword: admins.generatedPassword, superAdminId: admins.superAdminId };
}
