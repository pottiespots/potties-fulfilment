import {
  pgTable, pgEnum, text, integer, boolean, timestamp, uuid, jsonb, index, uniqueIndex,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['HQ', 'FOUNDRY']);

export const stageEnum = pgEnum('stage', [
  'NEW', 'SENT', 'ACCEPTED', 'MANUFACTURING', 'PACKING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED',
]);

export const fileKindEnum = pgEnum('file_kind', [
  'PHOTO_PRODUCT', 'PHOTO_CUSTOM', 'PHOTO_PACKED', 'PHOTO_WAYBILL',
  'WAYBILL', 'ARTWORK', 'OTHER', 'INVOICE', 'POP', 'PACKING_SLIP',
]);

export const supplierEnum = pgEnum('supplier', ['FOUNDRY', 'LL', 'OTHER']);

export const poStatusEnum = pgEnum('po_status', ['ORDERED', 'IN_PRODUCTION', 'DELIVERED', 'CANCELLED']);

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: roleEnum('role').notNull(),
  passwordHash: text('password_hash').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
  lastLoginAt: ts('last_login_at'),
}, (t) => [uniqueIndex('users_email_idx').on(t.email)]);

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopifyId: text('shopify_id'),
  name: text('name').notNull(), // e.g. #PT1284
  stage: stageEnum('stage').notNull().default('NEW'),
  placedAt: ts('placed_at').notNull(),
  customerName: text('customer_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  address1: text('address1'),
  address2: text('address2'),
  city: text('city'),
  province: text('province'),
  zip: text('zip'),
  country: text('country'),
  deliveryNote: text('delivery_note'),
  // Set when HQ corrects the shipping address; Shopify syncs then leave the address alone.
  addressEditedAt: ts('address_edited_at'),
  addressEditedBy: text('address_edited_by'),
  courier: text('courier'),
  courierService: text('courier_service'),
  shipBy: ts('ship_by').notNull(),
  sentAt: ts('sent_at'),
  acceptedAt: ts('accepted_at'),
  packedAt: ts('packed_at'),
  shippedAt: ts('shipped_at'),
  deliveredAt: ts('delivered_at'),
  trackingNumber: text('tracking_number'),
  trackingCompany: text('tracking_company'),
  shopifyFulfillmentId: text('shopify_fulfillment_id'),
  shopifySyncError: text('shopify_sync_error'),
  hqCustomChecked: boolean('hq_custom_checked').notNull().default(false),
  foundryCustomChecked: boolean('foundry_custom_checked').notNull().default(false),
  slipInBox: boolean('slip_in_box').notNull().default(false),
  proofApprovedAt: ts('proof_approved_at'),
  openQuestion: text('open_question'),
  openQuestionAt: ts('open_question_at'),
  // Extra Shopify details used by the packing slip template (billing address, PO number, shipping method).
  shopifyData: jsonb('shopify_data').$type<ShopifyOrderData>(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('orders_shopify_id_idx').on(t.shopifyId),
  index('orders_stage_idx').on(t.stage),
  index('orders_ship_by_idx').on(t.shipBy),
]);

export const lineItems = pgTable('line_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  shopifyLineId: text('shopify_line_id'),
  title: text('title').notNull(),
  variant: text('variant'),
  sku: text('sku'),
  quantity: integer('quantity').notNull(),
  customType: text('custom_type'),
  customText: text('custom_text'),
  imageUrl: text('image_url'),
  properties: jsonb('properties').$type<{ key: string; value: string }[]>().notNull().default([]),
}, (t) => [index('line_items_order_idx').on(t.orderId)]);

