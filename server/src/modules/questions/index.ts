import '../learning-core/index.js';
import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { bankService, bankWhere, bankFilterOf, BANK_FROM, type BankFilter } from './bank.service.js';
export { questionsAdminService } from './admin.service.js';
export { processQuestionImport } from './import.service.js';

export const questionsModule: ModuleDefinition = { name: 'questions', router };
