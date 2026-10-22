/**
 * zod validation of body / query / params. Parsed (coerced, defaulted, transformed) values replace the raw
 * ones so handlers always see typed data. Errors → 400 VALIDATION_ERROR with `details.fields`
 * (dotted paths without the body/query prefix, e.g. `options.2.text.ar`). A schema may use a reason key as
 * its issue message (e.g. 'PHONE_INVALID'); it is then surfaced as `details.reason` and localized.
 */
import type { NextFunction, Request, Response } from 'express';
import type { ZodError, ZodTypeAny } from 'zod';
import { ValidationError } from '../errors/index.js';
import { isKnownReason, type ErrorReason } from '../i18n/index.js';

export interface ValidateSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function zodIssues(err: ZodError): { path: string; message: string }[] {
  return err.issues.map((i) => ({ path: i.path.join('.') || '_', message: i.message }));
}

export function validationErrorFrom(issues: { path: string; message: string }[]): ValidationError {
  const coded = issues.find((i) => isKnownReason(i.message));
  return new ValidationError(issues, coded ? (coded.message as ErrorReason) : undefined);
}

export function validate(schemas: ValidateSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const issues: { path: string; message: string }[] = [];
    const parsed: Record<string, unknown> = {};
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const input = part === 'body' ? (req.body ?? {}) : req[part];
      const result = schema.safeParse(input);
      if (result.success) parsed[part] = result.data;
      else issues.push(...zodIssues(result.error));
    }
    if (issues.length) throw validationErrorFrom(issues);
    if ('body' in parsed) req.body = parsed.body;
    if ('params' in parsed) req.params = parsed.params as Request['params'];
    // Express 5 exposes req.query as a getter — shadow it with the parsed value.
    if ('query' in parsed) Object.defineProperty(req, 'query', { value: parsed.query, writable: true, configurable: true, enumerable: true });
    next();
  };
}
