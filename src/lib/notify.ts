import 'server-only';

// Email via Resend's HTTP API. If RESEND_API_KEY isn't set, emails are skipped (logged only),
// so the app works without email during setup.
export async function sendEmail(to: string | undefined | null, subject: string, text: string) {
  if (!to) return { sent: false, reason: 'no recipient' };
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[email skipped] to=${to} subject=${subject}`);
    return { sent: false, reason: 'email not configured' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || 'Potties Orders <onboarding@resend.dev>', to: to.split(',').map((s) => s.trim()), subject, text }),
    });
    if (!res.ok) console.error('[email failed]', res.status, await res.text());
    return { sent: res.ok };
  } catch (e) {
    console.error('[email failed]', e);
    return { sent: false };
  }
}

const app = () => process.env.APP_URL || 'http://localhost:3000';

export const notifyFoundry = (subject: string, body: string, path = '/f') =>
  sendEmail(process.env.FOUNDRY_NOTIFY_EMAIL, subject, `${body}\n\nOpen the order desk: ${app()}${path}`);

export const notifyHQ = (subject: string, body: string, path = '/hq') =>
  sendEmail(process.env.HQ_NOTIFY_EMAIL, subject, `${body}\n\nOpen the order desk: ${app()}${path}`);
