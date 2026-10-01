import 'server-only';
import { Liquid } from 'liquidjs';
import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import type { ShopifyAddress } from './db/schema';
import type { OrderDetail } from './data';
import { getShopInfo } from './shopify';

// Shopify has no API to download its packing slip PDF, so we render the store's own packing slip
// template (Shopify admin > Settings > Shipping and delivery > Packing slips > Edit) with the same
// Liquid variables Shopify uses. Paste a customised template under Logins > Packing slip template;
// otherwise Shopify's standard template below is used.
export const TEMPLATE_KEY = 'packing_slip_template';

export const DEFAULT_TEMPLATE = `<div class="wrapper">
  <div class="header">
    <div class="shop-title">
      <p class="to-uppercase">{{ shop.name }}</p>
    </div>
    <div class="order-title">
      <p class="text-align-right">Order {{ order.name }}</p>
      {% if order.po_number != blank %}
        <p class="text-align-right">PO number #{{ order.po_number }}</p>
      {% endif %}
      <p class="text-align-right">{{ order.created_at | date: format: "date" }}</p>
    </div>
  </div>
  <div class="customer-addresses">
    <div class="shipping-address">
      <p class="subtitle-bold to-uppercase">
        {% if delivery_method.instructions != blank %}Delivery to{% else %}Ship to{% endif %}
      </p>
      <p class="address-detail">
        {% if shipping_address != blank %}
          {{ shipping_address.name }}
          {% if shipping_address.company != blank %}<br>{{ shipping_address.company }}{% endif %}
          <br>{{ shipping_address.address1 }}
          {% if shipping_address.address2 != blank %}<br>{{ shipping_address.address2 }}{% endif %}
          {% if shipping_address.city_province_zip != blank %}<br>{{ shipping_address.city_province_zip }}{% endif %}
          <br>{{ shipping_address.country }}
          {% if shipping_address.phone != blank %}<br>{{ shipping_address.phone }}{% endif %}
        {% else %}
          No shipping address
        {% endif %}
      </p>
    </div>
    <div class="billing-address">
      <p class="subtitle-bold to-uppercase">Bill to</p>
      <p class="address-detail">
        {% if billing_address != blank %}
          {{ billing_address.name }}
          {% if billing_address.company != blank %}<br>{{ billing_address.company }}{% endif %}
          <br>{{ billing_address.address1 }}
          {% if billing_address.address2 != blank %}<br>{{ billing_address.address2 }}{% endif %}
          {% if billing_address.city_province_zip != blank %}<br>{{ billing_address.city_province_zip }}{% endif %}
          <br>{{ billing_address.country }}
        {% else %}
          No billing address
        {% endif %}
      </p>
    </div>
  </div>
  <hr>
  <div class="order-container">
    <div class="order-container-header">
      <div class="order-container-header-left-content">
        <p class="subtitle-bold to-uppercase">Items</p>
      </div>
      <div class="order-container-header-right-content">
        <p class="subtitle-bold to-uppercase">Quantity</p>
      </div>
    </div>
    {% for line_item in line_items_in_shipment %}
      <div class="flex-line-item">
        <div class="flex-line-item-img">
          {% if line_item.image != blank %}
            <div class="aspect-ratio aspect-ratio-square">
              {{ line_item.image | img_url: '250x250' | img_tag: '', 'aspect-ratio__content' }}
            </div>
          {% endif %}
        </div>
        <div class="flex-line-item-description">
          <p>
            <span class="line-item-description-line">{{ line_item.title }}</span>
            {% if line_item.variant_title != blank %}
              <span class="line-item-description-line">{{ line_item.variant_title }}</span>
            {% endif %}
            {% if line_item.sku != blank %}
              <span class="line-item-description-line">{{ line_item.sku }}</span>
            {% endif %}
            {% for property in line_item.properties %}
              {% assign property_first_char = property.first | slice: 0 %}
              {% if property.last != blank and property_first_char != '_' %}
                <span class="line-item-description-line">{{ property.first }}: {{ property.last }}</span>
              {% endif %}
            {% endfor %}
          </p>
        </div>
        <div class="flex-line-item-quantity">
          <p class="text-align-right">{{ line_item.shipping_quantity }} of {{ line_item.quantity }}</p>
        </div>
      </div>
    {% endfor %}
  </div>
  {% unless includes_all_line_items_in_order %}
    <hr>
    <div class="missing-line-items-text">
      <p class="text-align-center">There are other items from your order not included in this shipment.</p>
    </div>
  {% endunless %}
  <hr>
  {% if order.note != blank %}
    <div class="notes">
      <p class="subtitle-bold to-uppercase">Notes</p>
      <p class="notes-details">{{ order.note }}</p>
    </div>
  {% endif %}
  {% if delivery_method.instructions != blank %}
    <div class="notes">
      <p class="subtitle-bold to-uppercase">Delivery instructions</p>
      <p class="notes-details">{{ delivery_method.instructions }}</p>
    </div>
  {% endif %}
  <div class="footer">
    <p class="text-align-center">Thank you for shopping with us!</p>
    <p class="text-align-center">
      <strong>{{ shop.name }}</strong>
      {% if shop_address.summary != blank %}<br>{{ shop_address.summary }}{% endif %}
      {% if shop.email != blank %}<br>{{ shop.email }}{% endif %}
      {% if shop.domain != blank %}<br>{{ shop.domain }}{% endif %}
    </p>
  </div>
</div>

<style type="text/css">
  body { font-size: 15px; }
  * { box-sizing: border-box; }
  .wrapper { width: 831px; margin: auto; padding: 4em; font-family: "Noto Sans", sans-serif; font-weight: 250; }
  .header { width: 100%; display: -webkit-box; display: -webkit-flex; display: flex; flex-direction: row; align-items: top; }
  .header p { margin: 0; }
  .shop-title { -webkit-box-flex: 6; -webkit-flex: 6; flex: 6; font-size: 1.9em; }
  .order-title { -webkit-box-flex: 4; -webkit-flex: 4; flex: 4; }
  .customer-addresses { width: 100%; display: inline-block; margin: 2em 0; }
  .address-detail { margin: 0.7em 0 0; line-height: 1.5; }
  .subtitle-bold { font-weight: bold; margin: 0; font-size: 0.85em; }
  .to-uppercase { text-transform: uppercase; }
  .text-align-right { text-align: right; }
  .text-align-center { text-align: center; }
  .shipping-address { float: left; min-width: 18em; max-width: 50%; }
  .billing-address { padding-left: 20em; min-width: 18em; }
  .order-container { padding: 0 0.7em; }
  .order-container-header { display: inline-block; width: 100%; margin-top: 1.4em; }
  .order-container-header-left-content { float: left; }
  .order-container-header-right-content { float: right; }
  .flex-line-item { display: -webkit-box; display: -webkit-flex; display: flex; flex-direction: row; align-items: center; margin: 1.4em 0; page-break-inside: avoid; }
  .flex-line-item-img { margin-right: 1.4em; min-width: 4em; }
  .flex-line-item-description { -webkit-box-flex: 7; -webkit-flex: 7; flex: 7; }
  .line-item-description-line { display: block; }
  .flex-line-item-description p { margin: 0; line-height: 1.5; }
  .flex-line-item-quantity { -webkit-box-flex: 3; -webkit-flex: 3; flex: 3; }
  .missing-line-items-text { margin: 1.4em 0; padding: 0 0.7em; }
  .notes { margin-top: 2em; }
  .notes p { margin-bottom: 0; }
  .notes .notes-details { margin-top: 0.7em; }
  .footer { margin-top: 2em; text-align: center; line-height: 1.5; }
  .footer p { margin: 0; margin-bottom: 1.4em; }
  hr { height: 0.14em; border: none; color: black; background-color: black; margin: 0; }
  .aspect-ratio { position: relative; display: block; background: #fafbfc; padding: 0; }
  .aspect-ratio::before { z-index: 1; content: ""; position: absolute; top: 0; right: 0; bottom: 0; left: 0; border: 1px solid rgba(195,207,216,0.3); }
  .aspect-ratio--square { width: 100%; padding-bottom: 100%; }
  .aspect-ratio__content { position: absolute; max-width: 100%; max-height: 100%; display: block; top: 0; right: 0; bottom: 0; left: 0; margin: auto; }
  .aspect-ratio-square { width: 4em; height: 4em; }
</style>`;

