/**
 * Potties Order Desk ⇄ Google sync (Google Apps Script, runs every hour inside your Google account).
 *
 *  1. COGS sheet "8. Invoices"  → dashboard Invoices (amounts, next instalment due, paid, Drive PDF link)
 *  2. Dashboard orders          → COGS sheet tab "15. Fulfilment" (stage, ship-by, courier, tracking)
 *  3. Dashboard documents       → Drive › Potties › Fulfilment › <order>  (packing slips, photos, POPs)
 *  4. Gmail attachments that mention an order (waybills, artwork) → Drive + linked on the order
 *  5. Logs each run on the dashboard ("COGS sheet synced …")
 *
 * Setup: paste into a new project at script.google.com, fill in CONFIG, run `setup` once and allow access.
 */
const CONFIG = {
  DASHBOARD_URL: 'https://potties-orders.netlify.app',
  TOKEN: '<INTEGRATION_TOKEN>',
  SHEET_ID: '1AgicuQxJGSGoaz607Jg9tVDpaMHWilQ0_s8AAyE3KMA',
  INVOICES_FOLDER_ID: '1OmBqYbH_pouVy2dajRBhvPeAQK5W6-1R',
  PURCHASE_ORDERS_FOLDER_ID: '1CG8K1w2rSKJB7I5BIOD7C6k6WrWrHl4r',
  INVOICES_TAB: '8. Invoices',
  FULFILMENT_TAB: '15. Fulfilment',
  TZ: 'Africa/Johannesburg',
  MAX_FILES_PER_RUN: 30,
};

/** Run once: creates the hourly trigger and does a first sync. */
function setup() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'syncAll').forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncAll').timeBased().everyHours(1).create();
  syncAll();
}

function syncAll() {
  const notes = [];
  let ok = true;
  const step = (name, fn) => {
    try { const r = fn(); if (r) notes.push(r); } catch (e) { ok = false; notes.push(`${name} failed: ${e.message}`); console.error(name, e); }
  };
  let exp = null;
  step('Read dashboard', () => { exp = api('get', '/api/integration/export?since=' + encodeURIComponent(new Date(Date.now() - 3 * 864e5).toISOString())); });
  step('Invoices', () => pushInvoices());
  if (exp) {
    step('Fulfilment tab', () => writeFulfilmentTab(exp.orders));
    step('Documents', () => archiveDocuments(exp));
    step('Gmail', () => linkGmailAttachments(exp.orders));
  }
  try { api('post', '/api/integration/report', { source: 'google-apps-script', ok: ok, summary: notes.join(' · ').slice(0, 1900) || 'No changes' }); }
  catch (e) { console.error('report', e); }
  console.log(notes.join('\n'));
}

// ---------------------------------------------------------------- dashboard API
function api(method, path, body) {
  const res = UrlFetchApp.fetch(CONFIG.DASHBOARD_URL + path, {
    method: method, contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + CONFIG.TOKEN },
    payload: body ? JSON.stringify(body) : undefined,
  });
  const code = res.getResponseCode();
  if (code >= 300) throw new Error(`${method.toUpperCase()} ${path} → ${code} ${res.getContentText().slice(0, 200)}`);
  return JSON.parse(res.getContentText());
}
function download(url) {
  const res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + CONFIG.TOKEN }, muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() >= 300) throw new Error(`download ${res.getResponseCode()}`);
  return res.getBlob();
}

// ---------------------------------------------------------------- 1. invoices → dashboard
const ymd = (d) => (d instanceof Date ? Utilities.formatDate(d, CONFIG.TZ, 'yyyy-MM-dd') : null);
const num = (v) => (typeof v === 'number' ? v : Number(String(v || '').replace(/[^\d.-]/g, '')) || 0);

