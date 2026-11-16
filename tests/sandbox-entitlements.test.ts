import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEntitlements } from "@/lib/entitlements";
import { DEFAULT_PROFILE_CONFIG, normalizeProfileConfig } from "@/lib/profile-config";
import {
  buildSandboxCsp,
  buildSandboxedProfileDocument,
  isRequestOnSandboxHost,
} from "@/lib/sandbox";

const mockEnv = {
  APP_NAME: "null",
  APP_URL: "https://null.example",
  appOrigin: "https://null.example",
  proCssSandboxOrigin: "https://sandbox.null-usercontent.example" as string | null,
  proCssPublicEnabled: true,
};
const mockGetPublishedProfile = vi.fn();

vi.mock("@/lib/env", () => ({
  get env() {
    return mockEnv;
  },
}));
vi.mock("@/lib/profiles/service", () => ({
  getPublishedProfile: (...args: unknown[]) => mockGetPublishedProfile(...args),
}));

describe("getEntitlements — centralized plan & flag policy", () => {
  it("blocks custom CSS for everyone when FEATURE_PRO_CSS is off", () => {
    const ent = getEntitlements(
      { id: "u1", role: "ADMIN" },
      { featureProCss: false, proCssDevAll: false, proCssSandboxOrigin: "https://sb.example" },
    );
    expect(ent.canEditCustomCss).toBe(false);
    expect(ent.canPublishCustomCss).toBe(false);
    expect(ent.customCssStatus).toBe("feature_disabled");
    expect(ent.customCssDisabledReason).toBeTruthy();
  });

  it("blocks FREE users when FEATURE_PRO_CSS is on unless promoted to PRO or ADMIN", () => {
    const free = getEntitlements(
      { id: "u1", role: "USER" },
      { featureProCss: true, proCssDevAll: false, proCssSandboxOrigin: "https://sb.example" },
    );
    expect(free.plan).toBe("FREE");
    expect(free.canEditCustomCss).toBe(false);
    expect(free.canPublishCustomCss).toBe(false);
    expect(free.customCssStatus).toBe("plan_required");

    const proByPlan = getEntitlements(
      { id: "u2", role: "USER", plan: "PRO" },
      { featureProCss: true, proCssDevAll: false, proCssSandboxOrigin: "https://sb.example" },
    );
    expect(proByPlan.canEditCustomCss).toBe(true);
    expect(proByPlan.canPublishCustomCss).toBe(true);
    expect(proByPlan.customCssStatus).toBe("enabled");
    expect(proByPlan.customCssDisabledReason).toBeNull();

    const adminPro = getEntitlements(
      { id: "u9", role: "ADMIN" },
      { featureProCss: true, proCssDevAll: false, proCssSandboxOrigin: "https://sb.example" },
    );
    expect(adminPro.plan).toBe("PRO");
    expect(adminPro.canPublishCustomCss).toBe(true);
  });

  it("requires a distinct PRO_CSS_SANDBOX_ORIGIN even when FEATURE_PRO_CSS=true", () => {
    const admin = getEntitlements(
      { id: "u3", role: "ADMIN" },
      { featureProCss: true, proCssDevAll: false, proCssSandboxOrigin: null },
    );
    expect(admin.canEditCustomCss).toBe(false);
    expect(admin.canPublishCustomCss).toBe(false);
    expect(admin.customCssStatus).toBe("sandbox_origin_missing");
    expect(admin.customCssDisabledReason).toMatch(/PRO_CSS_SANDBOX_ORIGIN/);
  });
});

