import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { OrderDetail } from './data';
import { day, dayTime } from './format';

const EMBER = rgb(0.851, 0.412, 0.118);
const INK = rgb(0.149, 0.141, 0.122);
const MUTED = rgb(0.43, 0.4, 0.357);

// Standard PDF fonts only cover Western European characters; replace anything else.
const EXTRA = new Set('“”‘’–—•…€·'.split(''));
const clean = (s: string | null | undefined) =>
  (s ?? '').split('').map((c) => (c.charCodeAt(0) <= 0xff || EXTRA.has(c) ? c : '?')).join('').replace(/[\r\n\t]+/g, ' ');

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of clean(text).split(' ')) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) { out.push(line); line = w; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

/** A one-page A4 packing slip the foundry prints and puts in the box. */
export async function packingSlipPdf(o: OrderDetail): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Packing slip ${o.name}`);
  pdf.setAuthor('Potties');
  const page: PDFPage = pdf.addPage([595.28, 841.89]);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const M = 48, W = 595.28 - 2 * M;
  let y = 841.89 - M;
  const text = (t: string, x: number, yy: number, size = 10, f = reg, color = INK) => page.drawText(clean(t), { x, y: yy, size, font: f, color });

  text('POTTIES', M, y - 22, 28, bold, INK);
  text('PACKING SLIP', M, y - 38, 9, bold, EMBER);
  text(o.name, M + W - bold.widthOfTextAtSize(o.name, 20), y - 20, 20, bold);
  const placed = `Ordered ${day(o.placedAt)}`;
  text(placed, M + W - reg.widthOfTextAtSize(placed, 10), y - 36, 10, reg, MUTED);
  y -= 64;
  page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 1, color: EMBER });
  y -= 24;

  // Ship to / courier
  text('SHIP TO', M, y, 8, bold, MUTED);
  text('COURIER', M + W / 2, y, 8, bold, MUTED);
  y -= 16;
  const addr = [o.customerName, o.address1, o.address2, [o.city, o.zip].filter(Boolean).join(' '), [o.province, o.country].filter(Boolean).join(', '), o.phone ? `Tel ${o.phone}` : null].filter(Boolean) as string[];
  addr.forEach((l, i) => text(l, M, y - i * 15, i === 0 ? 12 : 11, i === 0 ? bold : reg));
  text(o.courier ?? 'To be confirmed', M + W / 2, y, 12, bold);
  if (o.courierService) text(o.courierService, M + W / 2, y - 15, 11);
  text(`Ship by ${dayTime(o.shipBy)}`, M + W / 2, y - 32, 11, bold, EMBER);
  y -= Math.max(addr.length * 15, 48) + 18;

  if (o.deliveryNote) {
    text('DELIVERY NOTE', M, y, 8, bold, MUTED); y -= 14;
    for (const l of wrap(o.deliveryNote, reg, 10, W).slice(0, 4)) { text(l, M, y, 10); y -= 13; }
    y -= 8;
  }

  // Items table
  page.drawRectangle({ x: M, y: y - 6, width: W, height: 22, color: rgb(0.969, 0.961, 0.945) });
  text('ITEM', M + 8, y, 8, bold, MUTED); text('SKU', M + W - 170, y, 8, bold, MUTED); text('QTY', M + W - 40, y, 8, bold, MUTED);
  y -= 26;
  for (const l of o.lines) {
    const title = `${l.title}${l.variant ? ` · ${l.variant}` : ''}`;
    const lines = wrap(title, bold, 11, W - 200);
    lines.forEach((t, i) => text(t, M + 8, y - i * 14, 11, bold));
    text(l.sku ?? '', M + W - 170, y, 10, reg, MUTED);
    text(String(l.quantity), M + W - 36, y, 12, bold);
    y -= lines.length * 14;
    if (l.customText) {
      y -= 4;
      page.drawRectangle({ x: M + 8, y: y - 30, width: W - 16, height: 36, color: rgb(0.988, 0.925, 0.875) });
      text(`${(l.customType ?? 'Customisation').toUpperCase()} - MUST READ EXACTLY`, M + 16, y - 6, 7.5, bold, MUTED);
      text(l.customText, M + 16, y - 22, 14, bold);
      y -= 40;
    }
    y -= 10;
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: M + W, y: y + 4 }, thickness: 0.5, color: rgb(0.91, 0.886, 0.839) });
    y -= 10;
    if (y < 200) break; // keep the sign-off block on the page
  }

  // Sign-off
  y = Math.min(y - 10, 200);
  text('PACKED AND CHECKED BY THE FOUNDRY', M, y, 8, bold, MUTED);
  const box = (label: string, x: number, yy: number) => { page.drawRectangle({ x, y: yy - 2, width: 10, height: 10, borderColor: INK, borderWidth: 1 }); text(label, x + 16, yy, 10); };
  box('Customisation checked against this slip', M, y - 20);
  box('Quantity correct', M, y - 38);
  box('Photos uploaded to the order desk', M + W / 2, y - 20);
  box('Slip placed in the box', M + W / 2, y - 38);
  text('Name: ______________________    Date: ____________', M, y - 66, 10, reg, MUTED);

  text('Thank you for choosing Potties. Questions about your order? Reply to your order confirmation email.', M, 40, 8.5, reg, MUTED);
  return pdf.save();
}
