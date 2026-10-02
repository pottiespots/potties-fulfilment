'use client';
import { createContext, useContext, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

type Res = { ok?: string; error?: string } | null;
type FormAction = (prev: Res, fd: FormData) => Promise<Res>;

function Msg({ r }: { r: Res }) {
  if (!r) return null;
  return r.error ? <div className="flash err" role="alert">{r.error}</div> : r.ok ? <div className="flash ok" role="status">{r.ok}</div> : null;
}

const Pending = createContext(false);

export function Submit({ children, className = 'btn', disabled }: { children: React.ReactNode; className?: string; disabled?: boolean }) {
  const pending = useContext(Pending);
  return <button className={className} disabled={disabled || pending} aria-busy={pending}>{pending ? 'Saving…' : children}</button>;
}

/** Runs a server action on submit and shows the result. Unlike <form action>, it keeps what was
 *  typed when the action returns an error (React 19 resets action forms after every submit). */
export function useActForm(action: FormAction, resetOnOk?: boolean) {
  const [r, setR] = useState<Res>(null);
  const [pending, start] = useTransition();
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form, (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null);
    start(async () => {
      const res = await action(r, fd);
      setR(res);
      if (res?.ok && resetOnOk) form.reset();
    });
  };
  return { r, pending, onSubmit };
}

export function ActForm({ action, children, className, resetOnOk, id }: { action: FormAction; children: React.ReactNode; className?: string; resetOnOk?: boolean; id?: string }) {
  const { r, pending, onSubmit } = useActForm(action, resetOnOk);
  return (
    <Pending.Provider value={pending}>
      <form onSubmit={onSubmit} className={className} id={id}>
        {children}
        <Msg r={r} />
      </form>
    </Pending.Provider>
  );
}

export { Msg };

/** One-click action button (accept, approve, mark paid…). */
export function ActButton({ action, children, className = 'btn', confirm }: { action: () => Promise<Res>; children: React.ReactNode; className?: string; confirm?: string }) {
  const [pending, start] = useTransition();
  const [r, setR] = useState<Res>(null);
  const [asking, setAsking] = useState(false);
  const go = () => start(async () => { setR(await action()); setAsking(false); });
  if (asking) {
    return (
      <span className="btns">
        <span className="kv">{confirm}</span>
        <button type="button" className={className} onClick={go} disabled={pending}>{pending ? 'Saving…' : 'Yes'}</button>
        <button type="button" className="btn ghost sm" onClick={() => setAsking(false)}>Cancel</button>
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button type="button" className={className} disabled={pending} onClick={() => (confirm ? setAsking(true) : go())}>{pending ? 'Saving…' : children}</button>
      {r?.error && <span className="err-text act-err" role="alert">{r.error}</span>}
      {r?.ok && <span className="ok-text" role="status">{r.ok}</span>}
    </span>
  );
}

export function CheckToggle({ action, checked, disabled, children }: { action: (v: boolean) => Promise<Res>; checked: boolean; disabled?: boolean; children: React.ReactNode }) {
  const [pending, start] = useTransition();
  const [v, setV] = useState(checked);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setV(checked), [checked]);
  return (
    <label className="check">
      <input type="checkbox" checked={v} disabled={disabled || pending}
        onChange={(e) => { const nv = e.target.checked; setV(nv); start(async () => { const r = await action(nv); if (r?.error) { setV(!nv); setErr(r.error); } else setErr(null); }); }} />
      <span>{children}{err && <><br /><span className="err-text">{err}</span></>}</span>
    </label>
  );
}

/** Shrinks phone photos in the browser (max 1600 px, JPEG ~300 KB) so uploads are quick on mobile data
 *  and the free storage tier lasts. */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 400_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.8));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file; // e.g. HEIC on a browser that can't decode it: send as is
  }
}

