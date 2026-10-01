// Fills an EMPTY database with example orders, products and supplier records for trying the app.
// Refuses to run if any orders exist, so it can't touch real data.  npm run db:seed
import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const [{ n }] = await sql`select count(*)::int as n from orders`;
if (n > 0) { console.error('Database already has orders. Seed only runs on an empty database.'); process.exit(1); }

const H = 36e5, now = Date.now();
const at = (h) => new Date(now + h * H);
const shipAt = (h) => { const d = at(h); const hr = d.getUTCHours(); d.setUTCHours(hr < 6 ? 8 : hr > 14 ? 12 : hr, 0, 0, 0); return d; };
const pw = await bcrypt.hash('potties-demo-2026', 11);
const [hq] = await sql`insert into users (email, name, role, password_hash) values ('hq@example.com', 'Anna (Potties HQ)', 'HQ', ${pw}) on conflict (email) do update set password_hash = excluded.password_hash returning id`;
await sql`insert into users (email, name, role, password_hash) values ('foundry@example.com', 'Willem', 'FOUNDRY', ${pw}) on conflict (email) do update set password_hash = excluded.password_hash`;

const products = [
  ['No. 1 Potjie · 3 L', 'POT-01', 'FOUNDRY', 0, 14, 3, 10], ['No. 2 Potjie · 6 L', 'POT-02', 'FOUNDRY', 0, 9, 5, 10],
  ['No. 3 Potjie · 7.8 L', 'POT-03', 'FOUNDRY', 0, 4, 12, 12], ['No. 4 Potjie · 10 L', 'POT-04', 'FOUNDRY', 0, 2, 3, 6],
  ['Canvas pot cover · No. 1', 'LL-CV1', 'LL', 26000, 12, 0, 8], ['Canvas pot cover · No. 2', 'LL-CV2', 'LL', 29000, 9, 0, 10],
  ['Canvas pot cover · No. 3', 'LL-CV3', 'LL', 32000, 4, 0, 12], ['Canvas pot cover · No. 4', 'LL-CV4', 'LL', 35000, 7, 0, 6],
  ['Canvas drawstring bag', 'LL-BAG', 'LL', 18000, 3, 0, 15], ['Leather braai apron', 'LL-APR', 'LL', 42000, 14, 0, 6],
];
const prod = {};
for (const [name, sku, supplier, cost, onHand, inProd, reorder] of products) {
  const [p] = await sql`insert into products (name, sku, supplier, unit_cost_cents, on_hand, in_production, reorder_level) values (${name}, ${sku}, ${supplier}, ${cost}, ${onHand}, ${inProd}, ${reorder}) returning id`;
  prod[sku] = p.id;
}

const O = [
  ['#PT1284', 'Johan van der Merwe', '14 Dorp Street', 'Stellenbosch', '7600', 'Western Cape', '082 555 0141', 'Gate code 2210', 'NEW', -3, 96, [['No. 3 Potjie', '7.8 L', 'POT-03', 1, 'Cast lid', 'VAN DER MERWE · 1987']]],
  ['#PT1283', 'Thandi Nkosi', 'Unit 6, The Pines, 22 Rivonia Road', 'Sandton', '2196', 'Gauteng', '083 555 0192', 'Business hours only', 'SENT', -30, 52, [['No. 2 Potjie', '6 L', 'POT-02', 1, 'Engraving', 'Nkosi Family Fires'], ['Canvas drawstring bag', null, 'LL-BAG', 1, null, null]]],
  ['#PT1281', 'Pieter Botha', '51 Kellner Street, Westdene', 'Bloemfontein', '9301', 'Free State', '071 555 0117', null, 'SENT', -8, 120, [['No. 4 Potjie', '10 L', 'POT-04', 2, null, null]]],
  ['#PT1279', 'Lerato Mokoena', '9 Florida Road, Morningside', 'Durban', '4001', 'KwaZulu-Natal', '084 555 0163', null, 'ACCEPTED', -50, 30, [['No. 1 Potjie', '3 L', 'POT-01', 1, 'Cast lid', 'LERATO']]],
  ['#PT1276', 'Sarel & Anika du Plessis', 'Du Plessis Plaas, R45', 'Paarl', '7646', 'Western Cape', '082 555 0178', 'Farm gate, call on arrival', 'MANUFACTURING', -120, 18, [['No. 3 Potjie', '7.8 L', 'POT-03', 1, 'Cast lid', 'DU PLESSIS PLAAS'], ['Canvas pot cover · No. 3', null, 'LL-CV3', 1, null, null]]],
  ['#PT1274', 'Michael Adams', '33 Cape Road, Mill Park', 'Gqeberha', '6001', 'Eastern Cape', '079 555 0124', null, 'MANUFACTURING', -150, -4, [['No. 2 Potjie', '6 L', 'POT-02', 1, null, null]]],
  ['#PT1271', 'Braai Club Pretoria', '120 Lynnwood Road', 'Pretoria', '0081', 'Gauteng', '012 555 0199', 'Deliver to clubhouse reception', 'PACKING', -200, 26, [['No. 3 Potjie', '7.8 L', 'POT-03', 6, 'Engraving', 'BCP · 2026']]],
  ['#PT1268', 'Naledi Dlamini', 'Apt 4B, 18 Kloof Street, Gardens', 'Cape Town', '8001', 'Western Cape', '072 555 0136', 'Concierge can sign', 'PACKED', -230, 5, [['No. 1 Potjie', '3 L', 'POT-01', 1, null, null]]],
  ['#PT1262', 'Riaan Coetzee', '7 Ferreira Street', 'Mbombela', '1201', 'Mpumalanga', '076 555 0150', null, 'SHIPPED', -300, -40, [['No. 4 Potjie', '10 L', 'POT-04', 1, 'Cast lid', 'COETZEE']]],
];
const ids = {};
for (const [name, cust, a1, city, zip, prov, phone, note, stage, placedH, shipH, lines] of O) {
  const placed = at(placedH), sent = ['NEW'].includes(stage) ? null : at(placedH + 3);
  const accepted = ['NEW', 'SENT'].includes(stage) ? null : at(placedH + 6);
  const shipped = stage === 'SHIPPED';
  const [o] = await sql`insert into orders (name, stage, placed_at, customer_name, email, phone, address1, city, province, zip, country, delivery_note, courier, courier_service, ship_by, sent_at, accepted_at,
      hq_custom_checked, foundry_custom_checked, slip_in_box, packed_at, shipped_at, tracking_number, tracking_company, proof_approved_at)
    values (${name}, ${stage}, ${placed}, ${cust}, ${cust.split(' ')[0].toLowerCase() + '@example.com'}, ${phone}, ${a1}, ${city}, ${prov}, ${zip}, 'South Africa', ${note}, 'The Courier Guy', 'Economy road', ${shipAt(shipH)}, ${sent}, ${accepted},
      ${stage !== 'NEW'}, ${['PACKED', 'SHIPPED'].includes(stage)}, ${['PACKED', 'SHIPPED'].includes(stage)}, ${['PACKED', 'SHIPPED'].includes(stage) ? at(-20) : null},
      ${shipped ? at(-40) : null}, ${shipped ? 'TCG8841207' : null}, ${shipped ? 'The Courier Guy' : null}, ${shipped ? at(-41) : null}) returning id`;
  ids[name] = o.id;
  for (const [title, variant, sku, qty, ctype, ctext] of lines) {
    await sql`insert into line_items (order_id, title, variant, sku, quantity, custom_type, custom_text) values (${o.id}, ${title}, ${variant}, ${sku}, ${qty}, ${ctype}, ${ctext})`;
  }
  await sql`insert into events (order_id, actor, kind, text, created_at) values (${o.id}, 'Shopify', 'system', 'Order paid and synced from Shopify', ${placed})`;
  if (sent) await sql`insert into events (order_id, actor, kind, text, created_at) values (${o.id}, 'Potties HQ · Anna', 'status', 'Checked and sent to foundry', ${sent})`;
  if (accepted) await sql`insert into events (order_id, actor, kind, text, created_at) values (${o.id}, 'Foundry · Willem', 'status', 'Order accepted', ${accepted})`;
}
await sql`update orders set open_question = 'Can the courier collect Friday instead of Monday? We have a full pour on Monday.', open_question_at = ${at(-2)} where name = '#PT1281'`;
await sql`insert into events (order_id, actor, kind, text, created_at) values (${ids['#PT1274']}, 'Foundry · Willem', 'note', 'Casting flaw on first pour. Re-cast in progress.', ${at(-20)})`;
await sql`insert into events (order_id, actor, kind, text, internal, created_at) values (${ids['#PT1276']}, 'Potties HQ · Anna', 'note', 'Customer is a repeat buyer. Add a thank-you card.', true, ${at(-60)})`;

