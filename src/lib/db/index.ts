import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');

// Reuse one connection pool across hot reloads in development.
const g = globalThis as unknown as { __pottiesSql?: ReturnType<typeof postgres> };
// prepare:false keeps us compatible with Supabase's transaction pooler (port 6543).
// connect_timeout: fail with a clear error after 10 s instead of hanging the page.
const sql = g.__pottiesSql ?? postgres(url, { max: 5, prepare: false, connect_timeout: 10, idle_timeout: 20 });
if (process.env.NODE_ENV !== 'production') g.__pottiesSql = sql;

export const db = drizzle(sql, { schema });
export { schema };
