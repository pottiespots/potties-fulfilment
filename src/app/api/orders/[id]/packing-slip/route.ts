import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { getUser } from '@/lib/auth';
import { getOrder } from '@/lib/data';
import { db, schema } from '@/lib/db';
import { packingSlipPage, renderShopifyPackingSlip } from '@/lib/shopify-packing-slip';

// The order's packing slip in the store's Shopify packing slip layout. Opens as a printable page
// ("Print / Save as PDF"); ?pdf=1 downloads the PDF copy once the Google sync has made one.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUser();
  if (!u) return new NextResponse('Sign in first', { status: 401 });
  const { id } = await params;
  const o = await getOrder(id, u.role);
  if (!o) return new NextResponse('Not found', { status: 404 });
  const [pdf] = await db.select({ id: schema.orderFiles.id }).from(schema.orderFiles)
    .where(and(eq(schema.orderFiles.orderId, o.id), eq(schema.orderFiles.kind, 'PACKING_SLIP')))
    .orderBy(desc(schema.orderFiles.createdAt)).limit(1);
  if (new URL(req.url).searchParams.get('pdf') && pdf) return NextResponse.redirect(new URL(`/api/files/${pdf.id}`, req.url));
  const html = packingSlipPage(o.name, await renderShopifyPackingSlip(o), pdf ? `/api/files/${pdf.id}` : null);
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } });
}
