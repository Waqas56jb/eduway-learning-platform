/**
 * ESLint rule `eduway/no-unprefixed-sql` — shared-database prefix policy.
 * Flags, inside string and template literals:
 *   - FROM / JOIN / INSERT INTO / UPDATE / DELETE FROM / ALTER TABLE / REFERENCES followed by a name that does
 *     not start with `eduway_platform_` (template expressions such as `${T.users}` are allowed);
 *   - DDL creating unprefixed objects;
 *   - supabase-js `.from('x')` with an unprefixed table / bucket literal.
 */
import { checkFromArgument, checkSqlDefinitions, checkSqlReferences, EXPR } from '../tools/prefix-core.mjs';

const SQL_HINT = /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|FROM|JOIN|TRUNCATE)\b/;

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Require eduway_platform_ prefix for every database object referenced in SQL strings' },
    schema: [],
    messages: { violation: '{{message}}' },
  },
  create(context) {
    function report(node, message) {
      context.report({ node, messageId: 'violation', data: { message } });
    }
    function checkText(node, text) {
      if (!SQL_HINT.test(text)) return;
      for (const v of [...checkSqlReferences(text), ...checkSqlDefinitions(text)]) report(node, v.message);
    }
    return {
      Literal(node) {
        if (typeof node.value === 'string') checkText(node, node.value);
      },
      TemplateLiteral(node) {
        const text = node.quasis.map((q) => q.value.cooked ?? q.value.raw).join(EXPR);
        checkText(node, text);
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier' || callee.property.name !== 'from') return;
        const arg = node.arguments[0];
        if (arg && arg.type === 'Literal' && typeof arg.value === 'string') {
          const msg = checkFromArgument(arg.value);
          if (msg) report(arg, msg);
        }
      },
    };
  },
};
