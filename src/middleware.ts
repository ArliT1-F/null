import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware.
 *
 * Responsibilities are intentionally narrow:
 *  1. Send signed-out visitors away from authenticated routes.
 *  2. Add a strict baseline of security headers.
 *  3. Mark private areas as non-cacheable.
 *
 * Authorisation itself is *always* re-checked in the server component or route
 * handler; middleware is a fast redirect, not the security boundary.
 */

const PROTECTED_PREFIXES = ["/dashboard"];
const AUTH_PAGES = ["/login", "/register"];

const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME ?? "vessel_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSession && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?redirectTo=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  if (hasSession && AUTH_PAGES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();

  if (PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    response.headers.set("Cache-Control", "no-store, must-revalidate");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  response.headers.set("X-DNS-Prefetch-Control", "on");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, the media route and health checks. Media
     * and health must never be redirected or delayed by auth logic.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/media|api/health|robots.txt|sitemap.xml).*)",
  ],
};