const engine = new Liquid({ strictFilters: false, strictVariables: false, ownPropertyOnly: true });

const kw = (args: unknown[], key: string) => {
  for (const a of args) if (Array.isArray(a) && a[0] === key) return a[1];
  return undefined;
};
engine.registerFilter('date', (v: unknown, ...args: unknown[]) => {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(String(v));
  if (isNaN(d.getTime())) return String(v);
  const fmt = kw(args, 'format') ?? args[0];
  const opts: Intl.DateTimeFormatOptions = fmt === 'date_at_time' || fmt === 'abbreviated_date'
    ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'long', year: 'numeric' };
  return new Intl.DateTimeFormat('en-ZA', { ...opts, timeZone: 'Africa/Johannesburg' }).format(d);
});
const sized = (url: unknown, size?: unknown) => {
  if (!url) return '';
  const u = String(url);
  const w = String(size ?? '').match(/^(\d+)/)?.[1];
  return w && /cdn\.shopify\.com/.test(u) ? `${u}${u.includes('?') ? '&' : '?'}width=${w}` : u;
};
engine.registerFilter('img_url', (url: unknown, size?: unknown) => sized(url, size));
engine.registerFilter('image_url', (url: unknown, ...args: unknown[]) => sized(url, kw(args, 'width')));
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
engine.registerFilter('img_tag', (url: unknown, alt?: unknown, cls?: unknown) => `<img src="${esc(url)}" alt="${esc(alt)}"${cls ? ` class="${esc(cls)}"` : ''}>`);
engine.registerFilter('image_tag', (url: unknown, ...args: unknown[]) => `<img src="${esc(url)}" alt="${esc(kw(args, 'alt'))}"${kw(args, 'class') ? ` class="${esc(kw(args, 'class'))}"` : ''}>`);
engine.registerFilter('money', (v: unknown) => `R ${(Number(v) / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`);
engine.registerFilter('money_with_currency', (v: unknown) => `R ${(Number(v) / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })} ZAR`);
engine.registerFilter('format_address', (a: Record<string, string> | null) => a
  ? [a.name, a.company, a.address1, a.address2, a.city_province_zip, a.country].filter(Boolean).map(esc).join('<br>') : '');
