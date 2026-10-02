import Link from 'next/link';
import { Suspense } from 'react';
import { requireRole } from '@/lib/auth';
import { listOrders, invoicesWithPop, purchaseOrdersFull, productsWithStock } from '@/lib/data';
import { buildAttention, ATTENTION_GROUP, type Attention, type AttentionGroup } from '@/lib/attention';
import { STAGES, STAGE_SHORT, isOpen, money, DAY } from '@/lib/rules';
import { day, time, longDate } from '@/lib/format';
import { LeftPill } from '@/components/ui';
import { ActButton } from '@/components/client';
import { approveProof, chaseFoundry, markInvoicePaid } from '@/app/actions/hq';
import { supplierName } from '@/lib/labels';
import { SyncStatus } from '@/components/sync-status';
import { MoneyStrip, MoneySkeleton, RangeChips, SalesDetail, TrafficPanel } from '@/components/money';
import { isRange, type InsightRange } from '@/lib/insights-calc';
import { shopifyAdmin } from '@/lib/shopify-insights';

export const metadata = { title: 'Dashboard · Potties' };

function Actions({ a }: { a: Attention }) {
  const open = a.orderId ? `/hq/orders/${a.orderId}` : '';
  switch (a.kind) {
    case 'send': return <Link className="btn sm" href={open}>Check & send</Link>;
    case 'question': return <Link className="btn sm" href={open}>Answer</Link>;
    case 'not-accepted': case 'late': case 'custom-unchecked':
      return <><ActButton className="btn ghost sm" action={chaseFoundry.bind(null, a.orderId!)}>{a.kind === 'custom-unchecked' ? 'Remind foundry' : 'Chase foundry'}</ActButton><Link className="btn ghost sm" href={open}>Open</Link></>;
    case 'proof': return <><Link className="btn ghost sm" href={open}>View photos</Link><ActButton className="btn sm" action={approveProof.bind(null, a.orderId!)}>Approve</ActButton></>;
    case 'tracking-failed': return <Link className="btn sm" href={open}>Open</Link>;
    case 'invoice-overdue': case 'invoice-due': return <ActButton className={`btn ${a.kind === 'invoice-overdue' ? '' : 'ghost'} sm`} action={markInvoicePaid.bind(null, a.invoiceId!)}>Mark paid</ActButton>;
    case 'pop-missing': return <Link className="btn ghost sm" href="/hq/invoices">Upload POP</Link>;
    case 'po-late': return <Link className="btn ghost sm" href="/hq/ll">Open LL orders</Link>;
    case 'low-stock': return <Link className="btn ghost sm" href={`/hq/ll?order=${a.productId}#new-po`}>Order from LL</Link>;
  }
}

type View = 'all' | AttentionGroup | 'money';
const VIEWS: { key: View; label: string }[] = [
  { key: 'all', label: 'Everything' }, { key: 'money', label: 'Sales & cash' }, { key: 'orders', label: 'Orders' }, { key: 'invoices', label: 'Invoices' }, { key: 'stock', label: 'LL & stock' },
];
const GROUP_TITLE: Record<AttentionGroup, string> = { orders: 'Orders', invoices: 'Supplier invoices', stock: 'LL Manufacturing & stock' };
const PREVIEW = 5;

function ShopifyLinks() {
  const links: [string, string][] = [['', 'Shopify home'], ['/orders', 'Orders'], ['/analytics', 'Analytics'], ['/analytics/reports', 'Reports'], ['/payments/payouts', 'Payouts'], ['/products', 'Products'], ['/customers', 'Customers'], ['/discounts', 'Discounts']];
  if (!shopifyAdmin()) return null;
  return (
    <div className="sec">
      <h4>Open in Shopify</h4>
      <div className="slinks">{links.map(([p, l]) => <a key={p} className="btn ghost sm" href={shopifyAdmin(p)!} target="_blank" rel="noreferrer">{l} ↗</a>)}</div>
    </div>
  );
}

