import { asc } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { dayTime } from '@/lib/format';
import { Pill } from '@/components/ui';
import { ActButton, ActForm, Submit } from '@/components/client';
import { createUser, resetPassword, setUserActive } from '@/app/actions/hq';

export const metadata = { title: 'Logins · Potties' };

export default async function Users() {
  const me = await requireRole('HQ');
  const users = await db.select().from(schema.users).orderBy(asc(schema.users.role), asc(schema.users.name));
  return (
    <main className="page narrow">
      <div className="hello"><div><h2>Logins</h2><p>Foundry logins only ever see the foundry’s own orders. Potties HQ logins see everything.</p></div></div>
      <div className="tbl-wrap" style={{ marginBottom: 20 }}>
        <table style={{ minWidth: 640 }}>
          <thead><tr><th>Name</th><th>Access</th><th>Last signed in</th><th>Status</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><b>{u.name}</b><br /><span className="sub2">{u.email}</span></td>
                <td>{u.role === 'HQ' ? <Pill tone="info">Potties HQ</Pill> : <Pill>Foundry</Pill>}</td>
                <td className="sub2">{u.lastLoginAt ? dayTime(u.lastLoginAt) : 'Never'}</td>
                <td>{u.active ? <Pill tone="ok">Active</Pill> : <Pill tone="bad">Switched off</Pill>}</td>
                <td className="r">
                  <div className="btns" style={{ justifyContent: 'flex-end' }}>
                    {u.id !== me.id && <ActButton className="btn ghost sm" action={setUserActive.bind(null, u.id, !u.active)} confirm={u.active ? 'Switch off this login?' : undefined}>{u.active ? 'Switch off' : 'Switch on'}</ActButton>}
                  </div>
                  <details className="more" style={{ textAlign: 'left' }}>
                    <summary>New password</summary>
                    <ActForm action={resetPassword.bind(null, u.id)} resetOnOk>
                      <div className="btns" style={{ marginTop: 6 }}><input name="password" type="text" minLength={10} className="search" placeholder="At least 10 characters" aria-label="New password" autoComplete="off" /><Submit className="btn ghost sm">Set</Submit></div>
                    </ActForm>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="sec">
        <h4>Add a login</h4>
        <ActForm action={createUser} resetOnOk>
          <div className="grid2">
            <label className="field">Name<input name="name" required /></label>
            <label className="field">Email<input name="email" type="email" required /></label>
            <label className="field">Access<select name="role" defaultValue="FOUNDRY"><option value="FOUNDRY">Foundry (own orders only)</option><option value="HQ">Potties HQ (everything)</option></select></label>
            <label className="field">Starting password<input name="password" type="text" minLength={10} required autoComplete="off" /></label>
          </div>
          <p className="sub2">Send the email and password to the person directly. They can’t change it themselves yet; set a new one here if they forget it.</p>
          <div className="btns"><Submit>Create login</Submit></div>
        </ActForm>
      </section>
    </main>
  );
}
