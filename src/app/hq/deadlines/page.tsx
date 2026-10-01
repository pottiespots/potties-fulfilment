import { requireRole } from '@/lib/auth';
import { listOrders } from '@/lib/data';
import { STAGE_LABEL, isOpen } from '@/lib/rules';
import { Gantt, PickupAgenda } from '@/components/ui';

export const metadata = { title: 'Deadlines · Potties' };

export default async function HQDeadlines() {
  await requireRole('HQ');
  const now = new Date();
  const open = (await listOrders('HQ')).filter((o) => isOpen(o.stage));
  return (
    <main className="page">
      <div className="hello"><div><h2>Deadlines</h2><p>Each bar runs from when the order came in (or the foundry accepted it) to its ship-by date. The orange line is now.</p></div></div>
      {open.length ? <Gantt now={now} hrefBase="/hq/orders" rows={open.map((o) => ({ ...o, label: STAGE_LABEL[o.stage], from: o.acceptedAt ?? o.sentAt ?? o.placedAt }))} />
        : <div className="empty">No open orders.</div>}
      <h3 className="h3" style={{ marginTop: 22 }}>Courier pickups this week</h3>
      <PickupAgenda rows={open} now={now} hrefBase="/hq/orders" label={(o) => STAGE_LABEL[o.stage]} />
    </main>
  );
}
