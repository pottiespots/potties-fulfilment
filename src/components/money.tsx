// Dashboard money panels: Shopify sales and cash in, supplier payments out, site visits.
import Link from 'next/link';
import { getAllTime, getSalesSummary, getTraffic, shopifyAdmin } from '@/lib/shopify-insights';
import { RANGE_LABEL, change, monthLabel, type InsightRange, type PeriodRange, type SalesSummary } from '@/lib/insights-calc';
import type { InvoiceRow } from '@/lib/data';
import { money } from '@/lib/rules';

type Out = { cur: number; prev: number };
/** Paid to suppliers in the period (from the Order Desk / COGS sheet), by payment date. */
export function supplierOutflow(invoices: InvoiceRow[], s: Pick<SalesSummary, 'from' | 'to' | 'prevFrom' | 'prevTo'>): Out {
  const sum = (a: string, b: string) => invoices
    .filter((i) => i.paidAt && i.paidAt >= new Date(a) && i.paidAt <= new Date(b))
    .reduce((t, i) => t + (i.paidAmountCents ?? i.amountCents), 0);
  return { cur: sum(s.from, s.to), prev: sum(s.prevFrom, s.prevTo) };
}

function Delta({ cur, prev, goodWhenUp = true }: { cur: number; prev: number; goodWhenUp?: boolean }) {
  const c = change(cur, prev);
  if (c === null) return <span className="delta">no earlier figure</span>;
  const up = c >= 0;
  return <span className={`delta ${up === goodWhenUp ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {Math.abs(c)}% <span className="vs">vs {money(prev)}</span></span>;
}

function Kpi({ label, value, children, tone }: { label: string; value: string; children?: React.ReactNode; tone?: 'bad' | 'ok' }) {
  return <div className={`kpi m-kpi${tone ? ` ${tone}` : ''}`}><div className="l">{label}</div><div className="v num">{value}</div><div className="d">{children}</div></div>;
}

function ShopifyError({ error }: { error: string }) {
  return <div className="sec"><h4>Shopify sales</h4><p className="sub2" style={{ margin: 0 }}>{error} Check <Link className="lnk" href="/hq/setup">Logins → Check connections</Link>.</p></div>;
}

export function RangeChips({ range, base }: { range: InsightRange; base: string }) {
  return (
    <div className="toolbar" style={{ marginBottom: 10 }}>
      {(Object.keys(RANGE_LABEL) as InsightRange[]).map((r) => (
        <Link key={r} className="chip" href={`${base}${base.includes('?') ? '&' : '?'}range=${r}`} aria-current={r === range ? 'page' : undefined}>{RANGE_LABEL[r]}</Link>
      ))}
    </div>
  );
}

/** Six headline figures: sales, cash in, paid out, net cash, still to collect, still to pay. */
export async function MoneyStrip({ range, invoices, owedCents, detailHref }: { range: PeriodRange; invoices: InvoiceRow[]; owedCents: number; detailHref?: string }) {
  const s = await getSalesSummary(range);
  if ('error' in s) return <ShopifyError error={s.error} />;
  const out = supplierOutflow(invoices, s);
  const cashIn = s.cur.cashInCents - s.cur.refundsPaidCents, cashInPrev = s.prev.cashInCents - s.prev.refundsPaidCents;
  const net = cashIn - out.cur, netPrev = cashInPrev - out.prev;
  return (
    <section className="moneystrip" aria-label={`Money, ${RANGE_LABEL[range].toLowerCase()}`}>
      <div className="ms-head">
        <h3 className="h3">Money · {RANGE_LABEL[range]}</h3>
        {detailHref && <span className="btns"><Link className="lnk" href="/hq?view=money&range=all">Total cash flow (all time) →</Link><Link className="lnk" href={detailHref}>Sales & cash details →</Link></span>}
      </div>
      <div className="kpis">
        <Kpi label={`Sales · ${s.cur.orders} orders`} value={money(s.cur.netCents)}><Delta cur={s.cur.netCents} prev={s.prev.netCents} /></Kpi>
        <Kpi label="Cash received" value={money(cashIn)}><Delta cur={cashIn} prev={cashInPrev} /></Kpi>
        <Kpi label="Paid to suppliers" value={money(out.cur)}><Delta cur={out.cur} prev={out.prev} goodWhenUp={false} /></Kpi>
        <Kpi label="Net cash flow" value={`${net < 0 ? '−' : ''}${money(Math.abs(net))}`} tone={net < 0 ? 'bad' : 'ok'}><Delta cur={net} prev={netPrev} /></Kpi>
        <Kpi label={`Still to collect · ${s.awaiting.orders} orders`} value={money(s.awaiting.cents)}><span className="delta">EFT and pending payments</span></Kpi>
        <Kpi label="Still to pay suppliers" value={money(owedCents)}><span className="delta">All unpaid invoices</span></Kpi>
      </div>
    </section>
  );
}

/** Daily net sales as thin bars. One series, so no legend; each bar has a hover label. */
function DailyChart({ s }: { s: SalesSummary }) {
  const W = 640, H = 170, top = 18, bottom = 24, n = s.daily.length;
  const max = Math.max(...s.daily.map((d) => d.netCents), 1);
  const step = W / n, bw = Math.max(2, Math.min(28, step - 2));
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  const ticks = [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
  const best = s.daily.reduce((a, b) => (b.netCents > a.netCents ? b : a), s.daily[0]);
  return (
    <figure className="chart" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Net sales per day. Best day ${label(best.date)}: ${money(best.netCents)}.`}>
        <line x1={0} x2={W} y1={y(max)} y2={y(max)} className="grid" />
        <text x={0} y={y(max) - 5} className="axis">{money(max)}</text>
        {s.daily.map((d, i) => {
          const x = i * step + (step - bw) / 2, h = H - bottom - y(d.netCents);
          return (
            <g key={d.date} className="bar">
              <rect x={i * step} y={top} width={step} height={H - top - bottom} className="hit"><title>{`${label(d.date)}: ${money(d.netCents)} · ${d.orders} order${d.orders === 1 ? '' : 's'}`}</title></rect>
              {d.netCents > 0 && <path d={`M${x},${H - bottom} v${-(h - 3)} q0,-3 3,-3 h${bw - 6} q3,0 3,3 v${h - 3} z`} className="mark" />}
            </g>
          );
        })}
        <line x1={0} x2={W} y1={H - bottom} y2={H - bottom} className="base" />
        {ticks.map((i) => <text key={i} x={i * step + step / 2} y={H - 6} className="axis" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{label(s.daily[i].date)}</text>)}
      </svg>
      <figcaption className="sub2">Net sales per day (after refunds). Hover a bar for the day’s total.</figcaption>
    </figure>
  );
}

