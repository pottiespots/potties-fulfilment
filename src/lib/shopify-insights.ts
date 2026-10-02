// Sales, cash received and site traffic from Shopify for the HQ dashboard.
// Results are cached in the settings table for 15 minutes so the dashboard stays fast.
import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { gql, shopifyConfigured } from './shopify';
import { periodFor, summariseSales, type InsightRange, type ShopifyOrderLite, type SalesSummary, type Traffic } from './insights-calc';

export type { InsightRange, SalesSummary, Traffic } from './insights-calc';

const TTL = 15 * 60 * 1000;
const MAX_PAGES = 40; // 2 000 orders, far more than two months of Potties orders

async function cached<T>(key: string, load: () => Promise<T>, force = false): Promise<T> {
  if (!force) {
    const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
    if (row && Date.now() - row.updatedAt.getTime() < TTL) return JSON.parse(row.value) as T;
  }
  const value = await load();
  const json = JSON.stringify(value);
  await db.insert(schema.settings).values({ key, value: json, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: json, updatedAt: new Date() } });
  return value;
}

const ORDER_QUERY = `query($q: String!, $after: String) {
  orders(first: 50, query: $q, after: $after, sortKey: UPDATED_AT) {
    nodes {
      id name createdAt cancelledAt test sourceName displayFinancialStatus
      totalPriceSet { shopMoney { amount currencyCode } }
      totalRefundedSet { shopMoney { amount } }
      totalOutstandingSet { shopMoney { amount } }
      transactions(first: 20) { kind status processedAt gateway formattedGateway amountSet { shopMoney { amount } } }
      lineItems(first: 20) { nodes { title quantity discountedTotalSet { shopMoney { amount } } } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

/** Every order created or changed since `since` (Shopify only shares the last 60 days without read_all_orders). */
async function fetchOrders(since: Date): Promise<{ orders: ShopifyOrderLite[]; truncated: boolean }> {
  const orders: ShopifyOrderLite[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data: { orders: { nodes: ShopifyOrderLite[]; pageInfo: { hasNextPage: boolean; endCursor: string } } } =
      await gql(ORDER_QUERY, { q: `updated_at:>='${since.toISOString()}'`, after });
    orders.push(...data.orders.nodes);
    if (!data.orders.pageInfo.hasNextPage) return { orders, truncated: false };
    after = data.orders.pageInfo.endCursor;
  }
  return { orders, truncated: true };
}

// cache(): the summary strip and the detail panel share one Shopify fetch per page load.
export const getSalesSummary = cache(async (range: InsightRange): Promise<SalesSummary | { error: string }> => {
  const now = new Date(), force = false;
  if (!shopifyConfigured()) return { error: 'Shopify is not connected yet.' };
  try {
    return await cached(`insights:sales:${range}`, async () => {
      const p = periodFor(range, now);
      const { orders, truncated } = await fetchOrders(p.prevFrom);
      return { ...summariseSales(orders, p, now), range, truncated };
    }, force);
  } catch (e) {
    return { error: (e as Error).message };
  }
});

// ---------------- site traffic (ShopifyQL) ----------------
type QlTable = { columns: { name: string }[]; rows: unknown };
const ymd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });

/** Reads the first row of a ShopifyQL result as { column: number }, whether rows come as arrays, objects or a JSON string. */
function firstRow(t: QlTable | null): Record<string, number> {
  if (!t) return {};
  let rows = t.rows;
  if (typeof rows === 'string') rows = JSON.parse(rows);
  const r = Array.isArray(rows) ? rows[0] : null;
  const out: Record<string, number> = {};
  if (Array.isArray(r)) t.columns.forEach((c, i) => { out[c.name] = Number(r[i]) || 0; });
  else if (r && typeof r === 'object') for (const [k, v] of Object.entries(r)) out[k] = Number(v) || 0;
  return out;
}

async function trafficFor(from: Date, to: Date) {
  const query = `FROM sessions SHOW sessions, online_store_visitors, conversion_rate SINCE ${ymd(from)} UNTIL ${ymd(to)}`;
  const d = await gql<{ shopifyqlQuery: { tableData: QlTable | null; parseErrors: unknown } }>(
    `query($q: String!) { shopifyqlQuery(query: $q) { tableData { columns { name } rows } parseErrors } }`, { q: query });
  const errs = d.shopifyqlQuery.parseErrors;
  if (errs && (!Array.isArray(errs) || errs.length)) throw new Error(`ShopifyQL: ${JSON.stringify(errs).slice(0, 200)}`);
  const r = firstRow(d.shopifyqlQuery.tableData);
  return { sessions: r.sessions ?? 0, visitors: r.online_store_visitors ?? 0, conversionRate: r.conversion_rate ?? 0 };
}

export const getTraffic = cache(async (range: InsightRange): Promise<Traffic | { error: string }> => {
  const now = new Date(), force = false;
  if (!shopifyConfigured()) return { error: 'Shopify is not connected yet.' };
  try {
    return await cached(`insights:traffic:${range}`, async () => {
      const p = periodFor(range, now);
      const [cur, prev] = await Promise.all([trafficFor(p.from, p.to), trafficFor(p.prevFrom, p.prevTo)]);
      return { cur, prev };
    }, force);
  } catch (e) {
    const msg = (e as Error).message;
    if (/access|scope|denied|read_reports/i.test(msg)) {
      return { error: 'Site visits need one more Shopify permission: add the read_reports scope to the app in the Dev Dashboard, release the version and approve it in Shopify.' };
    }
    return { error: msg };
  }
});

/** Link into Shopify admin, e.g. shopifyAdmin('/analytics'). */
export function shopifyAdmin(path = '') {
  const d = process.env.SHOPIFY_STORE_DOMAIN;
  return d ? `https://${d.replace(/^https?:\/\//, '').replace(/\/$/, '')}/admin${path}` : null;
}
