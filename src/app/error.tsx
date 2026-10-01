'use client';

// Shown instead of a blank or frozen page when something fails on the server.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="login">
      <div className="login-card">
        <div className="brand">POTTIES<small>Order Desk</small></div>
        <p><b>This page couldn’t load.</b> The app may not be able to reach its database right now.</p>
        <p>Open <a className="lnk" href="/api/health">/api/health</a> to see what’s wrong, or try again.</p>
        <button className="btn" onClick={() => reset()}>Try again</button>
      </div>
    </main>
  );
}