const inv = async (supplier, number, amount, issuedH, dueH, paid, orderId, poId) =>
  sql`insert into supplier_invoices (supplier, number, amount_cents, issued_at, due_at, paid_at, order_id, purchase_order_id) values (${supplier}, ${number}, ${amount}, ${at(issuedH)}, ${at(dueH)}, ${paid ? at(issuedH + 48) : null}, ${orderId}, ${poId}) returning id`;
await inv('FOUNDRY', 'INV-0412', 415000, -26, 700, false, ids['#PT1283'], null);
await inv('FOUNDRY', 'INV-0409', 189000, -44, 680, true, ids['#PT1279'], null);
await inv('FOUNDRY', 'INV-0405', 362000, -110, 610, false, ids['#PT1276'], null);
await inv('FOUNDRY', 'INV-0398', 1788000, -196, -20, false, ids['#PT1271'], null);

const po = async (number, placedD, expD, status, lines) => {
  const [p] = await sql`insert into purchase_orders (number, supplier, status, placed_at, expected_at, received_at) values (${number}, 'LL', ${status}, ${at(placedD * 24)}, ${at(expD * 24)}, ${status === 'DELIVERED' ? at((expD - 1) * 24) : null}) returning id`;
  for (const [sku, q] of lines) {
    const [{ unit_cost_cents }] = await sql`select unit_cost_cents from products where sku = ${sku}`;
    await sql`insert into purchase_order_lines (purchase_order_id, product_id, quantity, unit_cost_cents) values (${p.id}, ${prod[sku]}, ${q}, ${unit_cost_cents})`;
  }
  return p.id;
};
const p27 = await po('PO-LL-001', -55, -40, 'DELIVERED', [['LL-CV4', 15], ['LL-APR', 10]]);
const p29 = await po('PO-LL-002', -40, -30, 'DELIVERED', [['LL-CV2', 25]]);
const p31 = await po('PO-LL-003', -20, -5, 'DELIVERED', [['LL-CV3', 30], ['LL-BAG', 40]]);
await po('PO-LL-004', -12, -1, 'IN_PRODUCTION', [['LL-APR', 20]]);
await po('PO-LL-005', -2, 12, 'ORDERED', [['LL-BAG', 50]]);
await inv('LL', 'LL-2240', 945000, -40 * 24, -10 * 24, true, null, p27);
await inv('LL', 'LL-2264', 725000, -33 * 24, -3 * 24, false, null, p29);
await inv('LL', 'LL-2291', 1680000, -6 * 24, 24 * 24, false, null, p31);

await sql.end();
console.log('Example data added. Sign in as hq@example.com or foundry@example.com with password: potties-demo-2026');
void hq;
