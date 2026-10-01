import { desc } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { dayTime } from '@/lib/format';

/** One line showing when the daily COGS-sheet run last synced with the dashboard. */
export async function SyncStatus() {
  const [last] = await db.select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.createdAt)).limit(1);
  const sheet = process.env.COGS_SHEET_URL;
  if (!last) {
    return <p className="sub2" style={{ margin: '-8px 0 14px' }}>COGS sheet sync: not run yet. It runs with your daily COGS refresh.</p>;
  }
  const stale = Date.now() - last.createdAt.getTime() > 36 * 36e5;
  return (
    <p className="sub2" style={{ margin: '-8px 0 14px' }}>
      <span style={{ color: !last.ok || stale ? 'var(--bad)' : 'var(--ok)', fontWeight: 600 }}>●</span>{' '}
      COGS sheet synced {dayTime(last.createdAt)}{!last.ok && ' (with problems)'}{stale && ' · more than a day ago'} · {last.summary.slice(0, 160)}
      {sheet && <> · <a className="lnk" href={sheet} target="_blank" rel="noreferrer">Open sheet</a></>}
    </p>
  );
}
