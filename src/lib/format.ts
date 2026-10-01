// Dates are always shown in South African time, whatever the server's timezone.
const TZ = 'Africa/Johannesburg';

const fDay = new Intl.DateTimeFormat('en-ZA', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const fTime = new Intl.DateTimeFormat('en-ZA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const fLong = new Intl.DateTimeFormat('en-ZA', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fYmd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export const day = (d: Date) => fDay.format(d);
export const time = (d: Date) => fTime.format(d);
export const dayTime = (d: Date) => `${fDay.format(d)}, ${fTime.format(d)}`;
export const longDate = (d: Date) => fLong.format(d);
/** YYYY-MM-DD in SA time, for grouping by calendar day and for <input type="date">. */
export const ymd = (d: Date) => fYmd.format(d);

/** Value for <input type="datetime-local"> in SA time. */
export function toLocalInput(d: Date) {
  return `${ymd(d)}T${fTime.format(d)}`;
}
/** Parse a datetime-local / date value typed in SA time (UTC+2, no daylight saving). */
export function fromLocalInput(v: string): Date | null {
  if (!v) return null;
  const s = v.length === 10 ? `${v}T12:00` : v;
  const d = new Date(`${s}:00+02:00`);
  return isNaN(d.getTime()) ? null : d;
}

export function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat('en-ZA', { timeZone: TZ, hour: 'numeric', hour12: false }).format(now));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function initials(name: string) {
  return name.split(/\s+/).filter((p) => /^\p{L}/u.test(p)).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || '?';
}
