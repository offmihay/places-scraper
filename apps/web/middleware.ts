import { NextResponse, type NextRequest } from 'next/server';

/**
 * The auth flag lives in localStorage (client-side) so middleware can't read
 * it. We do a cheap structural redirect: if you hit '/' send to login; the
 * (admin) client layout enforces the real check via lib/auth.
 */
export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/'],
};
