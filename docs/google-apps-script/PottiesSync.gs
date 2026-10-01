/**
 * Potties Order Desk <-> Google sync (Google Apps Script, runs every hour in your Google account).
 *
 *  1. COGS sheet "8. Invoices"  -> dashboard Invoices (amounts, next instalment due, paid, Drive PDF link)
 *  2. Dashboard orders          -> COGS sheet tab "15. Fulfilment" (stage, ship-by, courier, tracking)
 *  3. Dashboard documents       -> Drive / Potties / Fulfilment / <order> (packing slips, photos, POPs)
 *  4. Gmail attachments that mention an order (waybills, artwork) -> Drive, linked on the order
 *  5. Logs each run on the dashboard ("COGS sheet synced ...")
 *
 * Setup: paste into a new project at script.google.com, set TOKEN, choose "setup" and click Run.
 * Written in plain JavaScript so it runs on any Apps Script runtime.
 */
var CONFIG = {
  DASHBOARD_URL: 'https://potties-orders.netlify.app',
  TOKEN: '<INTEGRATION_TOKEN>',
  SHEET_ID: '1AgicuQxJGSGoaz607Jg9tVDpaMHWilQ0_s8AAyE3KMA',
  INVOICES_FOLDER_ID: '1OmBqYbH_pouVy2dajRBhvPeAQK5W6-1R',
  PURCHASE_ORDERS_FOLDER_ID: '1CG8K1w2rSKJB7I5BIOD7C6k6WrWrHl4r',
  // Other folders holding supplier invoices (RB Foundry). Anything not found here is searched for across Drive.
  EXTRA_INVOICE_FOLDER_IDS: ['1HtidXw6xy7MPMXidNk4aNwPgoF2Y78wn'],
  INVOICES_TAB: '8. Invoices',
  FULFILMENT_TAB: '15. Fulfilment',
  TZ: 'Africa/Johannesburg',
  MAX_FILES_PER_RUN: 30
};

/** Run once: creates the hourly trigger and does a first sync. */
function setup() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'syncAll') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('syncAll').timeBased().everyHours(1).create();
  syncAll();
}

function syncAll() {
  var notes = [];
  var ok = true;
  function step(name, fn) {
    try {
      var r = fn();
      if (r) notes.push(r);
    } catch (e) {
      ok = false;
      notes.push(name + ' failed: ' + e.message);
      console.error(name + ': ' + e.message);
    }
  }
  var exp = null;
  step('Read dashboard', function () {
    var since = new Date(new Date().getTime() - 3 * 86400000).toISOString();
    exp = api('get', '/api/integration/export?since=' + encodeURIComponent(since));
  });
  step('Invoices', pushInvoices);
  if (exp) {
    step('Fulfilment tab', function () { return writeFulfilmentTab(exp.orders); });
    step('Documents', function () { return archiveDocuments(exp); });
    step('Gmail', function () { return linkGmailAttachments(exp.orders); });
  }
  try {
    api('post', '/api/integration/report', { source: 'google-apps-script', ok: ok, summary: (notes.join(' | ') || 'No changes').slice(0, 1900) });
  } catch (e) {
    console.error('report: ' + e.message);
  }
  console.log(notes.join('\n'));
}

// ---------------------------------------------------------------- dashboard API
function api(method, path, body) {
  var options = {
    method: method,
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + CONFIG.TOKEN }
  };
  if (body) options.payload = JSON.stringify(body);
  var res = UrlFetchApp.fetch(CONFIG.DASHBOARD_URL + path, options);
  var code = res.getResponseCode();
  if (code >= 300) throw new Error(method.toUpperCase() + ' ' + path + ' returned ' + code + ': ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText());
}

function download(url) {
  var res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + CONFIG.TOKEN }, muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() >= 300) throw new Error('download returned ' + res.getResponseCode());
  return res.getBlob();
}

