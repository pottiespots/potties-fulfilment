'use server';
import { redirect } from 'next/navigation';
import { verifyLogin, startSession, homeFor } from '@/lib/auth';

export async function login(_prev: { error?: string } | null, fd: FormData) {
  const email = String(fd.get('email') ?? '');
  const password = String(fd.get('password') ?? '');
  const u = await verifyLogin(email, password);
  if (!u) {
    await new Promise((r) => setTimeout(r, 600)); // slow down password guessing
    return { error: 'That email and password don’t match an active login.' };
  }
  await startSession(u);
  redirect(homeFor(u.role));
}
