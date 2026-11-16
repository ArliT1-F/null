import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware.
 *
 * Responsibilities are intentionally narrow:
 * Add security headers and mark private areas as non-cacheable.
 *
 * Authentication redirects belong to server layouts/pages, which validate the
 * session against the database. Cookie presence alone is not authentication:
 * expired, revoked or pre-migration cookies would otherwise cause redirect loops.
 */

const PROTECTED_PREFIXES = ["/dashboard"];
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  if (PROTECTED_PREFIXES.some((prefix) => (pathname === prefix || pathname.startsWith(`${prefix}/`)))) {
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
