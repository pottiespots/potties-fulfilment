import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { getOrder, gateInput } from '@/lib/data';
import { FOUNDRY_LABEL, FOUNDRY_SETTABLE, canAddTracking, packedBlockers, money } from '@/lib/rules';
import { dayTime } from '@/lib/format';
import { KIND_LABEL, PHOTO_SLOTS, COURIERS, NOTE_PRESETS } from '@/lib/labels';
import { acceptOrder, askQuestion, setFoundryStage, setCheck, uploadOrderFile, addNote, addTracking, deleteOrderFile } from '@/app/actions/orders';
import { ShipTo, Timeline, addressText, Pill, Checklist } from '@/components/ui';
import { foundryChecklist, foundryComplete } from '@/lib/checklist';
import { ActButton, ActForm, CheckToggle, CopyButton, NoteBox, Submit, UploadSlot } from '@/components/client';
import { FileThumbs } from '@/components/files';

const STEP_HINT: Record<string, string> = { ACCEPTED: 'Order confirmed', MANUFACTURING: 'Casting & finishing', PACKING: 'Boxing it up', PACKED: 'Ready for courier' };

export default async function FoundryOrder({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('FOUNDRY');
  const { id } = await params;
  const o = await getOrder(id, 'FOUNDRY');
  if (!o) notFound();
  const now = new Date();
  const g = gateInput(o);
  const blockers = packedBlockers(g);
  const custom = o.lines.filter((l) => l.customText);
  const editable = ['ACCEPTED', 'MANUFACTURING', 'PACKING'].includes(o.stage);
  const track = canAddTracking(g, process.env.REQUIRE_HQ_PROOF_APPROVAL === 'true');
  const slotKinds = PHOTO_SLOTS.filter((k) => k !== 'PHOTO_CUSTOM' || custom.length);
  const upload = uploadOrderFile.bind(null, o.id);
  const docs = o.files.filter((f) => f.kind === 'WAYBILL' || f.kind === 'ARTWORK');
  const steps = foundryChecklist({ ...g, acceptedAt: o.acceptedAt, packedAt: o.packedAt, shippedAt: o.shippedAt, trackingNumber: o.trackingNumber });
  const complete = foundryComplete(o);

  return (
    <main className="page fpage">
      <Link href="/f" className="back">← My orders</Link>
      <div className="ohead">
        <div><h1>{o.name} · {o.customerName}</h1><div className="sub">{FOUNDRY_LABEL[o.stage]}</div></div>
      </div>

      <div className="fgrid">
      <aside className="fside">
        {o.stage !== 'CANCELLED' && <Checklist steps={steps} complete={complete} shippedAt={o.shippedAt} shipBy={o.shipBy} now={now} />}
      </aside>
      <div className="stack fmain">
        <section className="sec">
          <h4>Ship to <CopyButton text={addressText(o)} /></h4>
          <ShipTo o={o} now={now} />
          {o.addressEditedAt && !['SHIPPED', 'DELIVERED', 'CANCELLED'].includes(o.stage) && <div className="flash warn" style={{ marginTop: 10 }}>Potties HQ changed this address on {dayTime(o.addressEditedAt)}. Use this address and the latest packing slip, not an older printout.</div>}
        </section>

        {o.stage === 'SENT' && (
          <section className="sec action" id="status">
            <h4>Step 1 · Accept this order</h4>
            <p style={{ margin: '0 0 12px', fontSize: 14 }}>Check the packing slip and customisation. Accepting confirms it will be ready for the courier by <b>{dayTime(o.shipBy)}</b>.</p>
            <div className="btns"><ActButton action={acceptOrder.bind(null, o.id)}>Accept order</ActButton></div>
            <details className="more" style={{ marginTop: 12 }}>
              <summary>I have a question first</summary>
              <ActForm action={askQuestion.bind(null, o.id)} resetOnOk>
                <label className="field" style={{ marginTop: 8 }}>Your question for Potties HQ<textarea name="question" rows={2} /></label>
                <div className="btns" style={{ marginTop: 8 }}><Submit className="btn ghost">Send question</Submit></div>
              </ActForm>
            </details>
          </section>
        )}

        {['ACCEPTED', 'MANUFACTURING', 'PACKING', 'PACKED'].includes(o.stage) && (
          <section className="sec action" id="status">
            <h4>Update status</h4>
            <ActForm action={setFoundryStage.bind(null, o.id)}>
              <div className="statusgrid">
                {FOUNDRY_SETTABLE.map((s) => (
                  <button key={s} name="to" value={s} className="sbtn" aria-pressed={o.stage === s}
                    disabled={s === 'PACKED' && blockers.length > 0 && o.stage !== 'PACKED'}>
                    {FOUNDRY_LABEL[s].split(',')[0]}<small>{STEP_HINT[s]}</small>
                  </button>
                ))}
              </div>
              {o.stage !== 'PACKED' && blockers.length > 0 && <div className="gate">To mark Packed: {blockers.join(', ')}.</div>}
            </ActForm>
            <div className="btns" style={{ marginTop: 10 }}><a className="btn ghost sm" href="#notes">Report a problem or delay</a></div>
          </section>
        )}

        {o.openQuestion && <div className="flash ok">Your question is with Potties HQ: “{o.openQuestion}”</div>}

        <section className="sec" id="make">
          <h4>What to make</h4>
          <div className="makebox">
            {o.lines.map((l) => (
              <div key={l.id} style={{ marginBottom: 8 }}>
                {l.title}{l.variant ? ` · ${l.variant}` : ''} · <b>Qty {l.quantity}</b>{l.sku && <span className="sub2"> · {l.sku}</span>}
                {l.customText && <div className="custom-big"><span>{l.customType}: must read exactly</span><b>{l.customText}</b></div>}
              </div>
            ))}
          </div>
          {(editable || o.stage === 'PACKED') && (
            <div style={{ marginTop: 12 }}>
              {custom.length > 0 && (
                <CheckToggle action={setCheck.bind(null, o.id, 'foundryCustomChecked')} checked={o.foundryCustomChecked} disabled={!editable}>
                  I checked the customisation: it reads exactly {custom.map((l) => <b key={l.id}>“{l.customText}” </b>)}
                </CheckToggle>
              )}
              <CheckToggle action={setCheck.bind(null, o.id, 'slipInBox')} checked={o.slipInBox} disabled={!editable}>Packing slip is in the box</CheckToggle>
            </div>
          )}
        </section>

        <section className="sec">
          <h4>Downloads</h4>
          <div className="docs">
            <div className="doc"><span className="n"><span className="ft">PDF</span>Packing slip {o.name}</span><a className="btn sm" href={`/api/orders/${o.id}/packing-slip`} target="_blank" rel="noreferrer">Download</a></div>
            {docs.map((f) => (
              <div className="doc" key={f.id}><span className="n"><span className="ft">{f.mime === 'application/pdf' ? 'PDF' : 'IMG'}</span>{KIND_LABEL[f.kind]}</span><a className="btn ghost sm" href={`/api/files/${f.id}`}>Download</a></div>
            ))}
          </div>
        </section>

        <section className="sec" id="proof">
          <h4>Upload proof <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>photos or PDF · * needed to mark Packed</span></h4>
          <div className="photos">
            {slotKinds.map((k) => {
              const latest = [...o.files].reverse().find((f) => f.kind === k);
              return <UploadSlot key={k} action={upload} kind={k} label={KIND_LABEL[k]} filled={!!latest} required={k === 'PHOTO_PACKED'}
                previewUrl={latest && latest.mime.startsWith('image/') ? `/api/files/${latest.id}` : null} disabled={o.stage === 'SHIPPED' || o.stage === 'DELIVERED'} />;
            })}
          </div>
          <FileThumbs files={o.files.filter((f) => f.kind.startsWith('PHOTO_') || f.kind === 'OTHER')} remove={!['SHIPPED', 'DELIVERED', 'CANCELLED'].includes(o.stage) ? deleteOrderFile.bind(null, o.id) : undefined} />
        </section>

        <section className={`sec ${o.stage === 'PACKED' ? 'action' : ''}`} id="tracking">
          <h4>Tracking number</h4>
          {o.trackingNumber ? (
            <div className="sent-ok">{o.trackingCompany} · <span className="mono">{o.trackingNumber}</span><br />{o.shopifyFulfillmentId ? 'Sent to Shopify. The customer has their tracking link.' : 'Saved. Potties HQ will make sure the customer gets it.'}</div>
          ) : track.ok ? (
            <ActForm action={addTracking.bind(null, o.id)}>
              <p style={{ margin: '0 0 10px', fontSize: 14 }}>When the courier collects, type the waybill number. It goes straight to Shopify and the customer gets a tracking email.</p>
              <div className="grid2">
                <label className="field">Courier<select name="courier" defaultValue={o.courier && COURIERS.includes(o.courier) ? o.courier : COURIERS[0]}>{COURIERS.map((c) => <option key={c}>{c}</option>)}</select></label>
                <label className="field">Tracking / waybill number<input name="tracking" autoComplete="off" placeholder="e.g. TCG8841207" required /></label>
              </div>
              <div className="btns" style={{ marginTop: 10 }}><Submit>Save & send to customer</Submit></div>
            </ActForm>
          ) : <p className="kv" style={{ margin: 0 }}>{track.reason}</p>}
        </section>

        <section className="sec" id="notes">
          <h4>Notes & history</h4>
          <NoteBox action={addNote.bind(null, o.id)} presets={NOTE_PRESETS} />
          <Timeline events={o.events} />
        </section>

        <div style={{ padding: '0 4px', fontSize: 13, color: 'var(--muted)' }}>
          Your invoice: {o.invoice ? <>{o.invoice.number} · {money(o.invoice.amountCents)} · {o.invoice.paidAt ? <Pill tone="ok">Paid</Pill> : <Pill tone="warn">Awaiting payment</Pill>}</> : 'not received yet'}
        </div>
      </div>
      </div>
    </main>
  );
}