function Bars({ rows, total }: { rows: { name: string; cents: number; note?: string }[]; total: number }) {
  if (!rows.length) return <div className="kv">Nothing in this period</div>;
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.name} className="hbar">
          <div className="hb-t"><span>{r.name}{r.note && <span className="sub2"> · {r.note}</span>}</span><b className="num">{money(r.cents)}</b></div>
          <div className="hb-track"><i style={{ width: `${Math.max(1, (r.cents / Math.max(total, 1)) * 100)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export async function SalesDetail({ range }: { range: PeriodRange }) {
  const s = await getSalesSummary(range);
  if ('error' in s) return <ShopifyError error={s.error} />;
  const cash = s.gateways.reduce((t, g) => t + g.cents, 0);
  const admin = (p: string) => shopifyAdmin(p) ?? '#';
  return (
    <>
      <div className="sec">
        <h4>Sales per day <a className="lnk" href={admin('/analytics')} target="_blank" rel="noreferrer">Shopify analytics ↗</a></h4>
        <DailyChart s={s} />
        <div className="grid2" style={{ marginTop: 10 }}>
          <div className="kv"><span>Orders</span><b className="num">{s.cur.orders}</b></div>
          <div className="kv"><span>Average order</span><b className="num">{money(s.cur.aovCents)}</b></div>
          <div className="kv"><span>Sales before refunds</span><b className="num">{money(s.cur.salesCents)}</b></div>
          <div className="kv"><span>Refunds</span><b className="num">{money(s.cur.refundsCents)}</b></div>
        </div>
      </div>
      <div className="two">
        <div className="sec">
          <h4>Cash in by payment method <a className="lnk" href={admin('/payments/payouts')} target="_blank" rel="noreferrer">Payouts ↗</a></h4>
          <Bars rows={s.gateways} total={cash} />
        </div>
        <div className="sec">
          <h4>Where sales come from <a className="lnk" href={admin('/orders')} target="_blank" rel="noreferrer">Orders ↗</a></h4>
          <Bars rows={s.channels.map((c) => ({ name: c.name, cents: c.cents, note: `${c.orders} orders` }))} total={s.channels.reduce((t, c) => t + c.cents, 0)} />
        </div>
      </div>
      <div className="sec">
        <h4>Best sellers <a className="lnk" href={admin('/products')} target="_blank" rel="noreferrer">Products ↗</a></h4>
        <Bars rows={s.topProducts.map((p) => ({ name: p.title, cents: p.cents, note: `${p.qty} sold` }))} total={s.topProducts[0]?.cents ?? 1} />
      </div>
      <p className="sub2" style={{ margin: 0 }}>
        From Shopify orders, updated {new Date(s.fetchedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' })} (refreshes every 15 minutes).
        Sales include VAT and shipping. Cash received is money taken on Shopify in the period, minus refunds paid.
        {s.truncated && ' Very busy period: only the latest 2 000 orders are counted.'}
      </p>
    </>
  );
}

export async function TrafficPanel({ range }: { range: PeriodRange }) {
  const t = await getTraffic(range);
  const link = shopifyAdmin('/analytics');
  if ('error' in t) {
    return <div className="sec"><h4>Site visits {link && <a className="lnk" href={link} target="_blank" rel="noreferrer">Shopify analytics ↗</a>}</h4><p className="sub2" style={{ margin: 0 }}>{t.error}</p></div>;
  }
  const pct = (v: number) => `${(v > 1 ? v : v * 100).toFixed(1)}%`; // Shopify may send 0.021 or 2.1
  return (
    <div className="sec">
      <h4>Site visits {link && <a className="lnk" href={link} target="_blank" rel="noreferrer">Shopify analytics ↗</a>}</h4>
      <div className="grid2">
        <div className="kv"><span>Sessions</span><b className="num" style={{ fontSize: 20 }}>{t.cur.sessions.toLocaleString('en-ZA')}</b><TrafficDelta cur={t.cur.sessions} prev={t.prev.sessions} /></div>
        <div className="kv"><span>Visitors</span><b className="num" style={{ fontSize: 20 }}>{t.cur.visitors.toLocaleString('en-ZA')}</b><TrafficDelta cur={t.cur.visitors} prev={t.prev.visitors} /></div>
        <div className="kv"><span>Conversion rate</span><b className="num" style={{ fontSize: 20 }}>{pct(t.cur.conversionRate)}</b><span className="delta">was {pct(t.prev.conversionRate)}</span></div>
      </div>
    </div>
  );
}

function TrafficDelta({ cur, prev }: { cur: number; prev: number }) {
  const c = change(cur, prev);
  return c === null ? null : <span className={`delta ${c >= 0 ? 'up' : 'down'}`}>{c >= 0 ? '▲' : '▼'} {Math.abs(c)}%</span>;
}

export function MoneySkeleton({ tall }: { tall?: boolean }) {
  return <div className="sec skel-box" style={{ minHeight: tall ? 320 : 120 }} aria-busy="true"><span className="sub2">Loading Shopify figures…</span></div>;
}

const signed = (c: number) => `${c < 0 ? '−' : ''}${money(Math.abs(c))}`;

/** Total cash flow since the first sale: Shopify money in, supplier payments out, month by month. */
export async function AllTimeCash({ owedCents }: { owedCents: number }) {
  const [a, s] = await Promise.all([getAllTime(), getSalesSummary('30')]);
  const collect = 'error' in s ? 0 : s.awaiting.cents;
  const settled = a.totals.netCents + collect - owedCents;
  const max = Math.max(...a.months.map((m) => Math.max(m.inCents, m.outCents + m.refundCents)), 1);
  const since = a.firstAt ? new Date(a.firstAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' }) : null;
  return (
    <>
      <section className="moneystrip" aria-label="Total cash flow, all time">
        <div className="ms-head"><h3 className="h3">Total cash flow · all time{since ? ` (since ${since})` : ''}</h3></div>
        <div className="kpis">
          <Kpi label="Total cash in" value={money(a.totals.inCents)}><span className="delta">All Shopify payments</span></Kpi>
          <Kpi label="Refunds paid" value={money(a.totals.refundCents)}><span className="delta">Back to customers</span></Kpi>
          <Kpi label="Paid to suppliers" value={money(a.totals.outCents)}><span className="delta">Foundry, LL and others</span></Kpi>
          <Kpi label="Net cash flow" value={signed(a.totals.netCents)} tone={a.totals.netCents < 0 ? 'bad' : 'ok'}><span className="delta">In − refunds − suppliers</span></Kpi>
          <Kpi label="Still to collect" value={money(collect)}><span className="delta">From customers</span></Kpi>
          <Kpi label="Still to pay suppliers" value={money(owedCents)}><span className="delta">Unpaid invoices</span></Kpi>
          <Kpi label="Net once all settled" value={signed(settled)} tone={settled < 0 ? 'bad' : 'ok'}><span className="delta">Net + to collect − to pay</span></Kpi>
        </div>
      </section>
      <div className="todaygrid">
        <div className="sec">
          <h4>Month by month</h4>
          {a.months.length ? (
            <div className="tbl-wrap" style={{ boxShadow: 'none', border: 0 }}>
              <table className="cftbl">
                <thead><tr><th>Month</th><th className="r">Cash in</th><th className="r">Refunds</th><th className="r">Paid to suppliers</th><th className="r">Net</th><th className="r">Running total</th></tr></thead>
                <tbody>
                  {[...a.months].reverse().map((m) => (
                    <tr key={m.month}>
                      <td><b>{monthLabel(m.month)}</b></td>
                      <td className="r num">{money(m.inCents)}<span className="cfbar in" style={{ width: `${(m.inCents / max) * 100}%` }} /></td>
                      <td className="r num">{m.refundCents ? money(m.refundCents) : '—'}</td>
                      <td className="r num">{money(m.outCents)}<span className="cfbar out" style={{ width: `${(m.outCents / max) * 100}%` }} /></td>
                      <td className={`r num ${m.netCents < 0 ? 'neg' : ''}`}>{signed(m.netCents)}</td>
                      <td className={`r num ${m.balanceCents < 0 ? 'neg' : ''}`}><b>{signed(m.balanceCents)}</b></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td><b>Total</b></td><td className="r num"><b>{money(a.totals.inCents)}</b></td><td className="r num"><b>{money(a.totals.refundCents)}</b></td><td className="r num"><b>{money(a.totals.outCents)}</b></td><td className={`r num ${a.totals.netCents < 0 ? 'neg' : ''}`}><b>{signed(a.totals.netCents)}</b></td><td /></tr></tfoot>
              </table>
            </div>
          ) : <div className="kv">No payments recorded yet. They appear here once Shopify is connected.</div>}
        </div>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <div className="sec">
            <h4>Paid to each supplier</h4>
            <Bars rows={a.bySupplier} total={a.bySupplier[0]?.cents ?? 1} />
            <Link className="lnk" href="/hq/invoices" style={{ display: 'inline-block', marginTop: 8 }}>All invoices →</Link>
          </div>
          <div className="sec">
            <h4>About these figures</h4>
            <ul className="notes">
              <li><b>Cash in</b> is every payment taken on Shopify (PayFast, EFT, Shopify Payments), by the day it was paid.</li>
              <li><b>Paid to suppliers</b> comes from the invoices in the Order Desk and the COGS sheet.{a.undatedPayments ? ` ${a.undatedPayments} part-paid invoice${a.undatedPayments === 1 ? ' is' : 's are'} counted in the month issued.` : ''}</li>
              <li>Running costs (salaries, marketing, services) are not included yet. They are budgets in the COGS sheet, not payments.</li>
              <li>Shopify only shares the last 60 days of orders, so the Order Desk keeps its own copy of every payment it sees. To load older history too, add the <b>read_all_orders</b> permission to the Shopify app.</li>
              {a.ledgerError && <li className="err-text">Could not refresh from Shopify just now: {a.ledgerError}</li>}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