engine.registerFilter('t', (key: unknown) => String(key ?? '').split('.').pop()?.replace(/_/g, ' ') ?? '');

function liquidAddress(a: ShopifyAddress | null | undefined, fallbackName?: string | null) {
  if (!a) return null;
  const name = a.name || [a.firstName, a.lastName].filter(Boolean).join(' ') || fallbackName || '';
  const cityLine = [a.city, a.provinceCode || a.province, a.zip].filter(Boolean).join(' ');
  return {
    name, first_name: a.firstName ?? '', last_name: a.lastName ?? '', company: a.company ?? '',
    address1: a.address1 ?? '', address2: a.address2 ?? '', city: a.city ?? '', province: a.province ?? '',
    province_code: a.provinceCode ?? '', zip: a.zip ?? '', country: a.country ?? '', country_code: a.countryCodeV2 ?? '',
    phone: a.phone ?? '', city_province_zip: cityLine,
    summary: [a.company, a.address1, a.address2, cityLine, a.country].filter(Boolean).join(', '),
  };
}

export async function getPackingSlipTemplate(): Promise<{ template: string; custom: boolean }> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, TEMPLATE_KEY));
  return row?.value?.trim() ? { template: row.value, custom: true } : { template: DEFAULT_TEMPLATE, custom: false };
}

/** The store's packing slip for one order, as Shopify would print it (HTML fragment). */
export async function renderShopifyPackingSlip(o: OrderDetail): Promise<string> {
  const [{ template }, shop] = await Promise.all([getPackingSlipTemplate(), getShopInfo()]);
  const sd = o.shopifyData ?? {};
  const shipping = liquidAddress(sd.shippingAddress, o.customerName) ?? liquidAddress({
    name: o.customerName, address1: o.address1, address2: o.address2, city: o.city, province: o.province, zip: o.zip, country: o.country, phone: o.phone,
  });
  const lines = o.lines.map((l) => ({
    title: l.title, name: l.variant ? `${l.title} - ${l.variant}` : l.title, variant_title: l.variant ?? '', sku: l.sku ?? '',
    quantity: l.quantity, shipping_quantity: l.quantity, image: l.imageUrl ?? '', groups: [],
    properties: Object.fromEntries((l.properties ?? []).map((p) => [p.key, p.value])),
  }));
  const shopAddress = liquidAddress(shop.address);
  const ctx = {
    shop: { name: shop.name, email: shop.email ?? '', domain: shop.domain ?? '', url: shop.domain ? `https://${shop.domain}` : '', logo: shop.logoUrl ?? '' },
    shop_address: shopAddress ?? { summary: '' },
    order: {
      name: o.name, order_name: o.name, po_number: sd.poNumber ?? '', created_at: o.placedAt.toISOString(), note: sd.note ?? o.deliveryNote ?? '',
      line_items: lines, shipping_address: shipping, billing_address: liquidAddress(sd.billingAddress),
    },
    shipping_address: shipping,
    billing_address: liquidAddress(sd.billingAddress),
    line_items_in_shipment: lines,
    includes_all_line_items_in_order: true,
    delivery_method: { instructions: '', method_type: 'shipping', shipping_title: sd.shippingTitle ?? o.courier ?? '' },
    fulfillment: { line_items: lines },
  };
  return engine.parseAndRender(template, ctx);
}

/** A full printable page around the packing slip, with a "Print / Save as PDF" button. */
export function packingSlipPage(orderName: string, body: string, pdfUrl?: string | null) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Packing slip ${esc(orderName)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@300;400;700&display=swap">
<style>
  .pf-bar{position:sticky;top:0;display:flex;gap:8px;justify-content:center;padding:10px;background:#f7f5f1;border-bottom:1px solid #e9e2d6;font-family:system-ui,sans-serif}
  .pf-bar button,.pf-bar a{font:600 14px system-ui,sans-serif;padding:8px 16px;border-radius:8px;border:1px solid #d9691e;background:#d9691e;color:#fff;text-decoration:none;cursor:pointer}
  .pf-bar a{background:#fff;color:#26241f;border-color:#e9e2d6}
  @media print{.pf-bar{display:none}@page{margin:10mm}}
</style></head><body>
<div class="pf-bar"><button onclick="window.print()">Print / Save as PDF</button>${pdfUrl ? `<a href="${esc(pdfUrl)}">Download PDF</a>` : ''}</div>
${body}
</body></html>`;
}
