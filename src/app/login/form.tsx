'use client';
import { useActionState } from 'react';
import { login } from './actions';

export function LoginForm() {
  const [r, run, pending] = useActionState(login, null);
  return (
    <form action={run} className="stack">
      <label className="field">Email<input id="email" name="email" type="email" autoComplete="username" required /></label>
      <label className="field">Password<input id="password" name="password" type="password" autoComplete="current-password" required /></label>
      {r?.error && <div className="flash err" role="alert">{r.error}</div>}
      <button className="btn" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
