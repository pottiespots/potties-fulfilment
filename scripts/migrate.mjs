// Applies the SQL migrations in ./drizzle. Run on every deploy: `npm run db:migrate`.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

try { process.loadEnvFile('.env.local'); } catch {}
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set'); process.exit(1); }
const sql = postgres(url, { max: 1, prepare: false });
await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
await sql.end();
console.log('Database is up to date.');
