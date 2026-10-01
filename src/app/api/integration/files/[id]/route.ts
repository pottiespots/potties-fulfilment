import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { checkIntegrationToken } from '@/lib/integration';
import { getFile } from '@/lib/storage';

// GET /api/integration/files/<id> — download a dashboard file so the routine can save it to Drive.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = checkIntegrationToken(req); if (denied) return denied;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Not found', { status: 404 });
  const [f] = await db.select().from(schema.orderFiles).where(eq(schema.orderFiles.id, id));
  if (!f) return new NextResponse('Not found', { status: 404 });
  if (f.driveUrl) return NextResponse.redirect(f.driveUrl);
  const r = await getFile(f.storageKey);
  if ('url' in r) return NextResponse.redirect(r.url);
  return new NextResponse(new Uint8Array(r.data), { headers: { 'Content-Type': f.mime, 'Content-Disposition': `attachment; filename="${f.filename.replace(/"/g, '')}"` } });
}
