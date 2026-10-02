import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { listOrders, hasCustom, itemsSummary, type OrderRow } from '@/lib/data';
import { STAGES, STAGE_LABEL, STAGE_SHORT, stageIndex, urgency } from '@/lib/rules';
import { ORDER_SORTS, isSortKey, sortOrders, type OrderSortKey, type SortDir } from '@/lib/order-sort';
import { day } from '@/lib/format';
import { LeftPill, Pill } from '@/components/ui';
import { FilterBox, LinkSelect } from '@/components/client';
import type { Stage } from '@/lib/db/schema';

export const metadata = { title: 'Foundry orders · Potties' };

const FILTERS: [string, string][] = [['all', 'All'], ['late', 'Late'], ['soon', 'Due in 3 days'], ['custom', 'Custom lid / engraving'], ['unpaid', 'Invoice unpaid'], ['proof', 'Proof to approve']];

function customPill(o: OrderRow) {
  if (!hasCustom(o)) return <Pill>None</Pill>;
  if (o.proofApprovedAt) return <Pill tone="ok">Approved</Pill>;
  if (o.foundryCustomChecked) return <Pill tone="info">Foundry ✓</Pill>;
  return <Pill tone="warn">Unchecked</Pill>;
}
function proofPill(o: OrderRow) {
  const need = ['PHOTO_PRODUCT', 'PHOTO_PACKED', ...(hasCustom(o) ? ['PHOTO_CUSTOM'] : [])];
  const n = need.filter((k) => o.fileKinds.includes(k)).length;
  if (o.proofApprovedAt) return <Pill tone="ok">Approved</Pill>;
  if (n === need.length) return <Pill tone="warn">Review</Pill>;
  return <Pill>{n ? `${n}/${need.length}` : '—'}</Pill>;
}
function invPill(o: OrderRow) {
  if (!o.invoice) return <Pill>No invoice</Pill>;
  return o.invoice.paidAt ? <Pill tone="ok">Paid</Pill> : <Pill tone="warn">Unpaid</Pill>;
}