describe("buildSandboxedProfileDocument, CSP & host isolation", () => {
  const sampleProfile = {
    username: "aria",
    usernameDisplay: "Aria",
    displayName: 'Aria <script>alert("xss")</script>',
    avatarUrl: "/api/media/avatars/u1/pic.webp",
    headline: 'Builder & "designer"',
    bio: "Hello </style><img src=x onerror=alert(1)>",
    location: "Tirana",
    statusText: "Shipping V2",
    config: normalizeProfileConfig({
      ...DEFAULT_PROFILE_CONFIG,
      blocks: [
        {
          id: "b1",
          type: "text",
          visible: true,
          props: { content: "<script>evil()</script> safe text" },
        },
      ],
    }),
    links: [
      {
        id: "l1",
        label: "<b>GitHub</b>",
        url: "https://github.com/aria",
        icon: "GITHUB",
        highlight: true,
        visible: true,
      },
    ],
  };

  it("emits a zero-JS HTML document, escapes all user text, prefixes /api/media URLs, and scopes custom CSS", () => {
    const html = buildSandboxedProfileDocument({
      profile: sampleProfile,
      customCss: ".vp-card { border-color: #3fcf9f; } @keyframes bob { to { opacity: 1; } }",
      mediaOrigin: "https://null.example",
      appName: "null",
    });

    // No executable <script> or injected <img onerror=...> tags anywhere
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;GitHub&lt;/b&gt;");
    expect(html).toContain('src="https://null.example/api/media/avatars/u1/pic.webp"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain("data-null-custom-css");
    expect(html).toContain(".null-profile .vp-card");
    expect(html).toContain("@keyframes null-u-bob");
  });

  it("strips unsafe custom CSS on render even if raw CSS contained url()", () => {
    const html = buildSandboxedProfileDocument({
      profile: sampleProfile,
      customCss: ".vp-card { background: url(https://evil.example/leak.png); }",
      mediaOrigin: "https://null.example",
    });
    expect(html).not.toContain("data-null-custom-css");
    expect(html).not.toContain("evil.example");
  });

  it("builds a scriptless default-src 'none' CSP locked to appOrigin frame-ancestors", () => {
    const csp = buildSandboxCsp("https://null.example");
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain("script-src");
    expect(csp).not.toContain("connect-src");
    expect(csp).toContain("frame-ancestors https://null.example");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
  });

  it("verifies incoming Host matches PRO_CSS_SANDBOX_ORIGIN and never APP_URL", () => {
    const sandbox = "https://sandbox.null-usercontent.example";
    const app = "https://null.example";

    expect(
      isRequestOnSandboxHost(
        new Request("https://sandbox.null-usercontent.example/sandbox/profile/aria", {
          headers: { host: "sandbox.null-usercontent.example" },
        }),
        sandbox,
        app,
      ),
    ).toBe(true);

    // Primary APP_URL host MUST be rejected
    expect(
      isRequestOnSandboxHost(
        new Request("https://null.example/sandbox/profile/aria", {
          headers: { host: "null.example" },
        }),
        sandbox,
        app,
      ),
    ).toBe(false);

    // Misconfigured identical origin rejected
    expect(
      isRequestOnSandboxHost(
        new Request("https://null.example/sandbox/profile/aria", {
          headers: { host: "null.example" },
        }),
        app,
        app,
      ),
    ).toBe(false);
  });

  describe("GET /sandbox/profile/[username] route", () => {
    beforeEach(() => {
      mockEnv.proCssPublicEnabled = true;
      mockEnv.proCssSandboxOrigin = "https://sandbox.null-usercontent.example";
      mockGetPublishedProfile.mockReset();
    });

    it("returns 403 when hit on the primary APP_URL host", async () => {
      const { GET } = await import("@/app/sandbox/profile/[username]/route");
      const res = await GET(
        new Request("https://null.example/sandbox/profile/aria", {
          headers: { host: "null.example" },
        }),
        { params: Promise.resolve({ username: "aria" }) },
      );
      expect(res.status).toBe(403);
      expect(mockGetPublishedProfile).not.toHaveBeenCalled();
    });

    it("returns 404 when Pro CSS feature is disabled", async () => {
      mockEnv.proCssPublicEnabled = false;
      const { GET } = await import("@/app/sandbox/profile/[username]/route");
      const res = await GET(
        new Request("https://sandbox.null-usercontent.example/sandbox/profile/aria", {
          headers: { host: "sandbox.null-usercontent.example" },
        }),
        { params: Promise.resolve({ username: "aria" }) },
      );
      expect(res.status).toBe(404);
    });

    it("serves scriptless HTML with strict CSP when hit on the dedicated sandbox origin", async () => {
      mockGetPublishedProfile.mockResolvedValue({
        ...sampleProfile,
        publishedAt: new Date(),
        publishedCustomCss: ".vp-card { border-radius: 32px; }",
      });
      const { GET } = await import("@/app/sandbox/profile/[username]/route");
      const res = await GET(
        new Request("https://sandbox.null-usercontent.example/sandbox/profile/aria", {
          headers: { host: "sandbox.null-usercontent.example" },
        }),
        { params: Promise.resolve({ username: "aria" }) },
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
      const body = await res.text();
      expect(body).toContain(".null-profile .vp-card");
      expect(body).not.toContain("<script");
    });
  });
});
