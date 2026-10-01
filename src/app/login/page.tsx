import { redirect } from 'next/navigation';
import { getUser, homeFor } from '@/lib/auth';
import { LoginForm } from './form';

export default async function LoginPage() {
  const u = await getUser();
  if (u) redirect(homeFor(u.role));
  return (
    <main className="login">
      <div className="login-card">
        <div className="brand">POTTIES<small>Order Desk</small></div>
        <p>Sign in with the email and password Potties gave you.</p>
        <LoginForm />
        <p style={{ fontSize: 12 }}>Forgot your password? Ask Potties HQ to reset it.</p>
      </div>
    </main>
  );
}
