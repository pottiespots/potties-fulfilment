import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { getFile } from '@/lib/storage';
import { visibleToFoundry } from '@/lib/rules';

// Files are never public: every download checks the login and what that role may see.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUser();
  if (!u) return new NextResponse('Sign in first', { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Not found', { status: 404 });
  const [f] = await db.select().from(schema.orderFiles).where(eq(schema.orderFiles.id, id));
  if (!f) return new NextResponse('Not found', { status: 404 });
  if (u.role === 'FOUNDRY') {
    if (f.kind === 'INVOICE' || f.kind === 'POP' || !f.orderId) return new NextResponse('Not found', { status: 404 });
    const [o] = await db.select({ stage: schema.orders.stage }).from(schema.orders).where(eq(schema.orders.id, f.orderId));
    if (!o || !visibleToFoundry(o.stage)) return new NextResponse('Not found', { status: 404 });
  }
  const r = await getFile(f.storageKey);
  if ('url' in r) return NextResponse.redirect(r.url);
  return new NextResponse(new Uint8Array(r.data), {
    headers: {
      'Content-Type': f.mime,
      'Content-Disposition': `inline; filename="${f.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
