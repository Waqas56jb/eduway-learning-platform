/**
 * MODULE REGISTRY — every feature module is mounted here under /api/v1.
 * To add a module: create src/modules/<name>/{routes,controller,service,repository,schemas,types,index}.ts,
 * export `<name>Module` from its index.ts and append it below (see docs/PATTERNS.md).
 * Jobs belong to src/jobs (registered with `registerJob`), not here.
 */
import type { Router } from 'express';
import { adminsModule } from './admins/index.js';
import { authModule } from './auth/index.js';
import { healthModule } from './health/index.js';
import { publicModule } from './public/index.js';
import { rolesModule } from './roles/index.js';
import { securityModule } from './security/index.js';
import { settingsModule } from './settings/index.js';
import { storageModule } from './storage/index.js';
import { studentsModule } from './students/index.js';
import { usersModule } from './users/index.js';
import { contentModule } from './content/index.js'; // Agent B
import { questionsModule } from './questions/index.js'; // Agent B
import { quizzesModule } from './quizzes/index.js'; // Agent B
import { practiceModule } from './practice/index.js'; // Agent B
import { mistakesModule } from './mistakes/index.js'; // Agent B
import { examsModule } from './exams/index.js'; // Agent B
import { progressModule } from './progress/index.js'; // Agent B
import { searchModule } from './search/index.js'; // Agent B
import { aiTutorModule } from './ai-tutor/index.js'; // Agent D
import { notificationsModule } from './notifications/index.js'; // Agent D
import { packagesModule } from './packages/index.js'; // Agent C
import { promotionsModule } from './promotions/index.js'; // Agent C
import { subscriptionsModule } from './subscriptions/index.js'; // Agent C
import { paymentsModule } from './payments/index.js'; // Agent C
import { schoolsModule } from './schools/index.js'; // Agent C
import { incentivesModule } from './incentives/index.js'; // Agent C
import { settlementsModule } from './settlements/index.js'; // Agent C
import { marketersModule } from './marketers/index.js'; // Agent C
import { analyticsModule } from './analytics/index.js'; // Agent C
import { whatsappModule } from './whatsapp/index.js'; // linked WhatsApp number (Baileys)

export interface ModuleDefinition {
  /** Folder name, used in logs. */
  name: string;
  /** Express router; paths inside are relative to /api/v1. */
  router: Router;
}

export const modules: ModuleDefinition[] = [
  // ── Agent A (foundation) ──
  healthModule,
  publicModule,
  authModule,
  usersModule,
  studentsModule,
  adminsModule,
  rolesModule,
  securityModule,
  settingsModule,
  storageModule,
  // ── Agents B/C/D: append content, questions, quizzes, practice, mistakes, exams, packages, subscriptions,
  //    payments, schools, marketers, ai-tutor, progress, analytics, notifications, search … below ──
  // ── Agent B (learning) ──
  contentModule,
  questionsModule,
  quizzesModule,
  practiceModule,
  mistakesModule,
  examsModule,
  progressModule,
  searchModule,
  // ── Agent D (engagement) ──
  aiTutorModule,
  notificationsModule,
  // ── Agent C (commerce, partners, analytics) ──
  packagesModule,
  promotionsModule,
  subscriptionsModule,
  paymentsModule,
  schoolsModule,
  incentivesModule,
  settlementsModule,
  marketersModule,
  analyticsModule,
  // ── linked WhatsApp number (Settings → WhatsApp) ──
  whatsappModule,
];
