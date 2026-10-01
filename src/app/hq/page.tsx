import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { listOrders, invoicesWithPop, purchaseOrdersFull, productsWithStock } from '@/lib/data';
import { buildAttention, type Attention } from '@/lib/attention';
import { STAGES, STAGE_SHORT, isOpen, money, DAY } from '@/lib/rules';
import { day, time, longDate } from '@/lib/format';
import { LeftPill } from '@/components/ui';
import { ActButton } from '@/components/client';
import { approveProof, chaseFoundry, markInvoicePaid } from '@/app/actions/hq';
import { supplierName } from '@/lib/labels';
import { SyncStatus } from '@/components/sync-status';

export const metadata = { title: 'Today · Potties' };

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

export default async function Today() {
  await requireRole('HQ');
  const now = new Date();
  const [orders, invoices, pos, ll] = await Promise.all([listOrders('HQ'), invoicesWithPop(), purchaseOrdersFull(), productsWithStock('LL')]);
  const A = buildAttention({ orders, invoices, pos, llProducts: ll, now, acceptHours: Number(process.env.ACCEPT_WINDOW_HOURS || 24) });
  const counts = STAGES.map((s) => orders.filter((o) => o.stage === s).length);
  const max = Math.max(...counts, 1);
  const week = orders.filter((o) => isOpen(o.stage) && o.shipBy >= now && o.shipBy.getTime() - now.getTime() < 7 * DAY);
  const owedF = invoices.filter((i) => !i.paidAt && i.supplier === 'FOUNDRY').reduce((s, i) => s + i.amountCents, 0);
  const owedL = invoices.filter((i) => !i.paidAt && i.supplier !== 'FOUNDRY').reduce((s, i) => s + i.amountCents, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const delivered = orders.filter((o) => o.deliveredAt && o.deliveredAt >= monthStart);
  const shippedThisMonth = orders.filter((o) => o.shippedAt && o.shippedAt >= monthStart);
  const onTime = shippedThisMonth.length ? Math.round((shippedThisMonth.filter((o) => o.shippedAt! <= o.shipBy).length / shippedThisMonth.length) * 100) : null;
  return (
    <main className="page">
      <div className="hello"><div><h2>Today at Potties</h2><p>{longDate(now)} · {A.length} things need you · {money(owedF + owedL)} still to pay suppliers</p></div></div>
      <SyncStatus />
      <div className="pipe">
        {STAGES.map((s, i) => (
          <Link key={s} href={`/hq/orders?stage=${s}`} className="pstage" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="pn num">{counts[i]}</span><span className="pl">{STAGE_SHORT[s]}</span>
            <span className="pb"><i style={{ height: `${(counts[i] / max) * 100}%` }} /></span>
          </Link>
        ))}
      </div>
      <div className="todaygrid">
        <div>
          <h3 className="h3">Needs your attention <span className="num">{A.length}</span></h3>
          {A.length ? (
            <div className="inbox">
              {A.map((a, i) => (
                <div key={i} className={`ibx s-${a.sev}`}>
                  <div className="ib-main">
                    <div className="ib-t">
                      {a.orderId ? <Link className="lnk" href={`/hq/orders/${a.orderId}`}>{a.ref}</Link> : <><span className={`sup ${a.supplier !== 'FOUNDRY' ? 'sup-ll' : ''}`}>{supplierName(a.supplier ?? 'FOUNDRY', a.supplierLabel)}</span> {a.ref}</>} · {a.title}
                    </div>
                    <div className="ib-d">{a.detail}</div>
                  </div>
                  <div className="ib-b"><Actions a={a} /></div>
                </div>
              ))}
            </div>
          ) : <div className="empty">All clear. Nothing needs you right now.</div>}
        </div>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <div className="sec">
            <h4>Courier pickups next 7 days <span className="num">{week.length}</span></h4>
            {week.length ? week.map((o) => (
              <Link key={o.id} href={`/hq/orders/${o.id}`} className="mini" style={{ textDecoration: 'none', color: 'inherit' }}>
                <b>{day(o.shipBy)}</b> {time(o.shipBy)}<span>{o.name} · {o.city} · {STAGE_SHORT[o.stage]}</span><LeftPill o={o} now={now} />
              </Link>
            )) : <div className="kv">None</div>}
          </div>
          <div className="sec">
            <h4>This month</h4>
            <div className="grid2">
              <div className="kv"><span>Delivered</span><b className="num" style={{ fontSize: 20 }}>{delivered.length}</b></div>
              <div className="kv"><span>Shipped on time</span><b className="num" style={{ fontSize: 20 }}>{onTime === null ? '—' : `${onTime}%`}</b></div>
              <div className="kv"><span>Owed to foundry</span><b className="num" style={{ fontSize: 20 }}>{money(owedF)}</b></div>
              <div className="kv"><span>Owed to LL & others</span><b className="num" style={{ fontSize: 20 }}>{money(owedL)}</b></div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
