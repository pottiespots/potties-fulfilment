import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from './db';
import { logEvent } from './data';
import { removeFile } from './storage';

export type RemoveResult = { removed: string[]; keptWithPop: string[]; notFound: string[] };

/**
 * Deletes supplier invoices by number (the COGS sheet's "8. Invoices" is the source of truth).
 * Invoices with a proof of payment are kept unless `force` is set, because the POP is evidence of a real payment.
 */
export async function removeInvoices(numbers: string[], actor: string, opts: { force?: boolean; reason?: string } = {}): Promise<RemoveResult> {
  const wanted = [...new Set(numbers.map((n) => n.trim()).filter(Boolean))];
  const out: RemoveResult = { removed: [], keptWithPop: [], notFound: [] };
  if (!wanted.length) return out;
  const invs = await db.select().from(schema.supplierInvoices).where(inArray(schema.supplierInvoices.number, wanted));
  out.notFound = wanted.filter((n) => !invs.some((i) => i.number === n));
  for (const inv of invs) {
    const files = await db.select().from(schema.orderFiles).where(eq(schema.orderFiles.invoiceId, inv.id));
    if (!opts.force && files.some((f) => f.kind === 'POP')) { out.keptWithPop.push(inv.number); continue; }
    for (const f of files) { try { await removeFile(f.storageKey); } catch { /* a leftover stored file is harmless */ } }
    await db.delete(schema.orderFiles).where(eq(schema.orderFiles.invoiceId, inv.id));
    await db.delete(schema.supplierInvoices).where(and(eq(schema.supplierInvoices.id, inv.id)));
    if (inv.orderId) {
      await logEvent({ orderId: inv.orderId, actor, text: `Invoice ${inv.number} removed${opts.reason ? `: ${opts.reason}` : ''}`, internal: true });
    }
    out.removed.push(inv.number);
  }
  return out;
}
