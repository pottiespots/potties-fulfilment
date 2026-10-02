import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

// Open /api/health in a browser to see if the app can reach its database.
// Shows only yes/no answers and timings, never passwords or keys.
export const dynamic = 'force-dynamic';

function explain(err: unknown): string {
  // The database library wraps the real error; look at the underlying cause.
  const e = ((err as { cause?: unknown })?.cause ?? err) as { message?: string; code?: string };
  const m = String(e?.message ?? e);
  const code = e?.code ?? '';
  if (/password authentication failed/i.test(m)) return 'Wrong database password in DATABASE_URL (remember @ must be written as %40).';
  if (/Tenant or user not found/i.test(m)) return 'DATABASE_URL user/project is wrong. Copy the Transaction pooler string again from Supabase > Connect.';
  if (code === 'CONNECT_TIMEOUT' || /timeout/i.test(m)) return 'Could not reach the database within 10 seconds. Check DATABASE_URL uses the Transaction pooler (port 6543).';
  if (code === 'ECONNREFUSED') return 'The database refused the connection. Check the port in DATABASE_URL is 6543.';
  if (/ENOTFOUND|getaddrinfo/i.test(m)) return 'Database address not found. Check the host part of DATABASE_URL.';
  if (/relation .* does not exist/i.test(m)) return 'Database is reachable but the tables are missing. Trigger a new deploy so the setup step runs.';
  return 'Database error: ' + m.replace(/postgres(ql)?:\/\/[^\s]+/g, '[hidden]').slice(0, 160);
}

export async function GET() {
  const out: Record<string, unknown> = {
    version: process.env.APP_VERSION,
    builtAt: process.env.APP_BUILT_AT,
    serverRegion: process.env.AWS_REGION ?? 'unknown',
    databaseSettingPresent: Boolean(process.env.DATABASE_URL),
    databaseIsPooler: /pooler\.supabase\.com:6543/.test(process.env.DATABASE_URL ?? ''),
    databaseRegion: (process.env.DATABASE_URL ?? '').match(/aws-\d-([a-z]+-[a-z]+-\d)/)?.[1] ?? 'unknown',
    storageSettingPresent: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    shopifySettingPresent: Boolean(process.env.SHOPIFY_STORE_DOMAIN),
  };
  const t0 = Date.now();
  try {
    await db.execute(sql`select 1`);
    out.databaseConnect = `ok in ${Date.now() - t0} ms`;
    const t1 = Date.now();
    await db.execute(sql`select count(*) from users`);
    out.databaseQuery = `ok in ${Date.now() - t1} ms`;
  } catch (e) {
    out.databaseConnect = 'FAILED after ' + (Date.now() - t0) + ' ms';
    out.problem = explain(e);
  }
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
