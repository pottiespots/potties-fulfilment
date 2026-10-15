import { NextResponse } from 'next/server';
import { checkIntegrationToken } from '@/lib/integration';
import { removeInvoices } from '@/lib/invoices';

// DELETE /api/integration/invoices/INV-0004600 — removes one invoice that is no longer on the COGS sheet.
// Add ?force=1 to also remove an invoice that has a proof of payment.
export async function DELETE(req: Request, { params }: { params: Promise<{ number: string }> }) {
  const denied = checkIntegrationToken(req); if (denied) return denied;
  const { number } = await params;
  const force = new URL(req.url).searchParams.get('force') === '1';
  const r = await removeInvoices([decodeURIComponent(number)], 'COGS sheet', { force, reason: 'no longer on the COGS sheet (8. Invoices)' });
  return NextResponse.json(r, { status: r.notFound.length ? 404 : 200 });
}
