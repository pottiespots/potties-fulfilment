import { desc, sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { syncRuns } from '@/lib/db/schema';
import { gql, shopifyConfigured } from '@/lib/shopify';
import { Pill } from '@/components/ui';
import { ActForm, Submit } from '@/components/client';
import { savePackingSlipTemplate } from '@/app/actions/hq';
import { getPackingSlipTemplate } from '@/lib/shopify-packing-slip';
import { orders as ordersTable } from '@/lib/db/schema';

export const metadata = { title: 'Connections · Potties' };

type Check = { name: string; ok: boolean | null; detail: string; fix?: string };

export default async function Setup() {
  await requireRole('HQ');
  const checks: Check[] = [];
  try { await db.execute(sql`select 1`); checks.push({ name: 'Database', ok: true, detail: 'Connected' }); }
  catch (e) { checks.push({ name: 'Database', ok: false, detail: (e as Error).message }); }

  if (shopifyConfigured()) {
    try {
      const d = await gql<{ shop: { name: string; myshopifyDomain: string } }>('{ shop { name myshopifyDomain } }');
      checks.push({ name: 'Shopify', ok: true, detail: `Connected to ${d.shop.name} (${d.shop.myshopifyDomain})` });
    } catch (e) {
      checks.push({ name: 'Shopify', ok: false, detail: (e as Error).message, fix: 'Check SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET, and that the app is installed on your store.' });
    }
  } else checks.push({ name: 'Shopify', ok: false, detail: 'Not connected yet', fix: 'Add SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in your hosting settings.' });

  checks.push(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? { name: 'File storage', ok: true, detail: `Supabase bucket “${process.env.SUPABASE_BUCKET || 'fulfilment'}”` }
    : { name: 'File storage', ok: !(process.env.VERCEL || process.env.NETLIFY) ? null : false, detail: (process.env.VERCEL || process.env.NETLIFY) ? 'Not set: photos and invoices can’t be uploaded' : 'Local disk (development only)', fix: 'Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
  checks.push(process.env.RESEND_API_KEY
    ? { name: 'Email', ok: true, detail: `Foundry: ${process.env.FOUNDRY_NOTIFY_EMAIL || 'not set'} · HQ: ${process.env.HQ_NOTIFY_EMAIL || 'not set'} · LL: ${process.env.LL_ORDER_EMAIL || 'not set'}` }
    : { name: 'Email', ok: null, detail: 'Off. Reminders are only written in the order history.', fix: 'Optional: add RESEND_API_KEY and the notify emails.' });
  checks.push(process.env.CRON_SECRET
    ? { name: 'Daily reminders', ok: true, detail: 'Runs at 07:00 Mon–Sat (also keeps the free Supabase project awake)' }
    : { name: 'Daily reminders', ok: false, detail: 'CRON_SECRET not set, so the morning job is switched off', fix: 'Add CRON_SECRET (any long random text) in your hosting settings.' });
  const [lastRun] = await db.select().from(syncRuns).orderBy(desc(syncRuns.createdAt)).limit(1);
  checks.push((process.env.INTEGRATION_TOKEN ?? '').length >= 32
    ? (lastRun
        ? { name: 'COGS sheet sync', ok: lastRun.ok && Date.now() - lastRun.createdAt.getTime() < 36 * 36e5, detail: `Last run ${lastRun.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC: ${lastRun.summary.slice(0, 200)}`, fix: 'Check the Potties sync script at script.google.com (Executions).' }
        : { name: 'COGS sheet sync', ok: null, detail: 'Connection key is set. Waiting for the first run of the Google sync script.' })
    : { name: 'COGS sheet sync', ok: false, detail: 'INTEGRATION_TOKEN not set', fix: 'Add INTEGRATION_TOKEN (40+ random characters) in your hosting settings and in the daily routine.' });
  checks.push({ name: 'Proof approval before tracking', ok: null, detail: process.env.REQUIRE_HQ_PROOF_APPROVAL === 'true' ? 'Required' : 'Not required (HQ approval is a reminder only)' });

  const slip = await getPackingSlipTemplate();
  const [latest] = await db.select({ id: ordersTable.id, name: ordersTable.name }).from(ordersTable).orderBy(desc(ordersTable.placedAt)).limit(1);
  return (
    <main className="page narrow">
      <div className="hello"><div><h2>Connections</h2><p>Use this after going live to check everything is plugged in.</p></div></div>
      <div className="tbl-wrap">
        <table style={{ minWidth: 560 }}>
          <tbody>
            {checks.map((c) => (
              <tr key={c.name}>
                <td style={{ width: 170 }}><b>{c.name}</b></td>
                <td>{c.ok === true ? <Pill tone="ok">Working</Pill> : c.ok === false ? <Pill tone="bad">Needs attention</Pill> : <Pill>Info</Pill>}</td>
                <td>{c.detail}{c.fix && c.ok !== true && <><br /><span className="sub2">{c.fix}</span></>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="sec" style={{ marginTop: 20 }} id="packing-slip">
        <h4>Packing slip template {slip.custom ? <Pill tone="ok">Your Shopify template</Pill> : <Pill>Shopify standard</Pill>}</h4>
        <p className="kv" style={{ marginTop: 0 }}>
          Packing slips use the same layout as Shopify. If you changed yours in Shopify, copy it here so they match exactly:
          Shopify admin → <b>Settings → Shipping and delivery → Packing slips → Edit</b>, select all the code, copy, paste below and save.
          Leave empty to use Shopify’s standard packing slip.
          {latest && <> <a className="lnk" href={`/api/orders/${latest.id}/packing-slip`} target="_blank" rel="noreferrer">Preview with {latest.name}</a></>}
        </p>
        <ActForm action={savePackingSlipTemplate}>
          <label className="field"><span className="sub2">Template code (Liquid)</span>
            <textarea name="template" rows={10} defaultValue={slip.custom ? slip.template : ''} placeholder="Paste your Shopify packing slip template here, or leave empty for the standard one" style={{ fontFamily: 'var(--mono)', fontSize: 12 }} />
          </label>
          <div className="btns" style={{ marginTop: 8 }}><Submit>Save template</Submit></div>
        </ActForm>
      </section>
    </main>
  );
}
