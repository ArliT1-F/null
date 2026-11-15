import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/** Robots directives. Private and authenticated areas are never crawlable. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/explore", "/docs", "/legal"],
        disallow: ["/dashboard", "/api/", "/login", "/register", "/forgot-password", "/reset-password", "/verify"],
      },
    ],
    sitemap: `${env.APP_URL}/sitemap.xml`,
    host: env.APP_URL,
  };
}