export const orderFiles = pgTable('order_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id'),
  kind: fileKindEnum('kind').notNull(),
  storageKey: text('storage_key').notNull(), // '' when the file lives in Google Drive (driveUrl)
  driveUrl: text('drive_url'),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  uploadedById: uuid('uploaded_by_id').references(() => users.id),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('order_files_order_idx').on(t.orderId), index('order_files_invoice_idx').on(t.invoiceId)]);

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
  purchaseOrderId: uuid('purchase_order_id'),
  userId: uuid('user_id').references(() => users.id),
  actor: text('actor').notNull(), // display label: "Foundry · Willem", "Potties HQ · Anna", "Shopify"
  kind: text('kind').notNull(), // 'system' | 'note' | 'status'
  text: text('text').notNull(),
  internal: boolean('internal').notNull().default(false), // HQ only
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('events_order_idx').on(t.orderId)]);

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  sku: text('sku').notNull(),
  supplier: supplierEnum('supplier').notNull(),
  unitCostCents: integer('unit_cost_cents').notNull().default(0),
  onHand: integer('on_hand').notNull().default(0),
  inProduction: integer('in_production').notNull().default(0), // foundry pots being cast for stock
  reorderLevel: integer('reorder_level').notNull().default(0),
  active: boolean('active').notNull().default(true),
}, (t) => [uniqueIndex('products_sku_idx').on(t.sku)]);

export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: text('number').notNull(),
  supplier: supplierEnum('supplier').notNull().default('LL'),
  status: poStatusEnum('status').notNull().default('ORDERED'),
  placedAt: ts('placed_at').notNull().defaultNow(),
  expectedAt: ts('expected_at'),
  receivedAt: ts('received_at'),
  notes: text('notes'),
}, (t) => [uniqueIndex('purchase_orders_number_idx').on(t.number)]);

export const purchaseOrderLines = pgTable('purchase_order_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  purchaseOrderId: uuid('purchase_order_id').notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(),
  unitCostCents: integer('unit_cost_cents').notNull(),
});

export const supplierInvoices = pgTable('supplier_invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  supplier: supplierEnum('supplier').notNull(),
  number: text('number').notNull(),
  amountCents: integer('amount_cents').notNull(),
  issuedAt: ts('issued_at').notNull(),
  dueAt: ts('due_at').notNull(),
  paidAt: ts('paid_at'),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
  purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, { onDelete: 'set null' }),
  notes: text('notes'),
  supplierLabel: text('supplier_label'), // e.g. "Huntlea" when supplier is OTHER
  driveUrl: text('drive_url'), // the invoice PDF in Google Drive
  source: text('source').notNull().default('app'), // 'app' or 'cogs-sheet'
  paidAmountCents: integer('paid_amount_cents'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [index('supplier_invoices_order_idx').on(t.orderId), uniqueIndex('supplier_invoices_number_idx').on(t.supplier, t.number)]);

/** Every Shopify payment and refund the dashboard has seen. Kept for good, because Shopify only shares the last 60 days of orders. */
export const cashLedger = pgTable('cash_ledger', {
  id: text('id').primaryKey(), // Shopify transaction id
  source: text('source').notNull().default('shopify'),
  orderName: text('order_name'),
  kind: text('kind').notNull(), // 'in' (sale / capture) or 'refund'
  amountCents: integer('amount_cents').notNull(),
  gateway: text('gateway'),
  occurredAt: ts('occurred_at').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('cash_ledger_at_idx').on(t.occurredAt)]);

/** One row per run of the daily COGS-sheet routine (or any other integration). */
export const syncRuns = pgTable('sync_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  source: text('source').notNull(),
  ok: boolean('ok').notNull(),
  summary: text('summary').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/** Simple key/value settings (e.g. the Shopify packing slip template). */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export type ShopifyAddress = { name?: string | null; firstName?: string | null; lastName?: string | null; company?: string | null; address1?: string | null; address2?: string | null; city?: string | null; province?: string | null; provinceCode?: string | null; zip?: string | null; country?: string | null; countryCodeV2?: string | null; phone?: string | null };
export type ShopifyOrderData = { billingAddress?: ShopifyAddress | null; shippingAddress?: ShopifyAddress | null; poNumber?: string | null; shippingTitle?: string | null; note?: string | null };

export type User = typeof users.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type LineItem = typeof lineItems.$inferSelect;
export type OrderFile = typeof orderFiles.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Product = typeof products.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderLine = typeof purchaseOrderLines.$inferSelect;
export type SupplierInvoice = typeof supplierInvoices.$inferSelect;
export type Stage = Order['stage'];
export type FileKind = OrderFile['kind'];
export type Role = User['role'];
export type SyncRun = typeof syncRuns.$inferSelect;
