'use server';
import crypto from 'node:crypto';
import { redirect } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { hashPassword, startSession } from '@/lib/auth';

export async function noUsersYet() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users);
  return n === 0;
}

/** Creates the very first HQ login. Only works while there are no logins and with the SETUP_CODE. */
export async function createFirstAdmin(_p: { error?: string } | null, fd: FormData) {
  if (!(await noUsersYet())) return { error: 'Setup is already done. Sign in instead.' };
  const code = process.env.SETUP_CODE ?? '';
  const given = String(fd.get('code') ?? '');
  const same = code.length >= 8 && given.length === code.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(code));
  if (!same) return { error: 'That setup code is wrong. It is the SETUP_CODE value you added in Vercel.' };
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const name = String(fd.get('name') ?? '').trim();
  const password = String(fd.get('password') ?? '');
  if (!/^\S+@\S+\.\S+$/.test(email) || !name) return { error: 'Enter your name and email.' };
  if (password.length < 10) return { error: 'Password must be at least 10 characters.' };
  const [u] = await db.insert(schema.users).values({ email, name, role: 'HQ', passwordHash: await hashPassword(password) }).returning();
  await startSession(u);
  redirect('/hq');
}
