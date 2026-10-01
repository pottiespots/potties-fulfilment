// Applies the SQL migrations in ./drizzle. Runs on every deploy: `npm run db:migrate`.
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

try { process.loadEnvFile('.env.local'); } catch {}
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set'); process.exit(1); }
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15_000 });
await client.connect();
await migrate(drizzle(client), { migrationsFolder: './drizzle' });
await client.end();
console.log('Database is up to date.');
