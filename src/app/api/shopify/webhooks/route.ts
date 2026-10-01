import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { logEvent } from '@/lib/data';
import { fetchOrder, upsertShopifyOrder, verifyWebhook } from '@/lib/shopify';

// Subscribe in Shopify to: orders/create, orders/updated, orders/cancelled, fulfillments/update
// pointing at https://<app>/api/shopify/webhooks (JSON).
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get('x-shopify-hmac-sha256'))) {
    return new NextResponse('Invalid signature', { status: 401 });
  }
  const topic = req.headers.get('x-shopify-topic') ?? '';
  const body = JSON.parse(raw);
  try {
    if (topic.startsWith('orders/')) {
      const gid = body.admin_graphql_api_id as string;
      const o = await fetchOrder(gid);
      if (o) await upsertShopifyOrder(o);
    } else if (topic === 'fulfillments/update' || topic === 'fulfillments/create') {
      // Courier delivery confirmation (Shopify updates shipment_status from carrier tracking).
      if (body.shipment_status === 'delivered' && body.order_id) {
        const gid = `gid://shopify/Order/${body.order_id}`;
        const [o] = await db.select().from(schema.orders).where(eq(schema.orders.shopifyId, gid));
        if (o && o.stage === 'SHIPPED') {
          await db.update(schema.orders).set({ stage: 'DELIVERED', deliveredAt: new Date(), updatedAt: new Date() }).where(eq(schema.orders.id, o.id));
          await logEvent({ orderId: o.id, actor: 'Shopify', kind: 'status', text: 'Courier confirmed delivery. Order fulfilled' });
        }
      }
    }
  } catch (e) {
    console.error('[shopify webhook]', topic, e);
    return new NextResponse('Error', { status: 500 }); // Shopify retries
  }
  return NextResponse.json({ ok: true });
}
