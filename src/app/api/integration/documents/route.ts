import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { checkIntegrationToken } from '@/lib/integration';
import { logEvent } from '@/lib/data';

// POST /api/integration/documents — link documents that live in Google Drive (e.g. a courier
// waybill or artwork emailed in) to an order, so HQ and the foundry can open them from the order.
const Body = z.object({
  documents: z.array(z.object({
    orderName: z.string().min(1),
    kind: z.enum(['WAYBILL', 'ARTWORK', 'OTHER']),
    driveUrl: z.string().url(),
    filename: z.string().min(1).max(200),
  })).max(200),
});

export async function POST(req: Request) {
  const denied = checkIntegrationToken(req); if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request', details: parsed.error.issues.slice(0, 5) }, { status: 400 });
  const docs = parsed.data.documents.map((d) => ({ ...d, orderName: d.orderName.startsWith('#') ? d.orderName : `#${d.orderName}` }));
  const orders = docs.length ? await db.select({ id: schema.orders.id, name: schema.orders.name }).from(schema.orders).where(inArray(schema.orders.name, docs.map((d) => d.orderName))) : [];
  const out = { linked: 0, alreadyLinked: 0, unmatchedOrders: [] as string[] };
  for (const d of docs) {
    const o = orders.find((x) => x.name === d.orderName);
    if (!o) { out.unmatchedOrders.push(d.orderName); continue; }
    const dup = await db.select({ id: schema.orderFiles.id }).from(schema.orderFiles).where(and(eq(schema.orderFiles.orderId, o.id), eq(schema.orderFiles.driveUrl, d.driveUrl)));
    if (dup.length) { out.alreadyLinked++; continue; }
    await db.insert(schema.orderFiles).values({ orderId: o.id, kind: d.kind, storageKey: '', driveUrl: d.driveUrl, filename: d.filename, mime: /\.pdf$/i.test(d.filename) ? 'application/pdf' : 'application/octet-stream', size: 0 });
    await logEvent({ orderId: o.id, actor: 'Google Drive', text: `Document linked: ${d.filename}` });
    out.linked++;
  }
  return NextResponse.json(out);
}
