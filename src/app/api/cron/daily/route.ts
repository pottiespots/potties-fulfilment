import { NextResponse } from 'next/server';
import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { notifyFoundry, notifyHQ } from '@/lib/notify';
import { acceptDeadline, timeLeftLabel } from '@/lib/rules';
import { shopifyConfigured, syncRecentOrders } from '@/lib/shopify';

// Runs every morning (vercel.json). Catches orders missed by webhooks and emails a summary of
// what's late, so nobody has to remember to look.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const now = new Date();
  let synced = null;
  if (shopifyConfigured()) {
    try { synced = await syncRecentOrders(14); } catch (e) { console.error('[cron sync]', e); }
  }
  const open = await db.select().from(schema.orders)
    .where(inArray(schema.orders.stage, ['SENT', 'ACCEPTED', 'MANUFACTURING', 'PACKING', 'PACKED']));
  const hours = Number(process.env.ACCEPT_WINDOW_HOURS || 24);
  const notAccepted = open.filter((o) => o.stage === 'SENT' && o.sentAt && acceptDeadline(o.sentAt, hours) < now);
  const late = open.filter((o) => o.shipBy < now);
  const dueSoon = open.filter((o) => o.shipBy >= now && o.shipBy.getTime() - now.getTime() < 48 * 36e5);
  const overdueInvoices = await db.select().from(schema.supplierInvoices).where(and(isNull(schema.supplierInvoices.paidAt), lt(schema.supplierInvoices.dueAt, now)));
  const newOrders = await db.select({ id: schema.orders.id }).from(schema.orders).where(eq(schema.orders.stage, 'NEW'));

  const line = (o: typeof open[number]) => `${o.name} ${o.customerName} (${o.city ?? ''}) - ${timeLeftLabel(o.shipBy, now)}`;
  if (late.length || notAccepted.length || dueSoon.length) {
    await notifyFoundry('Potties orders: today’s deadlines', [
      notAccepted.length ? `Waiting for you to accept:\n${notAccepted.map(line).join('\n')}` : '',
      late.length ? `LATE:\n${late.map(line).join('\n')}` : '',
      dueSoon.length ? `Ship in the next 2 days:\n${dueSoon.map(line).join('\n')}` : '',
    ].filter(Boolean).join('\n\n'));
  }
  await notifyHQ('Potties order desk: daily summary', [
    `${newOrders.length} new orders to send to the foundry`,
    `${notAccepted.length} not accepted after ${hours} h`,
    `${late.length} late, ${dueSoon.length} due in 2 days`,
    `${overdueInvoices.length} supplier invoices overdue`,
  ].join('\n'));
  return NextResponse.json({ ok: true, synced, late: late.length, notAccepted: notAccepted.length });
}
