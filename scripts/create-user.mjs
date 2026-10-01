// Create the first login (after that, add logins on the Logins page).
// npm run user:create -- --email you@potties.co.za --name "Your Name" --role HQ --password "a-long-password"
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string', default: 'HQ' }, password: { type: 'string' } } });
if (!a.email || !a.name || !a.password || a.password.length < 10 || !['HQ', 'FOUNDRY'].includes(a.role)) {
  console.error('Usage: --email --name --role HQ|FOUNDRY --password (10+ characters)'); process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const hash = await bcrypt.hash(a.password, 11);
await sql`insert into users (email, name, role, password_hash) values (${a.email.toLowerCase()}, ${a.name}, ${a.role}, ${hash})
  on conflict (email) do update set name = excluded.name, role = excluded.role, password_hash = excluded.password_hash, active = true`;
await sql.end();
console.log(`Login ready for ${a.email} (${a.role}).`);