export function UploadSlot({ action, kind, label, filled, required, previewUrl, disabled, accept = 'image/*,application/pdf' }:
  { action: FormAction; kind: string; label: string; filled: boolean; required?: boolean; previewUrl?: string | null; disabled?: boolean; accept?: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <label className={`slot ${filled ? 'filled' : ''} ${pending ? 'busy' : ''}`} aria-disabled={disabled}>
        {previewUrl && <img src={previewUrl} alt={label} />}
        <span className="lbl">{filled ? '✓ ' : ''}{label}{required && !filled ? ' *' : ''}</span>
        {!filled && <span style={{ marginTop: 4 }}>{pending ? 'Uploading…' : disabled ? 'Not available' : 'Tap to upload'}</span>}
        {filled && !disabled && <span className="lbl" style={{ marginTop: 4, fontWeight: 400 }}>{pending ? 'Uploading…' : 'Tap to add another'}</span>}
        <input type="file" accept={accept} disabled={disabled || pending}
          onChange={(e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            start(async () => {
              const fd = new FormData(); fd.set('kind', kind); fd.set('file', await shrink(f));
              const r = await action(null, fd); setErr(r?.error ?? null);
            });
          }} />
      </label>
      {err && <div className="err-text" role="alert">{err}</div>}
    </div>
  );
}

export function NoteBox({ action, presets, allowInternal }: { action: FormAction; presets: string[]; allowInternal?: boolean }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  return (
    <ActForm action={action} resetOnOk>
      <div className="presets">
        {presets.map((p) => (
          <button type="button" key={p} className="chip" onClick={() => { if (ta.current) { ta.current.value = p; ta.current.focus(); } }}>{p.replace(/: $/, '')}</button>
        ))}
      </div>
      <div className="btns">
        <label className="field" style={{ flex: 1, minWidth: 200 }}>
          <textarea ref={ta} id="note-text" name="text" rows={2} placeholder="Type a note for this order" aria-label="Note" />
        </label>
        <Submit>Add note</Submit>
      </div>
      {allowInternal && <label className="check" style={{ border: 0, paddingTop: 4 }}><input type="checkbox" name="internal" /><span>HQ only (the foundry won’t see this note)</span></label>}
    </ActForm>
  );
}

export function CopyButton({ text, label = 'Copy address' }: { text: string; label?: string }) {
  const [done, setDone] = useState<string | null>(null);
  return (
    <button type="button" className="btn ghost sm" onClick={() => {
      navigator.clipboard.writeText(text).then(() => setDone('Copied'), () => setDone('Select and copy'));
      setTimeout(() => setDone(null), 2000);
    }}>{done ?? label}</button>
  );
}

export function NavTabs({ tabs }: { tabs: [string, string][] }) {
  const path = usePathname();
  const active = (href: string) => (href === '/hq' || href === '/f' ? path === href : path.startsWith(href));
  return (
    <nav className="tabs" aria-label="Main">
      {tabs.map(([href, label]) => (
        <Link key={href} href={href} className="tab" aria-current={active(href) ? 'page' : undefined}>{label}</Link>
      ))}
    </nav>
  );
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  return (
    <button type="button" className="btn ghost sm" aria-pressed={dark} onClick={() => {
      const v = !dark; setDark(v);
      document.documentElement.classList.toggle('dark', v);
      document.cookie = `pf_theme=${v ? 'dark' : 'light'}; path=/; max-age=31536000; samesite=lax`;
    }} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>{dark ? 'Light' : 'Dark'}</button>
  );
}

/** Search box that filters rows by data-search text without a round trip. */
export function FilterBox({ target, placeholder }: { target: string; placeholder: string }) {
  return (
    <input className="search" type="search" placeholder={placeholder} aria-label={placeholder}
      onChange={(e) => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll<HTMLElement>(`${target} [data-search]`).forEach((el) => { el.hidden = !!q && !el.dataset.search!.toLowerCase().includes(q); });
      }} />
  );
}

/** Dropdown that opens a link: used for "Sort by" lists. */
export function LinkSelect({ label, value, options }: { label: string; value: string; options: { value: string; label: string; href: string }[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <label className="sortsel" aria-busy={pending || undefined}>
      <span>{label}</span>
      <select value={value} onChange={(e) => { const o = options.find((x) => x.value === e.target.value); if (o) start(() => router.push(o.href)); }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
