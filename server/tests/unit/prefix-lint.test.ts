import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import noUnprefixedSql from '../../eslint-rules/no-unprefixed-sql.mjs';
import { checkFromArgument, checkSqlDefinitions, checkSqlReferences, EXPR } from '../../tools/prefix-core.mjs';

describe('prefix-core', () => {
  it('flags unprefixed data access', () => {
    expect(checkSqlReferences('SELECT * FROM users WHERE id = $1')).toHaveLength(1);
    expect(checkSqlReferences('INSERT INTO lessons (id) VALUES ($1)')).toHaveLength(1);
    expect(checkSqlReferences('UPDATE profiles SET a = 1')).toHaveLength(1);
    expect(checkSqlReferences('SELECT 1 FROM eduway_platform_users u JOIN accounts a ON a.id = u.id')).toHaveLength(1);
    expect(checkSqlReferences('DELETE FROM sessions')).toHaveLength(1);
  });

  it('allows prefixed tables, template expressions, CTEs, functions and catalogs', () => {
    expect(checkSqlReferences('SELECT * FROM eduway_platform_users u JOIN eduway_platform_sessions s ON s.user_id = u.id')).toEqual([]);
    expect(checkSqlReferences(`SELECT * FROM ${EXPR} u JOIN ${EXPR} s ON true`)).toEqual([]);
    expect(checkSqlReferences('WITH recent AS (SELECT 1) SELECT * FROM recent')).toEqual([]);
    expect(checkSqlReferences('SELECT d FROM generate_series(1, 3) d')).toEqual([]);
    expect(checkSqlReferences('SELECT 1 FROM pg_extension e JOIN pg_namespace n ON true')).toEqual([]);
    expect(checkSqlReferences('INSERT INTO eduway_platform_x (a) VALUES (1) ON CONFLICT (a) DO UPDATE SET a = EXCLUDED.a')).toEqual([]);
    expect(checkSqlReferences('signed in from Dubai')).toEqual([]);
  });

  it('flags unprefixed DDL and forbidden statements', () => {
    expect(checkSqlDefinitions('CREATE TABLE IF NOT EXISTS users (id int)')).toHaveLength(1);
    expect(checkSqlDefinitions('CREATE INDEX idx_users ON eduway_platform_users (id)')).toHaveLength(1);
    expect(checkSqlDefinitions('CREATE TABLE eduway_platform_x (id int CONSTRAINT x_pkey PRIMARY KEY)')).toHaveLength(1);
    expect(checkSqlDefinitions('DROP SCHEMA public')).toHaveLength(1);
    expect(checkSqlDefinitions('CREATE EXTENSION vector')).toHaveLength(1);
    expect(checkSqlDefinitions('DROP TABLE users')).toHaveLength(1);
    expect(checkSqlDefinitions('CREATE TABLE IF NOT EXISTS eduway_platform_ok (id int CONSTRAINT eduway_platform_ok_pkey PRIMARY KEY)')).toEqual([]);
  });

  it('checks supabase .from() arguments', () => {
    expect(checkFromArgument('users')).toBeTruthy();
    expect(checkFromArgument('eduway_platform_users')).toBeNull();
    expect(checkFromArgument('eduway-platform-videos')).toBeNull();
    expect(checkFromArgument('avatars')).toBeTruthy();
  });
});

describe('eslint rule eduway/no-unprefixed-sql', () => {
  const linter = new Linter({ configType: 'flat' });
  const lint = (code: string) =>
    linter.verify(code, [{ plugins: { eduway: { rules: { 'no-unprefixed-sql': noUnprefixedSql } } }, rules: { 'eduway/no-unprefixed-sql': 'error' }, languageOptions: { ecmaVersion: 2023, sourceType: 'module' } }]);

  it('reports raw table names in strings and templates', () => {
    expect(lint("const q = 'SELECT * FROM users';")).toHaveLength(1);
    expect(lint('const q = `UPDATE lessons SET x = 1 WHERE id = ${id}`;')).toHaveLength(1);
    expect(lint("supabase.from('profiles').select('*');")).toHaveLength(1);
  });

  it('accepts T.<name> interpolation and prefixed literals', () => {
    expect(lint('const q = `SELECT * FROM ${T.users} u JOIN ${T.sessions} s ON s.user_id = u.id`;')).toHaveLength(0);
    expect(lint("const q = 'SELECT 1 FROM eduway_platform_users';")).toHaveLength(0);
    expect(lint("supabase.storage.from('eduway-platform-videos');")).toHaveLength(0);
  });
});
