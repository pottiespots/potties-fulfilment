import 'server-only';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');

// node-postgres sends one query per connection and waits for the reply. (postgres.js pipelines
// queries, which hangs behind Supabase's transaction pooler on port 6543.)
const g = globalThis as unknown as { __pottiesPool?: Pool };
const pool = g.__pottiesPool ?? new Pool({
  connectionString: url,
  max: 4,
  connectionTimeoutMillis: 10_000, // fail with a clear error instead of hanging the page
  idleTimeoutMillis: 20_000,
});
g.__pottiesPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
