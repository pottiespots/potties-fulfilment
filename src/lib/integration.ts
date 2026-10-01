import 'server-only';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

// The daily COGS routine (and any other trusted automation) calls /api/integration/* with
//   Authorization: Bearer <INTEGRATION_TOKEN>
// It is a separate key from user logins so it can be changed without affecting anyone.
export function checkIntegrationToken(req: Request): NextResponse | null {
  const expected = process.env.INTEGRATION_TOKEN ?? '';
  if (expected.length < 32) return NextResponse.json({ error: 'INTEGRATION_TOKEN is not set (32+ characters) in the hosting settings.' }, { status: 503 });
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const ok = given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  return ok ? null : NextResponse.json({ error: 'Wrong or missing integration token.' }, { status: 401 });
}

export const appUrl = () => (process.env.APP_URL || process.env.URL || 'http://localhost:3000').replace(/\/$/, '');

/** Maps a supplier name from the COGS sheet to the dashboard's supplier types. */
export function mapSupplier(name: string): { supplier: 'FOUNDRY' | 'LL' | 'OTHER'; label: string | null } {
  const n = name.trim();
  if (/foundry|fonder|cast/i.test(n)) return { supplier: 'FOUNDRY', label: null };
  if (/^ll\b|ll manufacturing|leather/i.test(n)) return { supplier: 'LL', label: null };
  return { supplier: 'OTHER', label: n || 'Other' };
}

/** Rands (number or "R 1 234,56" text) to cents. */
export function toCents(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Math.round(v * 100);
  const s = String(v).replace(/[R\s ]/g, '').replace(/,(\d{2})$/, '.$1').replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** YYYY-MM-DD (taken as SA midday) or full ISO date to Date. */
export function toDate(v: unknown): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00+02:00`) : new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