// ---------------------------------------------------------------- helpers
function ymd(d) {
  return (d instanceof Date) ? Utilities.formatDate(d, CONFIG.TZ, 'yyyy-MM-dd') : null;
}
function num(v) {
  if (typeof v === 'number') return v;
  var n = Number(String(v || '').replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}
function isOrderNumber(s) {
  // "#1004", "1004", "#PT1284"
  return /^#?(PT)?[0-9]+$/i.test(s);
}

// ---------------------------------------------------------------- 1. invoices -> dashboard
function pushInvoices() {
  var sh = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.INVOICES_TAB);
  if (!sh) throw new Error('tab "' + CONFIG.INVOICES_TAB + '" not found');
  var rows = sh.getDataRange().getValues();
  var hdr = -1;
  for (var h = 0; h < rows.length; h++) {
    if (String(rows[h][0]).trim() === 'Inv / PO ref') { hdr = h; break; }
  }
  if (hdr < 0) throw new Error('header row "Inv / PO ref" not found');
  var col = {};
  for (var c = 0; c < rows[hdr].length; c++) col[String(rows[hdr][c]).trim()] = c;
  var need = ['Inv / PO ref', 'Supplier', 'Type', 'Invoice date', 'Total incl VAT', 'Deposit due', 'Deposit amount', 'Deposit PAID',
    'Deposit paid date', 'Balance due', 'Balance amount', 'Balance PAID', 'Balance paid date', 'OUTSTANDING', 'Status'];
  for (var k = 0; k < need.length; k++) {
    if (!(need[k] in col)) throw new Error('column "' + need[k] + '" missing on ' + CONFIG.INVOICES_TAB);
  }
  var pdfs = driveIndex();
  var items = [];
  for (var r = hdr + 1; r < rows.length; r++) {
    var row = rows[r];
    var ref = String(row[col['Inv / PO ref']] || '').trim();
    if (!ref || ref === 'TOTAL') break;
    var type = String(row[col['Type']] || '');
    var total = num(row[col['Total incl VAT']]);
    if (/QUOTE|SUPERSEDED|REMOVED/i.test(type) || total <= 0) continue;

    var depositOpen = num(row[col['Deposit amount']]) - num(row[col['Deposit PAID']]) > 0.01;
    var balanceOpen = num(row[col['Balance amount']]) - num(row[col['Balance PAID']]) > 0.01;
    var outstanding = num(row[col['OUTSTANDING']]);
    var nextDue;
    if (depositOpen) nextDue = row[col['Deposit due']];
    else if (balanceOpen) nextDue = row[col['Balance due']];
    else nextDue = row[col['Balance due']] || row[col['Deposit due']];

    var lastPaid = null;
    var paidCandidates = [row[col['Deposit paid date']], row[col['Balance paid date']]];
    for (var p = 0; p < paidCandidates.length; p++) {
      if (paidCandidates[p] instanceof Date && (!lastPaid || paidCandidates[p] > lastPaid)) lastPaid = paidCandidates[p];
    }
    var paidAt = null;
    if (outstanding <= 0.01) paidAt = ymd(lastPaid || new Date());

    var order = ('Order # (1:1 match)' in col) ? String(row[col['Order # (1:1 match)']] || '').trim() : '';
    var driveUrl = findInvoicePdf(ref, pdfs);
    var paidAmount = num(row[col['Deposit PAID']]) + num(row[col['Balance PAID']]);
    var noteParts = [type, String(row[col['Status']] || '')];
    if ('Linked orders' in col && row[col['Linked orders']]) noteParts.push(String(row[col['Linked orders']]));

    items.push({
      supplier: String(row[col['Supplier']] || 'Other'),
      number: ref,
      amount: total,
      issuedAt: ymd(row[col['Invoice date']]),
      dueAt: ymd(nextDue),
      paidAt: paidAt,
      paidAmount: paidAmount > 0 ? paidAmount : null,
      orderName: isOrderNumber(order) ? order : null,
      driveUrl: driveUrl,
      notes: noteParts.join(' - ').slice(0, 300)
    });
  }
  var res = api('post', '/api/integration/invoices', { invoices: items });
  var msg = 'Invoices: ' + res.created + ' new, ' + res.updated + ' updated';
  if (res.skipped.length) msg += ', skipped ' + res.skipped.join('; ');
  if (res.unmatchedOrders.length) msg += ', orders not in dashboard: ' + res.unmatchedOrders.join(', ');
  return msg;
}