function pushInvoices() {
  const sh = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.INVOICES_TAB);
  if (!sh) throw new Error(`tab "${CONFIG.INVOICES_TAB}" not found`);
  const rows = sh.getDataRange().getValues();
  const hdr = rows.findIndex((r) => String(r[0]).trim() === 'Inv / PO ref');
  if (hdr < 0) throw new Error('header row "Inv / PO ref" not found');
  const col = {}; rows[hdr].forEach((h, i) => (col[String(h).trim()] = i));
  const need = ['Inv / PO ref', 'Supplier', 'Type', 'Invoice date', 'Total incl VAT', 'Deposit due', 'Deposit amount', 'Deposit PAID', 'Deposit paid date', 'Balance due', 'Balance amount', 'Balance PAID', 'Balance paid date', 'OUTSTANDING', 'Status'];
  need.forEach((h) => { if (!(h in col)) throw new Error(`column "${h}" missing on ${CONFIG.INVOICES_TAB}`); });
  const pdfs = driveIndex();
  const items = [];
  for (let r = hdr + 1; r < rows.length; r++) {
    const row = rows[r];
    const ref = String(row[col['Inv / PO ref']] || '').trim();
    if (!ref || ref === 'TOTAL') break;
    const type = String(row[col['Type']] || '');
    const total = num(row[col['Total incl VAT']]);
    if (/QUOTE|SUPERSEDED|REMOVED/i.test(type) || total <= 0) continue;
    const depOpen = num(row[col['Deposit amount']]) - num(row[col['Deposit PAID']]) > 0.01;
    const balOpen = num(row[col['Balance amount']]) - num(row[col['Balance PAID']]) > 0.01;
    const outstanding = num(row[col['OUTSTANDING']]);
    const nextDue = depOpen ? row[col['Deposit due']] : balOpen ? row[col['Balance due']] : (row[col['Balance due']] || row[col['Deposit due']]);
    const paidDates = [row[col['Deposit paid date']], row[col['Balance paid date']]].filter((d) => d instanceof Date).sort((a, b) => b - a);
    const order = col['Order # (1:1 match)'] !== undefined ? String(row[col['Order # (1:1 match)']] || '').trim() : '';
    const pdf = pdfs.find((f) => f.name.toUpperCase().indexOf(ref.toUpperCase()) >= 0);
    items.push({
      supplier: String(row[col['Supplier']] || 'Other'),
      number: ref,
      amount: total,
      issuedAt: ymd(row[col['Invoice date']]),
      dueAt: ymd(nextDue),
      paidAt: outstanding <= 0.01 ? ymd(paidDates[0] || new Date()) : null,
      paidAmount: num(row[col['Deposit PAID']]) + num(row[col['Balance PAID']]) || null,
      orderName: /^#?\d+$|^#?PT\d+$/i.test(order) ? order : null,
      driveUrl: pdf ? pdf.url : null,
      notes: [type, String(row[col['Status']] || ''), col['Linked orders'] !== undefined ? String(row[col['Linked orders']] || '') : ''].filter(Boolean).join(' · ').slice(0, 300),
    });
  }
  const res = api('post', '/api/integration/invoices', { invoices: items });
  return `Invoices: ${res.created} new, ${res.updated} updated` + (res.skipped.length ? `, skipped ${res.skipped.join('; ')}` : '') + (res.unmatchedOrders.length ? `, orders not in dashboard: ${res.unmatchedOrders.join(', ')}` : '');
}

function driveIndex() {
  const out = [];
  [CONFIG.INVOICES_FOLDER_ID, CONFIG.PURCHASE_ORDERS_FOLDER_ID].forEach((id) => {
    try { const it = DriveApp.getFolderById(id).getFiles(); while (it.hasNext()) { const f = it.next(); out.push({ name: f.getName(), url: f.getUrl() }); } }
    catch (e) { console.warn('folder', id, e.message); }
  });
  return out;
}

// ---------------------------------------------------------------- 2. orders → "15. Fulfilment"
function writeFulfilmentTab(orders) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sh = ss.getSheetByName(CONFIG.FULFILMENT_TAB) || ss.insertSheet(CONFIG.FULFILMENT_TAB);
  const d = (v) => (v ? Utilities.formatDate(new Date(v), CONFIG.TZ, 'yyyy-MM-dd') : '');
  const head = ['Order', 'Customer', 'Town', 'Stage', 'Ship by', 'Sent to foundry', 'Accepted', 'Packed', 'Shipped', 'Delivered', 'Courier', 'Tracking', 'Custom text', 'Proof approved', 'Foundry invoice', 'Dashboard link'];
  const data = orders.map((o) => [
    o.name, o.customerName, o.city || '', o.stageLabel, d(o.shipBy), d(o.sentToFoundryAt), d(o.acceptedAt), d(o.packedAt), d(o.shippedAt), d(o.deliveredAt),
    o.courier || '', o.trackingNumber || '', o.lines.filter((l) => l.customText).map((l) => l.customText).join(' | '),
    o.proofApproved ? 'Yes' : '', o.foundryInvoice ? `${o.foundryInvoice.number}${o.foundryInvoice.paid ? ' (paid)' : ''}` : '', o.dashboardUrl,
  ]);
  sh.clearContents();
  sh.getRange(1, 1).setValue(`POTTIES — FULFILMENT STATUS (from the Order Desk, updated ${Utilities.formatDate(new Date(), CONFIG.TZ, 'd MMM yyyy HH:mm')})`).setFontWeight('bold');
  sh.getRange(2, 1).setValue('Written every hour by the Potties sync script. Do not type here: change orders in the Order Desk.');
  sh.getRange(3, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  if (data.length) sh.getRange(4, 1, data.length, head.length).setValues(data);
  return `Fulfilment tab: ${data.length} orders`;
}