function Inbox({ items }: { items: Attention[] }) {
  return (
    <div className="inbox">
      {items.map((a, i) => (
        <div key={i} className={`ibx s-${a.sev}`}>
          <div className="ib-main">
            <div className="ib-t">
              {a.orderId && !a.invoiceId ? <Link className="lnk" href={`/hq/orders/${a.orderId}`}>{a.ref}</Link> : <><span className={`sup ${a.supplier !== 'FOUNDRY' ? 'sup-ll' : ''}`}>{supplierName(a.supplier ?? 'FOUNDRY', a.supplierLabel)}</span> {a.ref}</>} · {a.title}
            </div>
            <div className="ib-d">{a.detail}</div>
          </div>
          <div className="ib-b"><Actions a={a} /></div>
        </div>
      ))}
    </div>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole('HQ');
  const sp = await searchParams;
  const view: View = VIEWS.find((v) => v.key === sp.view)?.key ?? 'all';
  const range: InsightRange = isRange(sp.range) ? sp.range : '30';
  const now = new Date();
  const [orders, invoices, pos, ll] = await Promise.all([listOrders('HQ'), invoicesWithPop(), purchaseOrdersFull(), productsWithStock('LL')]);
  const A = buildAttention({ orders, invoices, pos, llProducts: ll, now, acceptHours: Number(process.env.ACCEPT_WINDOW_HOURS || 24) });
  const byGroup: Record<AttentionGroup, Attention[]> = { orders: [], invoices: [], stock: [] };
  for (const a of A) byGroup[ATTENTION_GROUP[a.kind]].push(a);
  const urgent = (items: Attention[]) => items.filter((a) => a.sev === 'bad').length;
  const counts = STAGES.map((s) => orders.filter((o) => o.stage === s).length);
  const max = Math.max(...counts, 1);
  const week = orders.filter((o) => isOpen(o.stage) && o.shipBy >= now && o.shipBy.getTime() - now.getTime() < 7 * DAY);
  const owedF = invoices.filter((i) => !i.paidAt && i.supplier === 'FOUNDRY').reduce((s, i) => s + i.amountCents, 0);
  const owedL = invoices.filter((i) => !i.paidAt && i.supplier !== 'FOUNDRY').reduce((s, i) => s + i.amountCents, 0);
  const unpaid = invoices.filter((i) => !i.paidAt).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const overdue = unpaid.filter((i) => i.dueAt < now);
  const dueSoon = unpaid.filter((i) => i.dueAt >= now && i.dueAt.getTime() - now.getTime() < 7 * DAY);
  const sum = (l: typeof invoices) => l.reduce((t, i) => t + i.amountCents, 0);
  const openPos = pos.filter((p) => p.status !== 'DELIVERED' && p.status !== 'CANCELLED');
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const delivered = orders.filter((o) => o.deliveredAt && o.deliveredAt >= monthStart);
  const shippedThisMonth = orders.filter((o) => o.shippedAt && o.shippedAt >= monthStart);
  const onTime = shippedThisMonth.length ? Math.round((shippedThisMonth.filter((o) => o.shippedAt! <= o.shipBy).length / shippedThisMonth.length) * 100) : null;
  return (
    <main className="page">
      <div className="hello"><div><h2>Potties dashboard</h2><p>{longDate(now)} · {A.length} things need you · {money(owedF + owedL)} still to pay suppliers</p></div></div>
      <SyncStatus />
      <nav className="ttabs" aria-label="Show">
        {VIEWS.map((v) => {
          const items = v.key === 'money' ? null : v.key === 'all' ? A : byGroup[v.key];
          const bad = items ? urgent(items) : 0;
          return (
            <Link key={v.key} href={v.key === 'all' ? '/hq' : `/hq?view=${v.key}`} className="chip" aria-current={view === v.key ? 'page' : undefined}>
              {v.label}{items && <span className="tcount">{items.length}</span>}{bad > 0 && <span className="tbad" title="Urgent">{bad} urgent</span>}
            </Link>
          );
        })}
      </nav>
      {view === 'all' && (
        <Suspense fallback={<MoneySkeleton />}>
          <MoneyStrip range="30" invoices={invoices} owedCents={owedF + owedL} detailHref="/hq?view=money" />
        </Suspense>
      )}
      {view === 'money' && (
        <>
          <RangeChips range={range} base="/hq?view=money" />
          <Suspense key={`strip-${range}`} fallback={<MoneySkeleton />}>
            <MoneyStrip range={range} invoices={invoices} owedCents={owedF + owedL} />
          </Suspense>
          <div className="todaygrid">
            <div className="stack">
              <Suspense key={`detail-${range}`} fallback={<MoneySkeleton tall />}><SalesDetail range={range} /></Suspense>
            </div>
            <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
              <Suspense key={`traffic-${range}`} fallback={<MoneySkeleton />}><TrafficPanel range={range} /></Suspense>
              <div className="sec">
                <h4>Money going out</h4>
                <div className="grid2">
                  <div className="kv"><span>Owed to foundry</span><b className="num" style={{ fontSize: 20 }}>{money(owedF)}</b></div>
                  <div className="kv"><span>Owed to LL & others</span><b className="num" style={{ fontSize: 20 }}>{money(owedL)}</b></div>
                  <div className="kv"><span>Overdue</span><b className="num" style={{ fontSize: 20, color: overdue.length ? 'var(--bad)' : undefined }}>{money(sum(overdue))}</b></div>
                  <div className="kv"><span>Due next 7 days</span><b className="num" style={{ fontSize: 20 }}>{money(sum(dueSoon))}</b></div>
                </div>
                <Link className="lnk" href="/hq?view=invoices" style={{ display: 'inline-block', marginTop: 8 }}>Invoices to pay →</Link>
              </div>
              <ShopifyLinks />
            </div>
          </div>
        </>
      )}
      {(view === 'all' || view === 'orders') && <div className="pipe">
        {STAGES.map((s, i) => (
          <Link key={s} href={`/hq/orders?stage=${s}`} className="pstage" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="pn num">{counts[i]}</span><span className="pl">{STAGE_SHORT[s]}</span>
            <span className="pb"><i style={{ height: `${(counts[i] / max) * 100}%` }} /></span>
          </Link>
        ))}
      </div>}
      {view !== 'money' && <div className="todaygrid">
        <div>
          {view === 'all' ? (
            A.length ? (['orders', 'invoices', 'stock'] as AttentionGroup[]).filter((g) => byGroup[g].length).map((g) => (
              <section key={g} className="tgroup">
                <h3 className="h3">{GROUP_TITLE[g]} <span className="num">{byGroup[g].length}</span>
                  {byGroup[g].length > PREVIEW && <Link className="lnk tmore" href={`/hq?view=${g}`}>Show all {byGroup[g].length} →</Link>}</h3>
                <Inbox items={byGroup[g].slice(0, PREVIEW)} />
              </section>
            )) : <div className="empty">All clear. Nothing needs you right now.</div>
          ) : (
            <>
              <h3 className="h3">{GROUP_TITLE[view]} that need you <span className="num">{byGroup[view].length}</span></h3>
              {byGroup[view].length ? <Inbox items={byGroup[view]} /> : <div className="empty">Nothing here needs you right now.</div>}
            </>
          )}
        </div>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          {(view === 'all' || view === 'orders') && (
            <div className="sec">
              <h4>Courier pickups next 7 days <span className="num">{week.length}</span></h4>
              {week.length ? week.map((o) => (
                <Link key={o.id} href={`/hq/orders/${o.id}`} className="mini" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <b>{day(o.shipBy)}</b> {time(o.shipBy)}<span>{o.name} · {o.city} · {STAGE_SHORT[o.stage]}</span><LeftPill o={o} now={now} />
                </Link>
              )) : <div className="kv">None</div>}
              {view === 'orders' && <Link className="lnk" href="/hq/orders" style={{ display: 'inline-block', marginTop: 8 }}>All orders →</Link>}
            </div>
          )}
          {(view === 'all' || view === 'orders') && (
            <div className="sec">
              <h4>This month</h4>
              <div className="grid2">
                <div className="kv"><span>Delivered</span><b className="num" style={{ fontSize: 20 }}>{delivered.length}</b></div>
                <div className="kv"><span>Shipped on time</span><b className="num" style={{ fontSize: 20 }}>{onTime === null ? '—' : `${onTime}%`}</b></div>
                {view === 'all' && <div className="kv"><span>Owed to foundry</span><b className="num" style={{ fontSize: 20 }}>{money(owedF)}</b></div>}
                {view === 'all' && <div className="kv"><span>Owed to LL & others</span><b className="num" style={{ fontSize: 20 }}>{money(owedL)}</b></div>}
              </div>
            </div>
          )}
          {view === 'invoices' && (
            <>
              <div className="sec">
                <h4>Money owed to suppliers</h4>
                <div className="grid2">
                  <div className="kv"><span>Overdue ({overdue.length})</span><b className="num" style={{ fontSize: 20, color: overdue.length ? 'var(--bad)' : undefined }}>{money(sum(overdue))}</b></div>
                  <div className="kv"><span>Due next 7 days ({dueSoon.length})</span><b className="num" style={{ fontSize: 20 }}>{money(sum(dueSoon))}</b></div>
                  <div className="kv"><span>Owed to foundry</span><b className="num" style={{ fontSize: 20 }}>{money(owedF)}</b></div>
                  <div className="kv"><span>Owed to LL & others</span><b className="num" style={{ fontSize: 20 }}>{money(owedL)}</b></div>
                </div>
              </div>
              <div className="sec">
                <h4>Next payments <span className="num">{unpaid.length}</span></h4>
                {unpaid.length ? unpaid.slice(0, 8).map((i) => (
                  <Link key={i.id} href="/hq/invoices" className="mini" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <b>{day(i.dueAt)}</b><span>{supplierName(i.supplier, i.supplierLabel)} · {i.number}</span><b className="num">{money(i.amountCents)}</b>
                  </Link>
                )) : <div className="kv">Nothing unpaid</div>}
                <Link className="lnk" href="/hq/invoices" style={{ display: 'inline-block', marginTop: 8 }}>All invoices →</Link>
              </div>
            </>
          )}
          {view === 'stock' && (
            <div className="sec">
              <h4>Open LL orders <span className="num">{openPos.length}</span></h4>
              {openPos.length ? openPos.map((p) => (
                <Link key={p.id} href="/hq/ll" className="mini" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <b>{p.expectedAt ? day(p.expectedAt) : 'No date'}</b><span>{p.number} · {p.lines.map((l) => `${l.quantity} × ${l.product.name}`).join(', ')}</span>
                </Link>
              )) : <div className="kv">No open purchase orders</div>}
              <div className="btns" style={{ marginTop: 8 }}><Link className="lnk" href="/hq/ll">LL Manufacturing →</Link><Link className="lnk" href="/hq/stock">Pot stock →</Link></div>
            </div>
          )}
        </div>
      </div>}
    </main>
  );
}