function driveIndex() {
  var out = [];
  var ids = [CONFIG.INVOICES_FOLDER_ID, CONFIG.PURCHASE_ORDERS_FOLDER_ID].concat(CONFIG.EXTRA_INVOICE_FOLDER_IDS || []);
  for (var i = 0; i < ids.length; i++) {
    try {
      collectFiles(DriveApp.getFolderById(ids[i]), out, 0);
    } catch (e) {
      console.warn('folder ' + ids[i] + ': ' + e.message);
    }
  }
  return out;
}

/** Files in a folder and its subfolders (2 levels deep). */
function collectFiles(folder, out, depth) {
  var it = folder.getFiles();
  while (it.hasNext()) {
    var file = it.next();
    out.push({ name: file.getName(), url: file.getUrl(), mime: file.getMimeType() });
  }
  if (depth >= 2) return;
  var sub = folder.getFolders();
  while (sub.hasNext()) collectFiles(sub.next(), out, depth + 1);
}

/** Scores a file as the invoice document for `ref`: the invoice itself beats a picked order, never a proof of payment. */
function invoiceScore(name, ref) {
  var n = name.toUpperCase();
  if (n.indexOf(ref.toUpperCase()) < 0) return -1;
  if (/^POP|PROOF OF PAYMENT|NOTICE OF PAYMENT|STATEMENT|ARCHIVE/.test(n)) return -1;
  var score = 1;
  if (/INVOICE/.test(n)) score += 2;
  if (/\.PDF$/.test(n)) score += 1;
  return score;
}

