export interface PrefixViolation {
  index: number;
  line: number;
  message: string;
}
export const PREFIX: string;
export const BUCKET_PREFIX: string;
export const EXPR: string;
export const MAX_IDENT: number;
export function checkSqlReferences(text: string, opts?: { allowSystemReads?: boolean }): PrefixViolation[];
export function checkSqlDefinitions(text: string): PrefixViolation[];
export function checkFromArgument(value: string): string | null;
export function stripSqlComments(sql: string): string;