export default async function Orders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole('HQ');
  const sp = await searchParams;
  const f = sp.f ?? 'all', view = sp.view === 'board' ? 'board' : 'list';
  const sort: OrderSortKey = isSortKey(sp.sort) ? sp.sort : 'shipBy';
  const dir: SortDir = sp.dir === 'asc' || sp.dir === 'desc' ? sp.dir : ORDER_SORTS[sort].dir;
  const stage = STAGES.includes(sp.stage as Stage) ? (sp.stage as Stage) : null;
  const now = new Date();
  let rows = await listOrders('HQ');
  if (stage) rows = rows.filter((o) => o.stage === stage);
  if (f === 'late') rows = rows.filter((o) => urgency(o.stage, o.shipBy, now) === 'late');
  if (f === 'soon') rows = rows.filter((o) => urgency(o.stage, o.shipBy, now) === 'soon');
  if (f === 'custom') rows = rows.filter(hasCustom);
  if (f === 'unpaid') rows = rows.filter((o) => o.invoice && !o.invoice.paidAt);
  if (f === 'proof') rows = rows.filter((o) => o.stage === 'PACKED' && !o.proofApprovedAt);
  sortOrders(rows, sort, dir, now);
  const q = (p: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const merged: Record<string, string | null> = { f, view, sort, dir, stage, ...p };
    if (merged.dir === ORDER_SORTS[merged.sort as OrderSortKey].dir) merged.dir = null; // default direction stays out of the link
    for (const [k, v] of Object.entries(merged)) if (v && !(k === 'f' && v === 'all') && !(k === 'view' && v === 'list') && !(k === 'sort' && v === 'shipBy')) u.set(k, v);
    return `/hq/orders${u.size ? `?${u}` : ''}`;
  };
  // Clicking a column heading sorts by it; clicking it again flips the direction.
  const Th = ({ k, children }: { k: OrderSortKey; children: React.ReactNode }) => {
    const on = sort === k;
    const next: SortDir = on ? (dir === 'asc' ? 'desc' : 'asc') : ORDER_SORTS[k].dir;
    const s = ORDER_SORTS[k];
    return (
      <th aria-sort={on ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
        <Link className={`sorth${on ? ' on' : ''}`} href={q({ sort: k, dir: next })} title={`Sort by ${s.label.toLowerCase()}: ${next === 'asc' ? s.asc : s.desc}`}>
          {children}<span className="arrow" aria-hidden>{on ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span>
        </Link>
      </th>
    );
  };
  const sortOptions = (Object.keys(ORDER_SORTS) as OrderSortKey[]).flatMap((k) => (ORDER_SORTS[k].dir === 'asc' ? ['asc', 'desc'] as const : ['desc', 'asc'] as const)
    .map((d) => ({ value: `${k}:${d}`, label: `${ORDER_SORTS[k].label}: ${ORDER_SORTS[k][d]}`, href: q({ sort: k, dir: d }) })));
  return (
    <main className="page" id="orders">
      <div className="toolbar">
        <h2>Foundry orders</h2>
        <div className="seg" role="group" aria-label="Layout">
          <Link href={q({ view: 'list' })} aria-current={view === 'list' ? 'page' : undefined}>List</Link>
          <Link href={q({ view: 'board' })} aria-current={view === 'board' ? 'page' : undefined}>Board</Link>
        </div>
        {stage && <Link className="chip" aria-current="page" href={q({ stage: null })} style={{ textDecoration: 'none' }}>Stage: {STAGE_LABEL[stage]} ✕</Link>}
      </div>
      <div className="toolbar">
        {FILTERS.map(([k, l]) => <Link key={k} className="chip" aria-current={f === k ? 'page' : undefined} href={q({ f: k })} style={{ textDecoration: 'none' }}>{l}</Link>)}
        <div className="spacer" />
        <LinkSelect label="Sort by" value={`${sort}:${dir}`} options={sortOptions} />
        <FilterBox target="#orders" placeholder="Search order #, customer, town" />
      </div>
      {view === 'list' ? (
        <div className="tbl-wrap">
          <table className="otbl">
            <thead><tr>
              <Th k="order">Order</Th><Th k="town">Ship to</Th><Th k="shipBy">Ship by</Th><Th k="stage">Stage</Th>
              <Th k="custom">Custom</Th><Th k="proof">Proof</Th><Th k="tracking">Tracking</Th><Th k="invoice">Invoice</Th>
            </tr></thead>
            <tbody>
              {rows.map((o) => {
                const late = urgency(o.stage, o.shipBy, now) === 'late';
                return (
                  <tr key={o.id} className={late ? 'r-late' : ''} data-search={`${o.name} ${o.customerName} ${o.city} ${itemsSummary(o)}`}>
                    <td><Link className="lnk" href={`/hq/orders/${o.id}`}>{o.name}</Link><br /><span className="sub2">{o.customerName}</span></td>
                    <td>{o.city}<br /><span className="sub2">{o.province}</span></td>
                    <td className="num">{day(o.shipBy)}<br /><LeftPill o={o} now={now} /></td>
                    <td>{STAGE_LABEL[o.stage]}{o.openQuestion && <> <Pill tone="bad">Question</Pill></>}
                      <div className="prog">{STAGES.map((s, j) => <i key={s} className={j < stageIndex(o.stage) ? 'd' : j === stageIndex(o.stage) ? 'c' : ''} />)}</div></td>
                    <td>{customPill(o)}</td><td>{proofPill(o)}</td>
                    <td>{o.trackingNumber ? <span className="mono">{o.trackingNumber}</span> : o.stage === 'PACKED' ? <Pill tone="warn">Waiting</Pill> : <span className="sub2">—</span>}</td>
                    <td>{invPill(o)}</td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={8} className="sub2">No orders match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="board-scroll">
          <div className="board">
            {STAGES.map((s) => {
              const list = rows.filter((o) => o.stage === s);
              return (
                <div key={s} className="lane">
                  <div className="lane-h"><div><b>{STAGE_SHORT[s]}</b></div><span className="num">{list.length}</span></div>
                  {list.map((o) => {
                    const u = urgency(o.stage, o.shipBy, now);
                    return (
                      <Link key={o.id} href={`/hq/orders/${o.id}`} className={`card ${u === 'late' ? 'late' : u === 'soon' ? 'risk' : ''}`} style={{ textDecoration: 'none', color: 'inherit' }} data-search={`${o.name} ${o.customerName} ${o.city}`}>
                        <div className="row"><span className="ord">{o.name}</span></div>
                        <div className="cust">{o.customerName} · {o.city}</div>
                        <div className="item">{itemsSummary(o)}</div>
                        {o.lines.filter((l) => l.customText).map((l) => <div key={l.id} className="custom">{l.customType}: “{l.customText}”</div>)}
                        <LeftPill o={o} now={now} />
                      </Link>
                    );
                  })}
                  {!list.length && <div style={{ fontSize: 12, color: 'var(--faint)', padding: '8px 4px' }}>Nothing here</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
