import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { listOrders } from '@/lib/data';
import { FOUNDRY_LABEL, isOpen, timeLeftLabel, urgency } from '@/lib/rules';
import { Gantt, PickupAgenda } from '@/components/ui';

export const metadata = { title: 'Deadlines · Potties' };

export default async function FoundryDeadlines() {
  await requireRole('FOUNDRY');
  const now = new Date();
  const open = (await listOrders('FOUNDRY')).filter((o) => isOpen(o.stage));
  const late = open.filter((o) => urgency(o.stage, o.shipBy, now) === 'late');
  return (
    <main className="page">
      <div className="hello"><div><h2>Deadlines</h2><p>Each bar runs from when you received the order to its ship-by date. The orange line is now.</p></div></div>
      {late.length > 0 && (
        <div className="sec" style={{ borderColor: 'var(--bad)', marginBottom: 14 }}>
          <b style={{ color: 'var(--bad)' }}>{late.length} late:</b>{' '}
          {late.map((o) => <Link key={o.id} className="chip" href={`/f/orders/${o.id}`} style={{ textDecoration: 'none', marginRight: 6 }}>{o.name} · {timeLeftLabel(o.shipBy, now).toLowerCase()}</Link>)}
        </div>
      )}
      {open.length ? <Gantt now={now} hrefBase="/f/orders" rows={open.map((o) => ({ ...o, label: FOUNDRY_LABEL[o.stage], from: o.acceptedAt ?? o.sentAt ?? o.placedAt }))} />
        : <div className="empty">No open orders.</div>}
      <h3 className="h3" style={{ marginTop: 22 }}>Courier pickups this week</h3>
      <PickupAgenda rows={open} now={now} hrefBase="/f/orders" label={(o) => FOUNDRY_LABEL[o.stage]} />
    </main>
  );
}
