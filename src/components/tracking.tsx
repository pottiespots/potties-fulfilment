// Whether the customer was told about their tracking, and what to do if not.
import type { Order } from '@/lib/db/schema';
import { intlPhone, trackingMessage } from '@/lib/labels';
import { dayTime } from '@/lib/format';
import { Pill } from './ui';
import { ActButton } from './client';
import { recheckTrackingEmail } from '@/app/actions/hq';

type O = Pick<Order, 'id' | 'name' | 'customerName' | 'phone' | 'shopifyId' | 'shopifyFulfillmentId' | 'shopifySyncError' | 'trackingCompany' | 'trackingNumber' | 'trackingEmailStatus' | 'trackingEmailCheckedAt'>;

export type CustomerNotice = 'sent' | 'requested' | 'no_email' | 'not_in_shopify' | 'no_shopify_order';
export function customerNotice(o: O): CustomerNotice {
  if (!o.shopifyId) return 'no_shopify_order';
  if (!o.shopifyFulfillmentId) return 'not_in_shopify';
  return (o.trackingEmailStatus as CustomerNotice) ?? 'requested';
}

/** Small status pill for tables. */
export function NoticePill({ o }: { o: O }) {
  const n = customerNotice(o);
  if (n === 'sent') return <Pill tone="ok">Customer emailed</Pill>;
  if (n === 'no_email') return <Pill tone="warn">No customer email</Pill>;
  if (n === 'not_in_shopify') return <Pill tone="bad">Not in Shopify</Pill>;
  if (n === 'requested') return <Pill tone="info">Email requested</Pill>;
  return null;
}

/** HQ: full note with WhatsApp / SMS fallback when the customer was not emailed. */
export function CustomerNoticeHQ({ o }: { o: O }) {
  const n = customerNotice(o);
  const phone = intlPhone(o.phone);
  const msg = encodeURIComponent(trackingMessage(o));
  const fallback = phone && (
    <div className="btns" style={{ marginTop: 8 }}>
      <a className="btn sm" href={`https://wa.me/${phone}?text=${msg}`} target="_blank" rel="noreferrer">Send tracking by WhatsApp</a>
      <a className="btn ghost sm" href={`sms:+${phone}?body=${msg}`}>Send by SMS</a>
    </div>
  );
  const checked = o.trackingEmailCheckedAt ? ` Checked ${dayTime(o.trackingEmailCheckedAt)}.` : '';
  if (n === 'sent') return <div className="cnote ok">✓ Shopify emailed the customer their tracking (shipping confirmation).{checked}</div>;
  if (n === 'requested') return (
    <div className="cnote info">Shopify was asked to email the customer their tracking, but has not confirmed it was sent yet.{checked}
      <div className="btns" style={{ marginTop: 8 }}><ActButton className="btn ghost sm" action={recheckTrackingEmail.bind(null, o.id)}>Check with Shopify again</ActButton></div>
    </div>
  );
  if (n === 'no_email') return (
    <div className="cnote warn"><b>The customer did NOT get a tracking email.</b> This Shopify order has no email address for them.
      {phone ? ' Send the tracking another way:' : ' There is no phone number on the order either. Add an email to the order in Shopify and resend the shipping confirmation from there.'}
      {fallback}
    </div>
  );
  if (n === 'not_in_shopify') return (
    <div className="cnote bad"><b>The customer has NOT been notified.</b> The tracking did not reach Shopify{o.shopifySyncError ? `: ${o.shopifySyncError}` : ''}. Add the tracking in Shopify by hand, or send it to the customer directly.
      {fallback}
    </div>
  );
  return <div className="cnote info">This order is not from Shopify, so nobody was emailed automatically.{fallback}</div>;
}
