/** npm run docs — writes docs/openapi.json from the zod schemas registered by every route. */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { closeDb } from '../src/config/db.js';
import { generateOpenApiDocument } from '../src/docs/openapi.js';

createApp(); // registers every module's routes
const doc = generateOpenApiDocument();
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/openapi.json');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(doc, null, 2));
console.log(`OpenAPI written to ${out} (${Object.keys(doc.paths ?? {}).length} paths)`);
void closeDb();
