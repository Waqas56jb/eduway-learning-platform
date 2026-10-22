import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { studentsService, toTransactionRow, toRows as toAdminStudentRows } from './service.js';
export { supportService } from './support.js';
export { STUDENT_SELECT, buildStudentWhere } from './repository.js';
export type { AdminStudentRow, AdminStudentDetail, TransactionRow, SupportTicketDto, NoteDto } from './types.js';

export const studentsModule: ModuleDefinition = { name: 'students', router };
