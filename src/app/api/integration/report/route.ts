import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { checkIntegrationToken } from '@/lib/integration';

// POST /api/integration/report — the routine records how its run went; shown on Today and Connections.
const Body = z.object({ source: z.string().min(1).max(60).default('cogs-routine'), ok: z.boolean(), summary: z.string().min(1).max(2000) });

export async function POST(req: Request) {
  const denied = checkIntegrationToken(req); if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  await db.insert(schema.syncRuns).values(parsed.data);
  return NextResponse.json({ ok: true });
}
