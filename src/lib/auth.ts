import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { db, schema } from './db';
import type { Role, User } from './db/schema';

export const SESSION_COOKIE = 'pf_session';
const MAX_AGE = 30 * 24 * 3600; // 30 days

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set to at least 32 characters.');
  return new TextEncoder().encode(s);
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 11);
}

export async function verifyLogin(email: string, password: string): Promise<User | null> {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email.trim().toLowerCase()));
  // Compare against a dummy hash when the user doesn't exist so timing doesn't reveal valid emails.
  const ok = await bcrypt.compare(password, u?.passwordHash ?? '$2a$11$0000000000000000000000000000000000000000000000000000.');
  if (!u || !ok || !u.active) return null;
  return u;
}

export async function startSession(user: User) {
  const token = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: MAX_AGE,
  });
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Reads the cookie and re-loads the user, so deactivated users and role changes take effect immediately. */
export const getUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (!payload.sub) return null;
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, payload.sub));
    return u && u.active ? u : null;
  } catch {
    return null;
  }
});

/** Use at the top of every page and server action. Wrong role is sent to their own home page. */
export async function requireRole(role: Role): Promise<User> {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.role !== role) redirect(homeFor(u.role));
  return u;
}

export const homeFor = (role: Role) => (role === 'HQ' ? '/hq' : '/f');

export function actorLabel(u: User) {
  return `${u.role === 'HQ' ? 'Potties HQ' : 'Foundry'} · ${u.name}`;
}
