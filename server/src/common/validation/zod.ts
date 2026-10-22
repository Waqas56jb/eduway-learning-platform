/**
 * Import `z` from HERE (not from 'zod') so `.openapi()` metadata is always available:
 *   import { z } from '../../common/validation/zod.js';
 */
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export { z };
export type { ZodTypeAny } from 'zod';
