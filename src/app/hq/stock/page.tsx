import { requireRole } from '@/lib/auth';
import { productsWithStock } from '@/lib/data';
import { Pill } from '@/components/ui';
import { ActForm, Submit } from '@/components/client';
import { createProduct, saveProduct } from '@/app/actions/hq';

export const metadata = { title: 'Pot stock · Potties' };

export default async function Stock() {
  await requireRole('HQ');
  const stock = await productsWithStock('FOUNDRY');
  return (
    <main className="page">
      <div className="hello"><div><h2>Pot stock</h2><p>Potjie pots held at the foundry. Update the counts after each stock take. Reserved stock comes from open Shopify orders, matched by SKU.</p></div></div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Product</th><th>SKU</th><th className="r">On hand</th><th className="r">Being cast</th><th className="r">Reorder at</th><th className="r">For orders</th><th className="r">Available</th><th>Status</th><th /></tr></thead>
          <tbody>
            {stock.map((x) => {
              const st = x.available <= 0 ? ['bad', 'Out'] : x.available < x.reorderLevel ? ['warn', 'Low'] : ['ok', 'OK'];
              const fid = `p-${x.id}`;
              return (
                <tr key={x.id}>
                  <td><b>{x.name}</b></td><td className="mono">{x.sku}</td>
                  <td className="r"><input form={fid} name="onHand" type="number" className="qty" defaultValue={x.onHand} aria-label={`On hand ${x.name}`} /></td>
                  <td className="r"><input form={fid} name="inProduction" type="number" className="qty" defaultValue={x.inProduction} aria-label={`Being cast ${x.name}`} /></td>
                  <td className="r"><input form={fid} name="reorderLevel" type="number" className="qty" defaultValue={x.reorderLevel} aria-label={`Reorder level ${x.name}`} /></td>
                  <td className="r num">{x.allocated}</td><td className="r num"><b>{x.available}</b></td>
                  <td><Pill tone={st[0] as 'ok'}>{st[1]}</Pill></td>
                  <td className="r"><ActForm action={saveProduct.bind(null, x.id)} className="inline" id={fid}><Submit className="btn ghost sm">Save</Submit></ActForm></td>
                </tr>
              );
            })}
            {!stock.length && <tr><td colSpan={9} className="sub2">No pot products yet. Add them below.</td></tr>}
          </tbody>
        </table>
      </div>
      <details className="more" style={{ marginTop: 12 }}>
        <summary>Add a pot product</summary>
        <ActForm action={createProduct} resetOnOk>
          <input type="hidden" name="supplier" value="FOUNDRY" />
          <div className="grid3" style={{ marginTop: 8 }}>
            <label className="field">Name<input name="name" placeholder="No. 3 Potjie · 7.8 L" /></label>
            <label className="field">SKU (same as Shopify)<input name="sku" /></label>
            <label className="field">Reorder level<input name="reorderLevel" type="number" defaultValue={5} /></label>
          </div>
          <div className="btns" style={{ marginTop: 8 }}><Submit>Add product</Submit></div>
        </ActForm>
      </details>
    </main>
  );
}
