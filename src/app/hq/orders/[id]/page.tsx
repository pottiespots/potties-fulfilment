import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { getOrder } from '@/lib/data';
import { STAGES, STAGE_LABEL, isOpen, money } from '@/lib/rules';
import { dayTime, toLocalInput } from '@/lib/format';
import { KIND_LABEL, PHOTO_SLOTS, COURIERS } from '@/lib/labels';
import { adminUrl } from '@/lib/shopify';
import { uploadOrderFile, addNote, addTracking } from '@/app/actions/orders';
import {
  sendToFoundry, chaseFoundry, approveProof, requestRetake, answerQuestion, changeShipBy, editAddress, resetAddress, hqSetStage, markDelivered, createInvoice, markInvoicePaid, uploadPop,
} from '@/app/actions/hq';
import { ShipTo, Stepper, Timeline, addressText, Pill } from '@/components/ui';
import { ActButton, ActForm, CopyButton, NoteBox, Submit, UploadSlot } from '@/components/client';
import { FileThumbs } from '@/components/files';

export default async function HQOrder({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('HQ');
  const { id } = await params;
  const o = await getOrder(id, 'HQ');
  if (!o) notFound();
  const now = new Date();
  const custom = o.lines.filter((l) => l.customText);
  const photosReady = o.fileKinds.includes('PHOTO_PRODUCT') && o.fileKinds.includes('PHOTO_PACKED') && (!custom.length || o.fileKinds.includes('PHOTO_CUSTOM'));
  const upload = uploadOrderFile.bind(null, o.id);
  const shopify = adminUrl(o.shopifyId);
  const invFile = o.invoice ? o.files.find((f) => f.invoiceId === o.invoice!.id && f.kind === 'INVOICE') : null;

  let next: React.ReactNode = null;
  if (o.stage === 'NEW') {
    next = (
      <section className="sec action">
        <h4>Next · check and send to foundry</h4>
        <ActForm action={sendToFoundry.bind(null, o.id)}>
          {custom.map((l) => (
            <label key={l.id} className="field" style={{ marginBottom: 10 }}>{l.customType} on {l.title} (exactly as the foundry will cast it)
              <input name={`custom_${l.id}`} defaultValue={l.customText ?? ''} />
            </label>
          ))}
          <div className="grid2">
            <label className="field">Ship-by date<input type="datetime-local" name="shipBy" defaultValue={toLocalInput(o.shipBy)} /></label>
            <label className="field">Courier<select name="courier" defaultValue={o.courier ?? COURIERS[0]}>{[...new Set([o.courier, ...COURIERS].filter(Boolean))].map((c) => <option key={c!}>{c}</option>)}</select></label>
          </div>
          <label className="check" style={{ marginTop: 6 }}><input type="checkbox" name="confirm" /><span>I checked the customisation and address against the Shopify order</span></label>
          <div className="btns" style={{ marginTop: 8 }}><Submit>Send to foundry with packing slip</Submit></div>
        </ActForm>
      </section>
    );
  } else if (o.openQuestion) {
    next = (
      <section className="sec action">
        <h4>Foundry asked a question</h4>
        <p style={{ margin: '0 0 10px', fontSize: 15 }}>“{o.openQuestion}”</p>
        <ActForm action={answerQuestion.bind(null, o.id)}>
          <label className="field">Your reply<textarea name="reply" rows={2} /></label>
          <div className="btns" style={{ marginTop: 8 }}><Submit>Send reply</Submit></div>
        </ActForm>
      </section>
    );
  } else if (o.stage === 'PACKED' && !o.proofApprovedAt) {
    next = (
      <section className="sec action">
        <h4>Next · approve the proof before it ships</h4>
        <p style={{ margin: '0 0 10px', fontSize: 14 }}>{custom.length ? <>Check the photos show {custom.map((l) => <b key={l.id}>“{l.customText}” </b>)}exactly.</> : 'Check the product and packed box photos.'}</p>
        <div className="btns">
          {photosReady ? <ActButton action={approveProof.bind(null, o.id)}>Approve proof</ActButton> : <span className="gate" style={{ marginTop: 0 }}>Waiting for the foundry to upload the required photos.</span>}
        </div>
        <details className="more" style={{ marginTop: 10 }}>
          <summary>Ask for new photos</summary>
          <ActForm action={requestRetake.bind(null, o.id)}>
            <label className="field" style={{ marginTop: 8 }}>What’s wrong?<input name="reason" placeholder="e.g. Lid close-up is blurry" /></label>
            <div className="btns" style={{ marginTop: 8 }}><Submit className="btn ghost">Send to foundry</Submit></div>
          </ActForm>
        </details>
      </section>
    );
  } else if (isOpen(o.stage)) {
    next = (
      <section className="sec action">
        <h4>With the foundry · {STAGE_LABEL[o.stage]}</h4>
        <div className="btns">
          <ActButton className="btn ghost" action={chaseFoundry.bind(null, o.id)}>Chase foundry</ActButton>
          {o.stage === 'PACKED' && <span className="kv">Proof approved. Waiting for courier and tracking.</span>}
        </div>
      </section>
    );
  } else if (o.stage === 'SHIPPED') {
    next = (
      <section className="sec action">
        <h4>In transit</h4>
        <p style={{ margin: '0 0 10px', fontSize: 14 }}>{o.trackingCompany} · <span className="mono">{o.trackingNumber}</span>. Marked delivered automatically when Shopify reports delivery.</p>
        <ActButton className="btn ghost" action={markDelivered.bind(null, o.id)} confirm="Mark this order delivered?">Mark delivered</ActButton>
      </section>
    );
  }

  return (
    <main className="page narrow">
      <Link href="/hq/orders" className="back">← Foundry orders</Link>
      <div className="ohead">
        <div><h1>{o.name} · {o.customerName}</h1><div className="sub">Placed {dayTime(o.placedAt)}{o.email ? ` · ${o.email}` : ''}</div></div>
        <div className="btns">{shopify && <a className="btn ghost sm" href={shopify} target="_blank" rel="noreferrer">Open in Shopify</a>}<a className="btn ghost sm" href={`/api/orders/${o.id}/packing-slip`} target="_blank" rel="noreferrer">Packing slip</a></div>
      </div>
      <Stepper stage={o.stage} />

      <div className="stack">
        {o.shopifySyncError && o.stage === 'SHIPPED' && !o.shopifyFulfillmentId && (
          <div className="flash err">Tracking did not reach Shopify: {o.shopifySyncError}. Add the tracking in Shopify by hand, then mark delivered here.</div>
        )}
        {next}

        <section className="sec">
          <h4>Ship to <CopyButton text={addressText(o)} /></h4>
          <ShipTo o={o} now={now} extra={isOpen(o.stage) && o.stage !== 'NEW' ? (
            <ActForm action={changeShipBy.bind(null, o.id)}>
              <div className="btns"><input name="shipBy" type="datetime-local" defaultValue={toLocalInput(o.shipBy)} className="search" style={{ width: 'auto' }} aria-label="New ship-by date" /><Submit className="btn ghost sm">Change date</Submit></div>
            </ActForm>
          ) : null} />
          {o.addressEditedAt && (
            <div className="btns" style={{ marginTop: 10, alignItems: 'center' }}>
              <Pill tone="warn">Address changed by {o.addressEditedBy ?? 'HQ'} on {dayTime(o.addressEditedAt)}. Shopify updates won’t overwrite it.</Pill>
              {isOpen(o.stage) && o.shopifyData?.shippingAddress && <ActButton action={resetAddress.bind(null, o.id)} className="btn ghost sm">Use Shopify address again</ActButton>}
            </div>
          )}
          {isOpen(o.stage) && (
            <details className="more" style={{ marginTop: 12 }}>
              <summary>Change shipping address</summary>
              <ActForm action={editAddress.bind(null, o.id)}>
                <div className="grid2" style={{ marginTop: 10 }}>
                  <label className="field">Name on parcel<input name="customerName" defaultValue={o.customerName} required /></label>
                  <label className="field">Phone for the courier<input name="phone" defaultValue={o.phone ?? ''} /></label>
                  <label className="field">Street address (company, street)<input name="address1" defaultValue={o.address1 ?? ''} required /></label>
                  <label className="field">Suburb, unit or building<input name="address2" defaultValue={o.address2 ?? ''} /></label>
                  <label className="field">Town / city<input name="city" defaultValue={o.city ?? ''} required /></label>
                  <label className="field">Postal code<input name="zip" defaultValue={o.zip ?? ''} /></label>
                  <label className="field">Province<input name="province" defaultValue={o.province ?? ''} /></label>
                  <label className="field">Country<input name="country" defaultValue={o.country ?? 'South Africa'} required /></label>
                </div>
                <label className="field" style={{ marginTop: 10 }}>Delivery note (shown to the foundry and courier)<textarea name="deliveryNote" rows={2} defaultValue={o.deliveryNote ?? ''} /></label>
                <label className="field" style={{ marginTop: 10 }}>Why it changed (optional, sent to the foundry)<input name="note" placeholder="e.g. Customer asked to deliver to their office" /></label>
                <p className="sub2" style={{ margin: '8px 0' }}>The packing slip updates straight away{o.stage !== 'NEW' ? ' and the foundry is told about the new address' : ''}. This changes the address in the Order Desk only, not in Shopify.</p>
                <div className="btns"><Submit>Save new address</Submit></div>
              </ActForm>
            </details>
          )}
        </section>

        <div className="two">
          <section className="sec">
            <h4>Items & customisation</h4>
            <div className="makebox">
              {o.lines.map((l) => (
                <div key={l.id} style={{ marginBottom: 8 }}>
                  {l.title}{l.variant ? ` · ${l.variant}` : ''} · <b>Qty {l.quantity}</b>{l.sku && <span className="sub2"> · {l.sku}</span>}
                  {l.customText && <div className="custom-big"><span>{l.customType}</span><b>{l.customText}</b></div>}
                </div>
              ))}
            </div>
            {custom.length > 0 && (
              <div className="ticks" style={{ marginTop: 10 }}>
                <span className={`tick ${o.hqCustomChecked ? 'on' : ''}`}>HQ checked</span>
                <span className={`tick ${o.foundryCustomChecked ? 'on' : ''}`}>Foundry checked</span>
                <span className={`tick ${o.proofApprovedAt ? 'on' : ''}`}>Proof approved</span>
              </div>
            )}
          </section>
          <section className="sec">
            <h4>Documents for the foundry</h4>
            <div className="docs">
              <div className="doc"><span className="n"><span className="ft">PDF</span>Packing slip (Shopify layout)</span><a className="btn ghost sm" href={`/api/orders/${o.id}/packing-slip`} target="_blank" rel="noreferrer">Download</a></div>
              {o.files.filter((f) => f.kind === 'WAYBILL' || f.kind === 'ARTWORK').map((f) => (
                <div className="doc" key={f.id}><span className="n"><span className="ft">{f.mime === 'application/pdf' ? 'PDF' : 'IMG'}</span>{KIND_LABEL[f.kind]}</span><a className="btn ghost sm" href={`/api/files/${f.id}`}>View</a></div>
              ))}
            </div>
            <div className="photos" style={{ marginTop: 10 }}>
              <UploadSlot action={upload} kind="WAYBILL" label="Add courier waybill" filled={false} />
              <UploadSlot action={upload} kind="ARTWORK" label="Add lid / engraving artwork" filled={false} />
            </div>
          </section>
        </div>

        <section className="sec">
          <h4>Proof from foundry {o.proofApprovedAt ? <Pill tone="ok">Approved</Pill> : photosReady ? <Pill tone="warn">Review</Pill> : <Pill>Waiting</Pill>}</h4>
          <div className="photos">
            {PHOTO_SLOTS.filter((k) => k !== 'PHOTO_CUSTOM' || custom.length).map((k) => {
              const latest = [...o.files].reverse().find((f) => f.kind === k);
              return <UploadSlot key={k} action={upload} kind={k} label={KIND_LABEL[k]} filled={!!latest} previewUrl={latest && latest.mime.startsWith('image/') ? `/api/files/${latest.id}` : null} />;
            })}
          </div>
          <FileThumbs files={o.files.filter((f) => f.kind.startsWith('PHOTO_') || f.kind === 'OTHER')} />
        </section>

        <section className="sec">
          <h4>Tracking</h4>
          {o.trackingNumber ? (
            <div className="sent-ok">{o.trackingCompany} · <span className="mono">{o.trackingNumber}</span> · {o.shopifyFulfillmentId ? 'sent to Shopify, customer notified' : 'saved here only'}</div>
          ) : o.stage === 'PACKED' ? (
            <ActForm action={addTracking.bind(null, o.id)}>
              <p className="kv" style={{ margin: '0 0 8px' }}>The foundry adds this on collection. You can add it here if they email it to you.</p>
              <div className="grid2">
                <label className="field">Courier<select name="courier" defaultValue={o.courier && COURIERS.includes(o.courier) ? o.courier : COURIERS[0]}>{COURIERS.map((c) => <option key={c}>{c}</option>)}</select></label>
                <label className="field">Tracking number<input name="tracking" autoComplete="off" required /></label>
              </div>
              <div className="btns" style={{ marginTop: 8 }}><Submit>Save & send to customer</Submit></div>
            </ActForm>
          ) : <div className="kv">Added once the order is packed and collected.</div>}
        </section>

        <section className="sec">
          <h4>Foundry invoice & payment {o.invoice ? (o.invoice.paidAt ? <Pill tone="ok">Paid</Pill> : <Pill tone="warn">Unpaid</Pill>) : <Pill>No invoice yet</Pill>}</h4>
          {o.invoice ? (
            <>
              <div className="docs">
                <div className="doc"><span className="n"><span className="ft">XERO</span>Invoice {o.invoice.number} · <b className="num">{money(o.invoice.amountCents)}</b> · due {dayTime(o.invoice.dueAt).split(',').slice(0, 2).join(',')}</span>{invFile && <a className="btn ghost sm" href={`/api/files/${invFile.id}`}>View</a>}</div>
                <div className="doc">
                  <span className="n"><span className="ft">POP</span>{o.invoicePop ? 'Proof of payment attached' : 'Proof of payment'}</span>
                  {!o.invoicePop && <UploadSlot action={uploadPop.bind(null, o.invoice.id)} kind="POP" label="Upload POP" filled={false} />}
                </div>
              </div>
              {!o.invoice.paidAt && <div className="btns" style={{ marginTop: 10 }}><ActButton action={markInvoicePaid.bind(null, o.invoice.id)}>Mark invoice paid</ActButton></div>}
            </>
          ) : (
            <details className="more">
              <summary>Attach the foundry’s Xero invoice</summary>
              <ActForm action={createInvoice}>
                <input type="hidden" name="supplier" value="FOUNDRY" /><input type="hidden" name="orderId" value={o.id} />
                <div className="grid2" style={{ marginTop: 8 }}>
                  <label className="field">Invoice number<input name="number" required /></label>
                  <label className="field">Amount (R)<input name="amount" inputMode="decimal" required /></label>
                  <label className="field">Invoice date<input type="date" name="issuedAt" /></label>
                  <label className="field">Due date<input type="date" name="dueAt" /></label>
                  <label className="field">Invoice PDF<input type="file" name="file" accept="application/pdf,image/*" /></label>
                </div>
                <div className="btns" style={{ marginTop: 8 }}><Submit>Save invoice</Submit></div>
              </ActForm>
            </details>
          )}
        </section>

        <section className="sec">
          <h4>Notes & history</h4>
          <NoteBox action={addNote.bind(null, o.id)} presets={['Called customer', 'Customer asked for update', 'Courier booked', 'Problem / delay: ']} allowInternal />
          <Timeline events={o.events} showInternal />
        </section>

        <details className="more">
          <summary>Correct the stage by hand</summary>
          <ActForm action={hqSetStage.bind(null, o.id)}>
            <div className="btns" style={{ marginTop: 8 }}>
              <select name="to" defaultValue={o.stage} className="search" style={{ width: 'auto' }} aria-label="Stage">
                {[...STAGES, 'CANCELLED' as const].map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
              </select>
              <Submit className="btn ghost sm">Move order</Submit>
            </div>
            <p className="sub2">Only for fixing mistakes. The change is recorded in the history.</p>
          </ActForm>
        </details>
      </div>
    </main>
  );
}
