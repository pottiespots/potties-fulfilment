import { requireRole } from '@/lib/auth';
import { invoicesWithPop, productsWithStock, purchaseOrdersFull } from '@/lib/data';
import { money, duration } from '@/lib/rules';
import { day, ymd } from '@/lib/format';
import { Pill, Tile } from '@/components/ui';
import { ActButton, ActForm, Submit, UploadSlot } from '@/components/client';
import { createInvoice, createPO, markInvoicePaid, saveProduct, setPOStatus, uploadPop, createProduct } from '@/app/actions/hq';

export const metadata = { title: 'LL Manufacturing · Potties' };

export default async function LL({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  await requireRole('HQ');
  const { order } = await searchParams;
  const now = new Date();
  const [pos, stock, invoices] = await Promise.all([purchaseOrdersFull(), productsWithStock('LL'), invoicesWithPop()]);
  const llInv = invoices.filter((i) => i.supplier === 'LL');
  const unpaid = llInv.filter((i) => !i.paidAt), overdue = unpaid.filter((i) => i.dueAt < now);
  const openPos = pos.filter((p) => p.status === 'ORDERED' || p.status === 'IN_PRODUCTION');
  const low = stock.filter((x) => x.active && x.available + x.onOrder < x.reorderLevel);
  const pre = stock.find((x) => x.id === order);
  const in14 = ymd(new Date(now.getTime() + 14 * 864e5));

  return (
    <main className="page">
      <div className="hello"><div><h2>LL Manufacturing</h2><p>Canvas covers, bags and leather aprons. Only Potties HQ manages this. LL Manufacturing does not log in.</p></div></div>
      <div className="ftiles">
        <Tile tone="warn" v={money(unpaid.reduce((s, i) => s + i.amountCents, 0))} l="Still to pay LL" s={`${unpaid.length} invoices`} />
        <Tile tone={overdue.length ? 'bad' : ''} v={money(overdue.reduce((s, i) => s + i.amountCents, 0))} l="Overdue" s={`${overdue.length} past due date`} />
        <Tile v={openPos.reduce((s, p) => s + p.lines.reduce((a, l) => a + l.quantity, 0), 0)} l="Units on order" s={`${openPos.length} open POs`} />
        <Tile tone={low.length ? 'warn' : ''} v={low.length} l="Need reordering" s="Below reorder level" />
      </div>

      <section className={`sec ${pre ? 'action' : ''}`} id="new-po" style={{ marginBottom: 20 }}>
        <h4>New purchase order to LL Manufacturing</h4>
        {stock.length ? (
          <ActForm action={createPO} resetOnOk>
            <div className="grid3">
              <label className="field">Product<select name="productId" defaultValue={pre?.id}>{stock.map((x) => <option key={x.id} value={x.id}>{x.name} · {money(x.unitCostCents)}</option>)}</select></label>
              <label className="field">Quantity<input name="quantity" type="number" min={1} defaultValue={pre ? Math.max(pre.reorderLevel * 2 - pre.available - pre.onOrder, 10) : 20} /></label>
              <label className="field">Needed by<input name="expectedAt" type="date" defaultValue={in14} /></label>
            </div>
            <div className="btns" style={{ marginTop: 10 }}><Submit>Create purchase order</Submit></div>
          </ActForm>
        ) : <p className="kv">Add your LL products below first.</p>}
      </section>

      <h3 className="h3">Purchase orders</h3>
      <div className="tbl-wrap" style={{ marginBottom: 22 }}>
        <table className="lltbl">
          <thead><tr><th>PO</th><th>Items</th><th>Delivery</th><th>Invoice</th><th className="r">Amount</th><th>Payment</th><th /></tr></thead>
          <tbody>
            {pos.map((p) => {
              const inv = llInv.find((i) => i.purchaseOrderId === p.id);
              const lateDelivery = p.status !== 'DELIVERED' && p.status !== 'CANCELLED' && p.expectedAt && p.expectedAt < now;
              return (
                <tr key={p.id}>
                  <td><b>{p.number}</b><br /><span className="sub2">Placed {day(p.placedAt)}</span></td>
                  <td>{p.lines.map((l) => <div key={l.id}>{l.quantity} × {l.product.name}</div>)}</td>
                  <td>
                    {p.status === 'DELIVERED' ? <Pill tone="ok">Delivered {p.receivedAt ? day(p.receivedAt) : ''}</Pill>
                      : p.status === 'CANCELLED' ? <Pill>Cancelled</Pill>
                      : lateDelivery ? <Pill tone="bad">Late · was due {day(p.expectedAt!)}</Pill>
                      : <Pill tone={p.status === 'IN_PRODUCTION' ? 'info' : 'mute'}>{p.status === 'IN_PRODUCTION' ? 'In production' : 'Ordered'}</Pill>}
                    {p.expectedAt && p.status !== 'DELIVERED' && <><br /><span className="sub2">Expected {day(p.expectedAt)}</span></>}
                  </td>
                  <td>{inv ? <><span className="ft">XERO</span> {inv.number}{inv.invoiceFileId && <> · <a className="lnk" href={`/api/files/${inv.invoiceFileId}`}>View</a></>}</> : <span className="sub2">Not received</span>}</td>
                  <td className="r num"><b>{money(p.totalCents)}</b></td>
                  <td>{inv ? (inv.paidAt ? <><Pill tone="ok">Paid</Pill> {inv.pop ? <Pill tone="ok">POP</Pill> : <Pill tone="warn">No POP</Pill>}</> : <Pill tone={inv.dueAt < now ? 'bad' : 'warn'}>{inv.dueAt < now ? `Overdue ${duration(inv.dueAt.getTime() - now.getTime())}` : `Due ${day(inv.dueAt)}`}</Pill>) : <span className="sub2">—</span>}</td>
                  <td className="r">
                    <div className="btns" style={{ justifyContent: 'flex-end' }}>
                      {p.status === 'ORDERED' && <ActForm action={setPOStatus.bind(null, p.id)} className="inline"><input type="hidden" name="status" value="IN_PRODUCTION" /><Submit className="btn ghost sm">In production</Submit></ActForm>}
                      {(p.status === 'ORDERED' || p.status === 'IN_PRODUCTION') && <ActForm action={setPOStatus.bind(null, p.id)} className="inline"><input type="hidden" name="status" value="DELIVERED" /><Submit className="btn sm">Mark received</Submit></ActForm>}
                      {inv && !inv.paidAt && <ActButton className="btn sm" action={markInvoicePaid.bind(null, inv.id)}>Mark paid</ActButton>}
                      {inv && inv.paidAt && !inv.pop && <UploadSlot action={uploadPop.bind(null, inv.id)} kind="POP" label="Upload POP" filled={false} />}
                    </div>
                    {!inv && p.status !== 'CANCELLED' && (
                      <details className="more" style={{ textAlign: 'left', marginTop: 6 }}>
                        <summary>Add LL invoice</summary>
                        <ActForm action={createInvoice}>
                          <input type="hidden" name="supplier" value="LL" /><input type="hidden" name="purchaseOrderId" value={p.id} />
                          <div className="grid2" style={{ marginTop: 6, minWidth: 260 }}>
                            <label className="field">Invoice number<input name="number" required /></label>
                            <label className="field">Amount (R)<input name="amount" inputMode="decimal" defaultValue={(p.totalCents / 100).toFixed(2)} required /></label>
                            <label className="field">Due date<input type="date" name="dueAt" /></label>
                            <label className="field">PDF<input type="file" name="file" accept="application/pdf,image/*" /></label>
                          </div>
                          <div className="btns" style={{ marginTop: 6 }}><Submit className="btn sm">Save invoice</Submit></div>
                        </ActForm>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
            {!pos.length && <tr><td colSpan={7} className="sub2">No purchase orders yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h3 className="h3">Covers & accessories stock</h3>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Product</th><th>SKU</th><th className="r">Unit cost</th><th className="r">On hand</th><th className="r">Reorder at</th><th className="r">For orders</th><th className="r">On order</th><th className="r">Available</th><th>Status</th><th /></tr></thead>
          <tbody>
            {stock.map((x) => {
              const st = x.available + x.onOrder < x.reorderLevel ? (x.available <= 0 ? ['bad', 'Out'] : ['warn', 'Reorder']) : ['ok', 'OK'];
              const fid = `p-${x.id}`;
              return (
                <tr key={x.id}>
                  <td><b>{x.name}</b></td><td className="mono">{x.sku}</td>
                  <td className="r"><input form={fid} name="unitCost" className="qty" defaultValue={(x.unitCostCents / 100).toFixed(0)} aria-label={`Unit cost ${x.name}`} /></td>
                  <td className="r"><input form={fid} name="onHand" type="number" className="qty" defaultValue={x.onHand} aria-label={`On hand ${x.name}`} /></td>
                  <td className="r"><input form={fid} name="reorderLevel" type="number" className="qty" defaultValue={x.reorderLevel} aria-label={`Reorder level ${x.name}`} /></td>
                  <td className="r num">{x.allocated}</td><td className="r num">{x.onOrder || '—'}</td><td className="r num"><b>{x.available}</b></td>
                  <td><Pill tone={st[0] as 'ok'}>{st[1]}</Pill></td>
                  <td className="r"><ActForm action={saveProduct.bind(null, x.id)} className="inline" id={fid}><Submit className="btn ghost sm">Save</Submit></ActForm></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details className="more" style={{ marginTop: 12 }}>
        <summary>Add an LL product</summary>
        <ActForm action={createProduct} resetOnOk>
          <input type="hidden" name="supplier" value="LL" />
          <div className="grid3" style={{ marginTop: 8 }}>
            <label className="field">Name<input name="name" placeholder="Canvas pot cover · No. 3" /></label>
            <label className="field">SKU (same as Shopify)<input name="sku" /></label>
            <label className="field">Unit cost (R)<input name="unitCost" inputMode="decimal" /></label>
            <label className="field">Reorder level<input name="reorderLevel" type="number" defaultValue={10} /></label>
          </div>
          <div className="btns" style={{ marginTop: 8 }}><Submit>Add product</Submit></div>
        </ActForm>
      </details>
      <p className="sub2">“For orders” is stock reserved for paid Shopify orders that haven’t shipped. Stock is matched to orders by SKU.</p>
    </main>
  );
}
