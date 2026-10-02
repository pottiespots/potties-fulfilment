import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { foundryInvoices, listOrders } from '@/lib/data';
import { invoiceStatus, money, stageIndex, stillOwed } from '@/lib/rules';
import { day } from '@/lib/format';
import { Pill, Tile } from '@/components/ui';

export const metadata = { title: 'My invoices · Potties' };

export default async function MyInvoices() {
  await requireRole('FOUNDRY');
  const now = new Date();
  const [invoices, orders] = await Promise.all([foundryInvoices(), listOrders('FOUNDRY')]);
  const unpaid = invoices.filter((i) => !i.paidAt);
  const overdue = unpaid.filter((i) => i.dueAt < now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const paidThisMonth = invoices.filter((i) => i.paidAt && i.paidAt >= monthStart).reduce((t, i) => t + (i.paidAmountCents ?? i.amountCents), 0);
  // Orders the foundry has accepted but Potties has no invoice for yet.
  const noInvoice = orders.filter((o) => stageIndex(o.stage) >= stageIndex('ACCEPTED') && o.stage !== 'CANCELLED' && !o.invoice);
  return (
    <main className="page">
      <div className="hello"><div><h2>My invoices</h2><p>Which of your invoices Potties has received, what has been paid, and the proof of payment for each.</p></div></div>
      <div className="ftiles">
        <Tile tone="warn" v={money(unpaid.reduce((t, i) => t + stillOwed(i), 0))} l="Still to be paid" s={`${unpaid.length} invoice${unpaid.length === 1 ? '' : 's'}`} />
        <Tile tone={overdue.length ? 'bad' : ''} v={overdue.length} l="Payment overdue" s="Past the due date" />
        <Tile v={money(paidThisMonth)} l="Paid this month" />
        <Tile tone={noInvoice.length ? 'hot' : ''} v={noInvoice.length} l="Orders with no invoice yet" s="Potties has not received these" />
      </div>

      <div className="tbl-wrap">
        <table className="otbl" style={{ minWidth: 820 }}>
          <thead><tr><th>Invoice</th><th>Order</th><th>Received</th><th className="r">Amount</th><th>Due</th><th>Status</th><th>Proof of payment</th></tr></thead>
          <tbody>
            {invoices.map((i) => {
              const st = invoiceStatus(i, now);
              return (
                <tr key={i.id}>
                  <td><b>{i.number}</b>{i.invoiceFileId && <><br /><a className="lnk" href={`/api/files/${i.invoiceFileId}`} target="_blank" rel="noreferrer">View invoice</a></>}</td>
                  <td>{i.order ? <Link className="lnk" href={`/f/orders/${i.order.id}#invoice`}>{i.order.name}</Link> : <span className="sub2">—</span>}</td>
                  <td>✓ {day(i.createdAt)}</td>
                  <td className="r num">{money(i.amountCents)}</td>
                  <td>{day(i.dueAt)}</td>
                  <td><Pill tone={st.tone}>{st.label}</Pill>{i.paidAt && <><br /><span className="sub2">{day(i.paidAt)}</span></>}</td>
                  <td>{i.popFileId ? <a className="btn sm" href={`/api/files/${i.popFileId}`} target="_blank" rel="noreferrer">Download POP</a> : <span className="sub2">{i.paidAt ? 'Coming soon' : 'After payment'}</span>}</td>
                </tr>
              );
            })}
            {!invoices.length && <tr><td colSpan={7} className="sub2">Potties has not recorded any of your invoices yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {noInvoice.length > 0 && (
        <div className="sec" style={{ marginTop: 16 }}>
          <h4>Orders without an invoice yet <span className="num">{noInvoice.length}</span></h4>
          <p className="kv" style={{ margin: '0 0 8px' }}>Potties has not received an invoice for these orders. Please send them so payment can be made.</p>
          <div className="slinks">{noInvoice.map((o) => <Link key={o.id} className="btn ghost sm" href={`/f/orders/${o.id}#invoice`}>{o.name} · {o.customerName}</Link>)}</div>
        </div>
      )}
    </main>
  );
}
