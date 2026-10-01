import { NextResponse } from 'next/server';
import { checkIntegrationToken } from '@/lib/integration';
import { getOrder } from '@/lib/data';
import { renderShopifyPackingSlip } from '@/lib/shopify-packing-slip';

// GET /api/integration/orders/<id>/packing-slip — the Shopify-layout packing slip as plain HTML,
// for the Google sync to turn into a PDF in Drive.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = checkIntegrationToken(req); if (denied) return denied;
  const { id } = await params;
  const o = await getOrder(id, 'HQ');
  if (!o) return new NextResponse('Not found', { status: 404 });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Packing slip ${o.name}</title></head><body>${await renderShopifyPackingSlip(o)}</body></html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
