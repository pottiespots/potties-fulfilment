import { redirect } from 'next/navigation';
import { noUsersYet } from './actions';
import { FirstAdminForm } from './form';

export const metadata = { title: 'Set up · Potties' };

export default async function Welcome() {
  if (!(await noUsersYet())) redirect('/login');
  return (
    <main className="login">
      <div className="login-card">
        <div className="brand">POTTIES<small>First-time setup</small></div>
        <p>Create the first Potties HQ login. After this, add the foundry and your team under Logins. This page closes once a login exists.</p>
        <FirstAdminForm />
      </div>
    </main>
  );
}