/** Drive link of the invoice PDF: first in the known folders, then anywhere in Drive. */
function findInvoicePdf(ref, index) {
  var best = null, bestScore = 0, i, sc;
  for (i = 0; i < index.length; i++) {
    sc = invoiceScore(index[i].name, ref);
    if (sc > bestScore) { best = index[i].url; bestScore = sc; }
  }
  if (best) return best;
  try {
    var q = "title contains '" + ref.replace(/'/g, "\\'") + "' and trashed = false and mimeType != 'application/vnd.google-apps.folder'";
    var it = DriveApp.searchFiles(q);
    var n = 0;
    while (it.hasNext() && n < 20) {
      var f = it.next(); n++;
      sc = invoiceScore(f.getName(), ref);
      if (sc > bestScore) { best = f.getUrl(); bestScore = sc; }
    }
  } catch (e) {
    console.warn('drive search ' + ref + ': ' + e.message);
  }
  return best;
}

// ---------------------------------------------------------------- 2. orders -> "15. Fulfilment"
function fmtDate(v) {
  return v ? Utilities.formatDate(new Date(v), CONFIG.TZ, 'yyyy-MM-dd') : '';
}

function writeFulfilmentTab(orders) {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sh = ss.getSheetByName(CONFIG.FULFILMENT_TAB) || ss.insertSheet(CONFIG.FULFILMENT_TAB);
  var head = ['Order', 'Customer', 'Town', 'Stage', 'Ship by', 'Sent to foundry', 'Accepted', 'Packed', 'Shipped', 'Delivered',
    'Courier', 'Tracking', 'Custom text', 'Proof approved', 'Foundry invoice', 'Dashboard link'];
  var data = [];
  for (var i = 0; i < orders.length; i++) {
    var o = orders[i];
    var custom = [];
    for (var j = 0; j < o.lines.length; j++) if (o.lines[j].customText) custom.push(o.lines[j].customText);
    var inv = o.foundryInvoice ? (o.foundryInvoice.number + (o.foundryInvoice.paid ? ' (paid)' : '')) : '';
    data.push([o.name, o.customerName, o.city || '', o.stageLabel, fmtDate(o.shipBy), fmtDate(o.sentToFoundryAt), fmtDate(o.acceptedAt),
      fmtDate(o.packedAt), fmtDate(o.shippedAt), fmtDate(o.deliveredAt), o.courier || '', o.trackingNumber || '', custom.join(' | '),
      o.proofApproved ? 'Yes' : '', inv, o.dashboardUrl]);
  }
  sh.clearContents();
  sh.getRange(1, 1).setValue('POTTIES - FULFILMENT STATUS (from the Order Desk, updated ' + Utilities.formatDate(new Date(), CONFIG.TZ, 'd MMM yyyy HH:mm') + ')').setFontWeight('bold');
  sh.getRange(2, 1).setValue('Written every hour by the Potties sync script. Do not type here: change orders in the Order Desk.');
  sh.getRange(3, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  if (data.length) sh.getRange(4, 1, data.length, head.length).setValues(data);
  return 'Fulfilment tab: ' + data.length + ' orders';
}

// ---------------------------------------------------------------- 3. dashboard documents -> Drive
function fulfilmentFolder() {
  var goToMarket = DriveApp.getFileById(CONFIG.SHEET_ID).getParents().next();
  var parents = goToMarket.getParents();
  var potties = parents.hasNext() ? parents.next() : goToMarket;
  var it = potties.getFoldersByName('Fulfilment');
  return it.hasNext() ? it.next() : potties.createFolder('Fulfilment');
}

function orderFolder(root, name) {
  var it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

function archiveDocuments(exp) {
  var props = PropertiesService.getScriptProperties();
  var done = JSON.parse(props.getProperty('archived') || '{}');
  var root = fulfilmentFolder();
  var saved = 0;
  var waiting = 0;
  function save(key, orderName, filename, url) {
    if (done[key]) return;
    if (saved >= CONFIG.MAX_FILES_PER_RUN) { waiting++; return; }
    var folder = orderFolder(root, orderName || 'No order');
    if (!folder.getFilesByName(filename).hasNext()) folder.createFile(download(url).setName(filename));
    done[key] = new Date().toISOString();
    saved++;
  }
  var i;
  for (i = 0; i < exp.orders.length; i++) {
    var o = exp.orders[i];
    if (o.packingSlipUrl) save('slip:' + o.name, o.name, 'packing-slip-' + o.name.replace('#', '') + '.pdf', o.packingSlipUrl);
  }
  for (i = 0; i < exp.files.length; i++) {
    var f = exp.files[i];
    save('file:' + f.id, f.orderName, f.kind.toLowerCase() + '-' + f.filename, f.downloadUrl);
  }
  for (i = 0; i < exp.invoices.length; i++) {
    var inv = exp.invoices[i];
    if (inv.proofOfPaymentUrl) save('pop:' + inv.number, inv.orderName || 'Supplier payments', 'POP-' + inv.number + '.pdf', inv.proofOfPaymentUrl);
  }
  props.setProperty('archived', JSON.stringify(done));
  return 'Drive: ' + saved + ' files saved' + (waiting ? ', ' + waiting + ' waiting for next run' : '');
}

// ---------------------------------------------------------------- 4. Gmail attachments -> orders
function mentionsOrder(text, orderName) {
  var digits = orderName.replace('#', '');
  var re = new RegExp('(^|[^0-9A-Za-z])#?' + digits + '([^0-9]|$)');
  return re.test(text);
}

function linkGmailAttachments(orders) {
  var props = PropertiesService.getScriptProperties();
  var seen = JSON.parse(props.getProperty('gmailSeen') || '{}');
  var root = null;
  var docs = [];
  var threads = GmailApp.search('has:attachment newer_than:3d (waybill OR collection OR artwork OR proof OR order)', 0, 30);
  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();
    for (var m = 0; m < messages.length; m++) {
      var msg = messages[m];
      if (seen[msg.getId()]) continue;
      seen[msg.getId()] = 1;
      var text = msg.getSubject() + ' ' + msg.getPlainBody().slice(0, 3000);
      var order = null;
      for (var o = 0; o < orders.length; o++) {
        if (mentionsOrder(text, orders[o].name)) { order = orders[o].name; break; }
      }
      if (!order) continue;
      var kind = /waybill|collection|tracking/i.test(text) ? 'WAYBILL' : (/artwork|proof|engrav|lid/i.test(text) ? 'ARTWORK' : 'OTHER');
      var atts = msg.getAttachments();
      for (var a = 0; a < atts.length; a++) {
        var type = atts[a].getContentType();
        if (type.indexOf('pdf') < 0 && type.indexOf('image') < 0) continue;
        if (!root) root = fulfilmentFolder();
        var file = orderFolder(root, order).createFile(atts[a].copyBlob());
        docs.push({ orderName: order, kind: kind, driveUrl: file.getUrl(), filename: atts[a].getName().slice(0, 200) });
      }
    }
  }
  props.setProperty('gmailSeen', JSON.stringify(seen));
  if (!docs.length) return null;
  var res = api('post', '/api/integration/documents', { documents: docs });
  return 'Gmail: ' + res.linked + ' documents linked to orders';
}
