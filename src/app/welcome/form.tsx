'use client';
import { useActForm } from '@/components/client';
import { createFirstAdmin } from './actions';

export function FirstAdminForm() {
  const { r, pending, onSubmit } = useActForm(createFirstAdmin);
  return (
    <form onSubmit={onSubmit} className="stack">
      <label className="field">Setup code<input name="code" type="password" required autoComplete="off" /></label>
      <label className="field">Your name<input name="name" required /></label>
      <label className="field">Email<input name="email" type="email" required autoComplete="username" /></label>
      <label className="field">Password (10+ characters)<input name="password" type="password" minLength={10} required autoComplete="new-password" /></label>
      {r?.error && <div className="flash err" role="alert">{r.error}</div>}
      <button className="btn" disabled={pending}>{pending ? 'Creating…' : 'Create Potties HQ login'}</button>
    </form>
  );
}
