import { NextResponse, type NextRequest } from 'next/server';

// Optimistic check only: no cookie -> login page. Every page and action still checks the
// session and role on the server (see lib/auth.ts requireRole).
export function proxy(req: NextRequest) {
  if (!req.cookies.get('pf_session')) {
    const url = new URL('/login', req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/hq/:path*', '/f/:path*'],
};
