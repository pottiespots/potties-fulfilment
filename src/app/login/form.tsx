'use client';
import { useActForm } from '@/components/client';
import { login } from './actions';

export function LoginForm() {
  const { r, pending, onSubmit } = useActForm(login);
  return (
    <form onSubmit={onSubmit} className="stack">
      <label className="field">Email<input id="email" name="email" type="email" autoComplete="username" required /></label>
      <label className="field">Password<input id="password" name="password" type="password" autoComplete="current-password" required /></label>
      {r?.error && <div className="flash err" role="alert">{r.error}</div>}
      <button className="btn" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
