/** Shown instantly while a page's data loads, so taps feel immediate. */
export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <main className="page" aria-busy="true" aria-label="Loading">
      <div className="sk sk-title" />
      <div className="sk sk-sub" />
      <div className="ftiles">{Array.from({ length: 4 }, (_, i) => <div key={i} className="ftile"><div className="sk sk-num" /><div className="sk sk-line" /></div>)}</div>
      <div className="jobs">{Array.from({ length: rows }, (_, i) => <div key={i} className="sk sk-row" />)}</div>
    </main>
  );
}
