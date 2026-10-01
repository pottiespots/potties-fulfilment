import Link from 'next/link';
import type { Event, Order, User } from '@/lib/db/schema';
import { STAGES, STAGE_SHORT, stageIndex, timeLeftLabel, urgency, isOpen, duration, DAY } from '@/lib/rules';
import { day, dayTime, time, initials, ymd } from '@/lib/format';
import { NavTabs, ThemeToggle } from './client';

export function Header({ user, tabs, sub, right }: { user: User; tabs: [string, string][]; sub: string; right?: React.ReactNode }) {
  return (
    <header className="top">
      <Link href={user.role === 'HQ' ? '/hq' : '/f'} className="brand" style={{ textDecoration: 'none' }}>POTTIES<small>{sub}</small></Link>
      <NavTabs tabs={tabs} />
      <div className="spacer" />
      {right}
      <div className="me">
        <span className="av">{initials(user.name)}</span>
        <span className="me-name"><b>{user.name}</b><br />{user.role === 'HQ' ? 'Potties HQ' : 'Foundry'}</span>
      </div>
      <ThemeToggle />
      <form action="/logout" method="post"><button className="btn ghost sm">Sign out</button></form>
    </header>
  );
}

export function Pill({ tone = 'mute', children }: { tone?: 'ok' | 'warn' | 'bad' | 'info' | 'mute'; children: React.ReactNode }) {
  return <span className={`pill p-${tone}`}>{children}</span>;
}

export function LeftPill({ o, now }: { o: Pick<Order, 'stage' | 'shipBy'>; now: Date }) {
  if (o.stage === 'SHIPPED') return <Pill tone="info">Tracking sent</Pill>;
  if (o.stage === 'DELIVERED') return <Pill tone="ok">Delivered</Pill>;
  const u = urgency(o.stage, o.shipBy, now);
  return <Pill tone={u === 'late' ? 'bad' : u === 'soon' ? 'warn' : 'mute'}>{timeLeftLabel(o.shipBy, now)}</Pill>;
}

export function Stepper({ stage }: { stage: Order['stage'] }) {
  const i = stageIndex(stage);
  return (
    <div className="stepper light">
      {STAGES.map((s, j) => <div key={s} className={`st ${j < i ? 'done' : j === i ? 'cur' : ''}`}>{STAGE_SHORT[s]}</div>)}
    </div>
  );
}

