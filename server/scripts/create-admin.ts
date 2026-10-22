/**
 * npm run create-admin -- --email someone@eduway.iq --name "Full Name" [--role super_admin] [--password '…']
 * Creates (or re-activates + resets the password of) an admin. Without --password a strong one is generated and printed once.
 */
import { closeDb } from '../src/config/db.js';
import { generateStrongPassword, isStrongPassword } from '../src/common/utils/crypto.js';
import { adminsService } from '../src/modules/admins/service.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg('email');
  const name = arg('name') ?? email?.split('@')[0] ?? '';
  const role = arg('role') ?? 'super_admin';
  if (!email) throw new Error('usage: npm run create-admin -- --email you@eduway.iq --name "Your Name" [--role super_admin] [--password …]');
  const given = arg('password');
  if (given && !isStrongPassword(given)) throw new Error('password must be ≥10 chars with upper, lower, digit and symbol');
  const password = given ?? generateStrongPassword();
  const id = await adminsService.createActive({ name: { en: name, ar: name }, email, password, roleKey: role });
  console.log(`Admin ready: ${email} (role ${role}, id ${id})`);
  if (!given) console.log(`Generated password (shown once): ${password}`);
}

main()
  .catch((err: Error) => {
    console.error(`create-admin failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
