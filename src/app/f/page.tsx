import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { listOrders, customLines, itemsSummary, type OrderRow } from '@/lib/data';
import { FOUNDRY_LABEL, isOpen, urgency } from '@/lib/rules';
import { day, greeting, longDate, time } from '@/lib/format';
import { LeftPill, Pill, Tile } from '@/components/ui';
import { FilterBox } from '@/components/client';

export const metadata = { title: 'My orders · Potties' };

function Job({ o, now }: { o: OrderRow; now: Date }) {
  const u = o.stage === 'SENT' ? 'ask' : urgency(o.stage, o.shipBy, now);
  const cls = u === 'late' ? 'late' : u === 'soon' ? 'risk' : u === 'ask' ? 'ask' : '';
  return (
    <article className={`job ${cls}`} data-search={`${o.name} ${o.customerName} ${o.city} ${itemsSummary(o)}`}>
      <div className="due"><span className="cap">Ship by</span><b>{day(o.shipBy)}</b><span className="tm">{time(o.shipBy)}{o.courier ? ` · ${o.courier}` : ''}</span></div>
      <div>
        <div className="who">{o.name} · {o.customerName}</div>
        <div className="what">{itemsSummary(o)}</div>
        {customLines(o).map((l) => <div key={l.id} className="custom" style={{ marginTop: 4, display: 'inline-block' }}>{l.customType}: “{l.customText}”</div>)}
      </div>
      <div className="addrcol">
        <div className="where">Ship to <b>{o.city}</b>{o.province ? `, ${o.province}` : ''}</div>
        <div className="stat"><Pill tone="info">{FOUNDRY_LABEL[o.stage]}</Pill><LeftPill o={o} now={now} />{o.stage === 'PACKED' && <Pill tone="bad">Add tracking</Pill>}</div>
      </div>
      <div className="acts">
        <a className="btn ghost sm" href={`/api/orders/${o.id}/packing-slip`} target="_blank" rel="noreferrer">Packing slip</a>
        <Link className="btn sm" href={`/f/orders/${o.id}`}>{o.stage === 'SENT' ? 'Review & accept' : o.stage === 'PACKED' ? 'Add tracking' : 'Open & update'}</Link>
      </div>
    </article>
  );
}

type Show = 'new' | 'late' | 'soon' | 'tracking';
const SHOWS: Show[] = ['new', 'late', 'soon', 'tracking'];

export default async function MyOrders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const show = SHOWS.find((x) => x === sp.show) ?? null;
  const tileHref = (x: Show) => (show === x ? '/f' : `/f?show=${x}`); // click again to see everything
  const user = await requireRole('FOUNDRY');
  const now = new Date();
  const all = await listOrders('FOUNDRY');
  const ask = all.filter((o) => o.stage === 'SENT');
  const open = all.filter((o) => isOpen(o.stage) && o.stage !== 'SENT');
  const late = open.filter((o) => urgency(o.stage, o.shipBy, now) === 'late');
  const soon = open.filter((o) => urgency(o.stage, o.shipBy, now) === 'soon');
  const later = open.filter((o) => urgency(o.stage, o.shipBy, now) === 'ok');
  const tracking = open.filter((o) => o.stage === 'PACKED');
  const shipped = all.filter((o) => o.stage === 'SHIPPED' || o.stage === 'DELIVERED').reverse().slice(0, 15);
  const group = (title: string, list: OrderRow[], empty: string, cls = '') => (
    <div className={`group ${cls}`}>
      <h3>{title} <span className="num">{list.length}</span></h3>
      {list.length ? <div className="jobs">{list.map((o) => <Job key={o.id} o={o} now={now} />)}</div> : <div className="empty">{empty}</div>}
    </div>
  );
  return (
    <main className="page" id="mine">
      <div className="hello">
        <div><h2>{greeting(now)}, {user.name.split(' ')[0]}</h2><p>{longDate(now)} · {ask.length + open.length} orders on the go</p></div>
        <div className="btns"><FilterBox target="#mine" placeholder="Search order # or name" /><Link className="btn ghost" href="/f/deadlines">See deadlines</Link></div>
      </div>
      <div className="ftiles">
        <Tile tone="hot" v={ask.length} l="New orders to accept" s="Within 24 h of receiving" href={tileHref('new')} active={show === 'new'} />
        <Tile tone="bad" v={late.length} l="Late" s="Past the ship-by date" href={tileHref('late')} active={show === 'late'} />
        <Tile tone="warn" v={soon.length} l="Ship in next 3 days" s="Keep these moving" href={tileHref('soon')} active={show === 'soon'} />
        <Tile v={tracking.length} l="Waiting for tracking" s="Packed, add waybill when collected" href={tileHref('tracking')} active={show === 'tracking'} />
      </div>
      {show && <div className="showing">Showing only: <b>{{ new: 'New orders to accept', late: 'Late', soon: 'Ship in next 3 days', tracking: 'Waiting for tracking' }[show]}</b> <Link className="btn ghost sm" href="/f" scroll={false}>Show all orders</Link></div>}
      {show === 'new' && group('New orders: please accept', ask, 'No new orders waiting. We email you when one arrives.', 'g-hot')}
      {show === 'late' && group('Late', late, 'Nothing is late. Well done!', 'g-bad')}
      {show === 'soon' && group('Ship in the next 3 days', soon, 'Nothing due in the next 3 days.')}
      {show === 'tracking' && group('Waiting for tracking', tracking, 'No packed orders waiting for tracking.')}
      {!show && <>
        {group('New orders: please accept', ask, 'No new orders waiting. We email you when one arrives.', 'g-hot')}
        {late.length > 0 && group('Late', late, '', 'g-bad')}
        {group('Ship in the next 3 days', soon, 'Nothing due in the next 3 days.')}
        {group('Coming up', later, 'Nothing further out yet.')}
        {group('Shipped', shipped, 'Nothing shipped yet.')}
      </>}
    </main>
  );
}