export function ShipTo({ o, now, extra }: { o: Order; now: Date; extra?: React.ReactNode }) {
  const u = urgency(o.stage, o.shipBy, now);
  const ms = o.shipBy.getTime() - now.getTime();
  return (
    <div className="shipto">
      <div className="address">
        <b>{o.customerName}</b><br />
        {o.address1}{o.address1 && <br />}
        {o.address2}{o.address2 && <br />}
        {[o.city, o.zip].filter(Boolean).join(' ')}<br />
        {[o.province, o.country].filter(Boolean).join(', ')}
        {o.phone && <><br />Tel {o.phone}</>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className={`shipby ${u === 'late' ? 'late' : u === 'soon' ? 'risk' : ''}`}>
          <div className="cap">Ship by</div>
          <div className="big">{day(o.shipBy)}</div>
          <div>{time(o.shipBy)} · {isOpen(o.stage) ? (ms < 0 ? `Late by ${duration(ms)}` : `${duration(ms)} left`) : 'Collected'}</div>
        </div>
        <div className="kv"><span>Courier</span>{o.courier ?? 'Not set'}{o.courierService ? ` · ${o.courierService}` : ''}</div>
        {o.deliveryNote && <div className="kv"><span>Delivery note</span>{o.deliveryNote}</div>}
        {extra}
      </div>
    </div>
  );
}

export function addressText(o: Order) {
  return [o.customerName, o.address1, o.address2, [o.city, o.zip].filter(Boolean).join(' '), [o.province, o.country].filter(Boolean).join(', '), o.phone ? `Tel ${o.phone}` : null]
    .filter(Boolean).join('\n');
}

export function Timeline({ events, showInternal }: { events: Event[]; showInternal?: boolean }) {
  return (
    <ul className="tl">
      {events.map((e) => (
        <li key={e.id}>
          <time>{dayTime(e.createdAt)}</time>
          <div>
            <span className={`who ${e.kind === 'system' ? 'sys' : ''}`}>{e.actor}</span>
            {showInternal && e.internal && <span className="internal">HQ only</span>} · {e.text}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Bars from received to ship-by over 16 days, with a "now" line. */
export function Gantt({ rows, now, hrefBase }: { rows: (Order & { label: string; from: Date })[]; now: Date; hrefBase: string }) {
  const start = new Date(now.getTime() - 5 * DAY); start.setUTCHours(0, 0, 0, 0);
  const days = 16, span = days * DAY;
  const pct = (t: Date) => Math.max(0, Math.min(100, ((t.getTime() - start.getTime()) / span) * 100));
  const n = pct(now), today = ymd(now);
  return (
    <div className="gantt-wrap">
      <div className="gantt">
        <div />
        <div className="g-days">
          {Array.from({ length: days }, (_, i) => {
            const d = new Date(start.getTime() + i * DAY + 12 * 36e5);
            const wd = d.getUTCDay();
            return (
              <div key={i} className={`g-day ${wd === 0 || wd === 6 ? 'wk' : ''} ${ymd(d) === today ? 'today' : ''}`} style={{ left: `${(i / days) * 100}%`, width: `${100 / days}%` }}>
                {day(d).split(' ')[0].replace(',', '')}<br />{Number(ymd(d).slice(8))}
              </div>
            );
          })}
        </div>
        {rows.map((o) => {
          const u = urgency(o.stage, o.shipBy, now);
          const a = pct(o.from), b = pct(o.shipBy);
          const used = b > a ? Math.max(0, Math.min(100, ((n - a) / (b - a)) * 100)) : 100;
          return [
            <Link key={o.id + 'l'} href={`${hrefBase}/${o.id}`} className="g-label" style={{ textDecoration: 'none', color: 'inherit' }}>
              <b>{o.name} · {o.label}</b><span>{o.customerName} · {o.city ?? ''}</span>
            </Link>,
            <div key={o.id + 't'} className="g-track">
              <div className={`g-bar ${u === 'late' ? 'late' : u === 'soon' ? 'risk' : ''}`} style={{ left: `${a}%`, width: `${Math.max(1, b - a)}%` }}><i style={{ width: `${used}%` }} /></div>
              <div className={`g-pin ${u === 'late' ? 'late' : ''}`} style={{ left: `calc(${b}% - 1px)` }} title={`Ship by ${dayTime(o.shipBy)}`} />
              <div className="g-now" style={{ left: `${n}%` }} />
            </div>,
          ];
        })}
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--ember)' }} />Time used</span><span><i style={{ background: 'var(--line)' }} />Time left</span>
        <span><i style={{ background: 'var(--warn)' }} />Ships within 3 days</span><span><i style={{ background: 'var(--bad)' }} />Late</span>
      </div>
    </div>
  );
}

export function PickupAgenda({ rows, now, hrefBase, label }: { rows: Order[]; now: Date; hrefBase: string; label: (o: Order) => string }) {
  return (
    <div className="agenda">
      {Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now.getTime() + i * DAY);
        const its = rows.filter((o) => ymd(o.shipBy) === ymd(d));
        return (
          <div key={i} className={`aday ${i === 0 ? 'today' : ''}`}>
            <h4>{i === 0 ? 'Today' : day(d)}<span className="num">{its.length || ''}</span></h4>
            {its.length ? its.map((o) => (
              <Link key={o.id} href={`${hrefBase}/${o.id}`} style={{ display: 'block', textDecoration: 'none', borderTop: '1px solid var(--line)', padding: '6px 0', fontSize: 13 }}>
                <b>{time(o.shipBy)}</b> · {o.name} · {o.city}<br /><span style={{ color: 'var(--muted)' }}>{label(o)}</span>
              </Link>
            )) : <span style={{ fontSize: 13, color: 'var(--faint)' }}>No pickups</span>}
          </div>
        );
      })}
    </div>
  );
}

export function Tile({ v, l, s, tone = '' }: { v: React.ReactNode; l: string; s?: string; tone?: '' | 'hot' | 'bad' | 'warn' }) {
  return <div className={`ftile ${tone}`}><span className="v num">{v}</span><span className="l">{l}</span>{s && <span className="s">{s}</span>}</div>;
}
