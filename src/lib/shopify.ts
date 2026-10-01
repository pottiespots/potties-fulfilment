import 'server-only';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { courierFromShippingTitle, defaultShipBy, detectCustomisation } from './rules';
import { logEvent } from './data';

const domain = () => process.env.SHOPIFY_STORE_DOMAIN;
const token = () => process.env.SHOPIFY_ADMIN_TOKEN;
const version = () => process.env.SHOPIFY_API_VERSION || '2026-07';
export const shopifyConfigured = () => Boolean(domain() && token());

export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!shopifyConfigured()) throw new Error('Shopify is not connected. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN.');
  const res = await fetch(`https://${domain()}/admin/api/${version()}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token()! },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`Shopify error: ${JSON.stringify(json.errors ?? json).slice(0, 300)}`);
  return json.data as T;
}

/** Verifies the X-Shopify-Hmac-Sha256 header against the raw request body. */
export function verifyWebhook(rawBody: string, hmacHeader: string | null): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret || !hmacHeader) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const a = Buffer.from(digest), b = Buffer.from(hmacHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const ORDER_FIELDS = `
  id name createdAt cancelledAt email phone note
  displayFinancialStatus displayFulfillmentStatus
  customer { firstName lastName }
  shippingAddress { name firstName lastName company address1 address2 city province zip country phone }
  shippingLine { title }
  lineItems(first: 50) { nodes { id title variantTitle sku quantity requiresShipping customAttributes { key value } } }
`;

type ShopifyOrder = {
  id: string; name: string; createdAt: string; cancelledAt: string | null; email: string | null; phone: string | null; note: string | null;
  displayFinancialStatus: string | null; displayFulfillmentStatus: string;
  customer: { firstName: string | null; lastName: string | null } | null;
  shippingAddress: { name: string | null; company: string | null; address1: string | null; address2: string | null; city: string | null; province: string | null; zip: string | null; country: string | null; phone: string | null } | null;
  shippingLine: { title: string } | null;
  lineItems: { nodes: { id: string; title: string; variantTitle: string | null; sku: string | null; quantity: number; requiresShipping: boolean; customAttributes: { key: string; value: string }[] }[] };
};

/** Creates or updates one order from Shopify. Never moves an order backwards in our pipeline. */
export async function upsertShopifyOrder(o: ShopifyOrder): Promise<'created' | 'updated' | 'skipped'> {
  const paid = ['PAID', 'PARTIALLY_REFUNDED'].includes(o.displayFinancialStatus ?? '');
  const [existing] = await db.select().from(schema.orders).where(eq(schema.orders.shopifyId, o.id));

  if (o.cancelledAt) {
    if (existing && existing.stage !== 'CANCELLED') {
      await db.update(schema.orders).set({ stage: 'CANCELLED', updatedAt: new Date() }).where(eq(schema.orders.id, existing.id));
      await logEvent({ orderId: existing.id, actor: 'Shopify', text: 'Order cancelled in Shopify' });
      return 'updated';
    }
    return 'skipped';
  }
  // Only paid orders that still need shipping enter the pipeline.
  if (!existing && (!paid || o.displayFulfillmentStatus === 'FULFILLED')) return 'skipped';

  const a = o.shippingAddress;
  const addr = {
    customerName: a?.name || [o.customer?.firstName, o.customer?.lastName].filter(Boolean).join(' ') || 'Customer',
    email: o.email, phone: a?.phone || o.phone,
    address1: [a?.company, a?.address1].filter(Boolean).join(', ') || null, address2: a?.address2 ?? null,
    city: a?.city ?? null, province: a?.province ?? null, zip: a?.zip ?? null, country: a?.country ?? null,
    deliveryNote: o.note,
  };

  if (existing) {
    // Address/notes can change in Shopify until the foundry has packed the order.
    if (['NEW', 'SENT', 'ACCEPTED', 'MANUFACTURING', 'PACKING'].includes(existing.stage)) {
      await db.update(schema.orders).set({ ...addr, updatedAt: new Date() }).where(eq(schema.orders.id, existing.id));
    }
    return 'updated';
  }

  const placedAt = new Date(o.createdAt);
  const { courier, service } = courierFromShippingTitle(o.shippingLine?.title);
  const lead = Number(process.env.DEFAULT_LEAD_DAYS || 7);
  const [row] = await db.insert(schema.orders).values({
    shopifyId: o.id, name: o.name, placedAt, ...addr, courier, courierService: service,
    shipBy: defaultShipBy(placedAt, lead),
  }).onConflictDoNothing().returning();
  if (!row) return 'skipped'; // created concurrently by a webhook

  const lines = o.lineItems.nodes.filter((l) => l.requiresShipping && l.quantity > 0);
  if (lines.length) {
    await db.insert(schema.lineItems).values(lines.map((l) => {
      const c = detectCustomisation(l.customAttributes);
      return {
        orderId: row.id, shopifyLineId: l.id, title: l.title, variant: l.variantTitle, sku: l.sku, quantity: l.quantity,
        customType: c?.type ?? null, customText: c?.text ?? null, properties: l.customAttributes,
      };
    }));
  }
  await logEvent({ orderId: row.id, actor: 'Shopify', text: 'Order paid and synced from Shopify' });
  return 'created';
}

export async function fetchOrder(gid: string) {
  const data = await gql<{ order: ShopifyOrder | null }>(`query($id: ID!) { order(id: $id) { ${ORDER_FIELDS} } }`, { id: gid });
  return data.order;
}

/** Pulls recent paid, unfulfilled orders. Used by "Sync Shopify now" and the scheduled job. */
export async function syncRecentOrders(days = 60) {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const q = `created_at:>=${since} financial_status:paid -fulfillment_status:fulfilled`;
  let after: string | null = null;
  const counts = { created: 0, updated: 0, skipped: 0 };
  for (let page = 0; page < 10; page++) {
    const data: { orders: { nodes: ShopifyOrder[]; pageInfo: { hasNextPage: boolean; endCursor: string } } } = await gql(
      `query($q: String!, $after: String) { orders(first: 50, query: $q, after: $after, sortKey: CREATED_AT) {
        nodes { ${ORDER_FIELDS} } pageInfo { hasNextPage endCursor } } }`, { q, after });
    for (const o of data.orders.nodes) counts[await upsertShopifyOrder(o)]++;
    if (!data.orders.pageInfo.hasNextPage) break;
    after = data.orders.pageInfo.endCursor;
  }
  return counts;
}

/** Marks all open fulfillment orders as fulfilled with tracking; Shopify emails the customer. */
export async function pushTracking(shopifyOrderId: string, company: string, number: string): Promise<string> {
  const data = await gql<{ order: { fulfillmentOrders: { nodes: { id: string; status: string }[] } } }>(
    `query($id: ID!) { order(id: $id) { fulfillmentOrders(first: 10) { nodes { id status } } } }`, { id: shopifyOrderId });
  const open = data.order.fulfillmentOrders.nodes.filter((f) => ['OPEN', 'IN_PROGRESS', 'SCHEDULED'].includes(f.status));
  if (!open.length) throw new Error('Shopify has no open fulfilment for this order (already fulfilled?).');
  const res = await gql<{ fulfillmentCreate: { fulfillment: { id: string } | null; userErrors: { message: string }[] } }>(
    `mutation($f: FulfillmentInput!) { fulfillmentCreate(fulfillment: $f) { fulfillment { id } userErrors { message } } }`,
    { f: { notifyCustomer: true, trackingInfo: { company, number }, lineItemsByFulfillmentOrder: open.map((f) => ({ fulfillmentOrderId: f.id })) } });
  if (res.fulfillmentCreate.userErrors.length) throw new Error(res.fulfillmentCreate.userErrors.map((e) => e.message).join('; '));
  return res.fulfillmentCreate.fulfillment!.id;
}

/** Link to the order in Shopify admin. */
export function adminUrl(shopifyId: string | null) {
  if (!shopifyId || !domain()) return null;
  return `https://${domain()}/admin/orders/${shopifyId.split('/').pop()}`;
}