// ---------------------------------------------------------------- 3. dashboard documents → Drive
function fulfilmentFolder() {
  const goToMarket = DriveApp.getFileById(CONFIG.SHEET_ID).getParents().next();
  const potties = goToMarket.getParents().hasNext() ? goToMarket.getParents().next() : goToMarket;
  const it = potties.getFoldersByName('Fulfilment');
  return it.hasNext() ? it.next() : potties.createFolder('Fulfilment');
}
function orderFolder(root, name) {
  const it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}
function archiveDocuments(exp) {
  const props = PropertiesService.getScriptProperties();
  const done = JSON.parse(props.getProperty('archived') || '{}');
  const root = fulfilmentFolder();
  let saved = 0, waiting = 0;
  const save = (key, orderName, filename, url) => {
    if (done[key]) return;
    if (saved >= CONFIG.MAX_FILES_PER_RUN) { waiting++; return; }
    const folder = orderFolder(root, orderName || 'No order');
    if (!folder.getFilesByName(filename).hasNext()) folder.createFile(download(url).setName(filename));
    done[key] = new Date().toISOString(); saved++;
  };
  exp.orders.filter((o) => o.packingSlipUrl).forEach((o) => save(`slip:${o.name}`, o.name, `packing-slip-${o.name.replace('#', '')}.pdf`, o.packingSlipUrl));
  exp.files.forEach((f) => save(`file:${f.id}`, f.orderName, `${f.kind.toLowerCase()}-${f.filename}`, f.downloadUrl));
  exp.invoices.filter((i) => i.proofOfPaymentUrl).forEach((i) => save(`pop:${i.number}`, i.orderName || 'Supplier payments', `POP-${i.number}.pdf`, i.proofOfPaymentUrl));
  props.setProperty('archived', JSON.stringify(done));
  return `Drive: ${saved} files saved` + (waiting ? `, ${waiting} waiting for next run` : '');
}

// ---------------------------------------------------------------- 4. Gmail attachments → orders
function linkGmailAttachments(orders) {
  const props = PropertiesService.getScriptProperties();
  const seen = JSON.parse(props.getProperty('gmailSeen') || '{}');
  const names = orders.map((o) => o.name);
  const root = fulfilmentFolder();
  const docs = [];
  GmailApp.search('has:attachment newer_than:3d (waybill OR collection OR artwork OR proof OR order)', 0, 30).forEach((thread) => {
    thread.getMessages().forEach((m) => {
      if (seen[m.getId()]) return;
      seen[m.getId()] = 1;
      const text = m.getSubject() + ' ' + m.getPlainBody().slice(0, 3000);
      const order = names.find((n) => new RegExp('(^|\\D)' + n.replace('#', '#?') + '(\\D|$)').test(text));
      if (!order) return;
      const kind = /waybill|collection|tracking/i.test(text) ? 'WAYBILL' : /artwork|proof|engrav|lid/i.test(text) ? 'ARTWORK' : 'OTHER';
      m.getAttachments().filter((a) => /pdf|image/.test(a.getContentType())).forEach((a) => {
        const f = orderFolder(root, order).createFile(a.copyBlob());
        docs.push({ orderName: order, kind: kind, driveUrl: f.getUrl(), filename: a.getName().slice(0, 200) });
      });
    });
  });
  props.setProperty('gmailSeen', JSON.stringify(seen));
  if (!docs.length) return null;
  const res = api('post', '/api/integration/documents', { documents: docs });
  return `Gmail: ${res.linked} documents linked to orders`;
}
