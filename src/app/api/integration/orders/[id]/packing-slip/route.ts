import { NextResponse } from 'next/server';
import { checkIntegrationToken } from '@/lib/integration';
import { getOrder } from '@/lib/data';
import { packingSlipPdf } from '@/lib/packing-slip';

// GET /api/integration/orders/<id>/packing-slip — the packing slip PDF, for archiving in Drive.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = checkIntegrationToken(req); if (denied) return denied;
  const { id } = await params;
  const o = await getOrder(id, 'HQ');
  if (!o) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(await packingSlipPdf(o)), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="packing-slip-${o.name.replace(/[^\w-]/g, '')}.pdf"` },
  });
}
