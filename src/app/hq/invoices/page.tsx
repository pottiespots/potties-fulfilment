import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { invoicesWithPop, listOrders, purchaseOrdersFull } from '@/lib/data';
import { money, stageIndex } from '@/lib/rules';
import { day } from '@/lib/format';
import { Pill, Tile } from '@/components/ui';
import { ActButton, UploadSlot } from '@/components/client';
import { markInvoicePaid, uploadPop } from '@/app/actions/hq';

export const metadata = { title: 'Invoices · Potties' };

export default async function Invoices({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  await requireRole('HQ');
  const { s = 'all' } = await searchParams;
  const now = new Date();
  const [invoices, orders, pos] = await Promise.all([invoicesWithPop(), listOrders('HQ'), purchaseOrdersFull()]);
  const sum = (list: typeof invoices) => list.reduce((t, i) => t + i.amountCents, 0);
  const unpaid = invoices.filter((i) => !i.paidAt);
  const shown = invoices.filter((i) => s === 'all' || i.supplier === (s === 'll' ? 'LL' : 'FOUNDRY'))
    .sort((a, b) => Number(!!a.paidAt) - Number(!!b.paidAt) || a.dueAt.getTime() - b.dueAt.getTime());
  const noInvF = orders.filter((o) => stageIndex(o.stage) >= stageIndex('ACCEPTED') && !o.invoice);
  const noInvL = pos.filter((p) => p.status === 'DELIVERED' && !invoices.some((i) => i.purchaseOrderId === p.id));
  const orderName = new Map(orders.map((o) => [o.id, o]));
  const poName = new Map(pos.map((p) => [p.id, p]));
  return (
    <main className="page">
      <div className="hello"><div><h2>Invoices & payments</h2><p>Every supplier invoice in one place. Attach the Xero invoice, mark it paid and upload the proof of payment.</p></div></div>
      <div className="ftiles">
        <Tile tone="warn" v={money(sum(unpaid))} l="Total still to pay" s={`${unpaid.length} invoices`} />
        <Tile v={money(sum(unpaid.filter((i) => i.supplier === 'FOUNDRY')))} l="Owed to the foundry" />
        <Tile v={money(sum(unpaid.filter((i) => i.supplier === 'LL')))} l="Owed to LL Manufacturing" />
        <Tile tone={unpaid.some((i) => i.dueAt < now) ? 'bad' : ''} v={money(sum(unpaid.filter((i) => i.dueAt < now)))} l="Overdue" s={`${invoices.filter((i) => i.paidAt && !i.pop).length} paid without POP`} />
      </div>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Supplier">
          {[['all', 'All suppliers'], ['f', 'Foundry'], ['ll', 'LL Manufacturing']].map(([k, l]) => <Link key={k} href={k === 'all' ? '/hq/invoices' : `/hq/invoices?s=${k}`} aria-current={s === k ? 'page' : undefined}>{l}</Link>)}
        </div>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Supplier</th><th>Invoice</th><th>For</th><th className="r">Amount</th><th>Due</th><th>Status</th><th /></tr></thead>
          <tbody>
            {shown.map((i) => {
              const o = i.orderId ? orderName.get(i.orderId) : null, p = i.purchaseOrderId ? poName.get(i.purchaseOrderId) : null;
              return (
                <tr key={i.id}>
                  <td><span className={`sup ${i.supplier === 'LL' ? 'sup-ll' : ''}`}>{i.supplier === 'LL' ? 'LL' : 'Foundry'}</span></td>
                  <td><span className="ft">XERO</span> <b>{i.number}</b>{i.invoiceFileId && <> · <a className="lnk" href={`/api/files/${i.invoiceFileId}`}>View</a></>}</td>
                  <td>{o ? <Link className="lnk" href={`/hq/orders/${o.id}`}>{o.name}</Link> : p ? <Link className="lnk" href="/hq/ll">{p.number}</Link> : <span className="sub2">—</span>}{o && ` · ${o.customerName}`}</td>
                  <td className="r num"><b>{money(i.amountCents)}</b></td>
                  <td className="num">{day(i.dueAt)}</td>
                  <td>{i.paidAt ? <><Pill tone="ok">Paid</Pill> {i.pop ? <a href={`/api/files/${i.popFileId}`}><Pill tone="ok">POP</Pill></a> : <Pill tone="warn">No POP</Pill>}</> : <Pill tone={i.dueAt < now ? 'bad' : 'warn'}>{i.dueAt < now ? 'Overdue' : 'Unpaid'}</Pill>}</td>
                  <td className="r"><div className="btns" style={{ justifyContent: 'flex-end' }}>
                    {!i.paidAt && <ActButton className="btn sm" action={markInvoicePaid.bind(null, i.id)}>Mark paid</ActButton>}
                    {!i.pop && <UploadSlot action={uploadPop.bind(null, i.id)} kind="POP" label="Upload POP" filled={false} />}
                  </div></td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={7} className="sub2">No invoices yet. Attach them from an order or an LL purchase order.</td></tr>}
          </tbody>
        </table>
      </div>
      {((s !== 'll' && noInvF.length > 0) || (s !== 'f' && noInvL.length > 0)) && (
        <>
          <h3 className="h3" style={{ marginTop: 20 }}>Waiting for an invoice</h3>
          <div className="inbox">
            {s !== 'll' && noInvF.map((o) => (
              <div key={o.id} className="ibx s-mute"><div className="ib-main"><div className="ib-t"><span className="sup">Foundry</span> <Link className="lnk" href={`/hq/orders/${o.id}`}>{o.name}</Link> · {o.customerName}</div></div>
                <div className="ib-b"><Link className="btn ghost sm" href={`/hq/orders/${o.id}`}>Attach invoice</Link></div></div>
            ))}
            {s !== 'f' && noInvL.map((p) => (
              <div key={p.id} className="ibx s-mute"><div className="ib-main"><div className="ib-t"><span className="sup sup-ll">LL</span> {p.number} · {money(p.totalCents)}</div><div className="ib-d">Delivered {p.receivedAt ? day(p.receivedAt) : ''}</div></div>
                <div className="ib-b"><Link className="btn ghost sm" href="/hq/ll">Attach invoice</Link></div></div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
