// Netlify scheduled function: every Mon–Sat at 05:00 UTC (07:00 in South Africa) it calls the
// app's daily job, which syncs Shopify and emails today's deadlines.
export default async () => {
  const base = process.env.APP_URL || process.env.URL;
  const res = await fetch(`${base}/api/cron/daily`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  console.log('daily job', res.status, await res.text());
  return new Response('ok');
};

export const config = { schedule: '0 5 * * 1-6' };
