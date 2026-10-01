import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { getOrder } from '@/lib/data';
import { packingSlipPdf } from '@/lib/packing-slip';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUser();
  if (!u) return new NextResponse('Sign in first', { status: 401 });
  const { id } = await params;
  const o = await getOrder(id, u.role);
  if (!o) return new NextResponse('Not found', { status: 404 });
  const pdf = await packingSlipPdf(o);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="packing-slip-${o.name.replace(/[^\w-]/g, '')}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
