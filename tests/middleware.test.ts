import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

// Middleware cannot know if a cookie represents an active database session.
// All authentication redirects must be left to validated server-side checks.
describe("middleware authentication regression", () => {
  it.each([undefined, "null_session=stale", "legacy_session=stale", "custom_session=revoked"])(
    "allows login and registration to validate sessions with cookie %s", (cookie) => {
      for (const path of ["/login?redirectTo=%2Fdashboard", "/register"]) {
        const response = middleware(new NextRequest(`http://localhost:3000${path}`, {
          headers: cookie ? { cookie } : {},
        }));
        expect(response.headers.get("location")).toBeNull();
        expect(response.headers.get("x-middleware-next")).toBe("1");
      }
    },
  );
  it.each(["/dashboard", "/dashboard/editor"])("leaves %s authentication to the server and disables caching", (path) => {
    const response = middleware(new NextRequest(`http://localhost:3000${path}`));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("x-permitted-cross-domain-policies")).toBe("none");
  });
  it("does not classify similarly named public profiles as private routes", () => {
    const response = middleware(new NextRequest("http://localhost:3000/dashboard-example"));
    expect(response.headers.get("cache-control")).toBeNull();
  });
});
