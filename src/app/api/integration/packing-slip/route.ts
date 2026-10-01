import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { checkIntegrationToken } from '@/lib/integration';
import { logEvent } from '@/lib/data';
import { putFile, storageKey, MAX_UPLOAD_BYTES } from '@/lib/storage';

// POST /api/integration/packing-slip — the Google sync uploads the PDF it made of an order's packing
// slip, so the foundry can download it from the dashboard. Replaces any earlier PDF for that order.
const Body = z.object({ orderName: z.string().min(1), pdfBase64: z.string().min(10), driveUrl: z.string().url().optional().nullable() });

export async function POST(req: Request) {
  const denied = checkIntegrationToken(req); if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const name = parsed.data.orderName.startsWith('#') ? parsed.data.orderName : `#${parsed.data.orderName}`;
  const [o] = await db.select({ id: schema.orders.id }).from(schema.orders).where(eq(schema.orders.name, name));
  if (!o) return NextResponse.json({ error: `Order ${name} not found` }, { status: 404 });
  const data = Buffer.from(parsed.data.pdfBase64, 'base64');
  if (data.length > MAX_UPLOAD_BYTES || data.subarray(0, 4).toString() !== '%PDF') return NextResponse.json({ error: 'Not a PDF or too large' }, { status: 400 });
  const filename = `Packing slip ${name}.pdf`;
  const key = storageKey(`orders/${o.id}`, filename);
  await putFile(key, data, 'application/pdf');
  await db.delete(schema.orderFiles).where(and(eq(schema.orderFiles.orderId, o.id), eq(schema.orderFiles.kind, 'PACKING_SLIP')));
  await db.insert(schema.orderFiles).values({ orderId: o.id, kind: 'PACKING_SLIP', storageKey: key, filename, mime: 'application/pdf', size: data.length, driveUrl: null });
  await logEvent({ orderId: o.id, actor: 'Google Drive', text: 'Shopify packing slip PDF saved to Drive and the order', internal: true });
  return NextResponse.json({ ok: true });
}
