import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/** Web app manifest so the dashboard installs sensibly on a phone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: env.APP_NAME,
    short_name: env.APP_NAME,
    description: "A customizable personal identity platform.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f14",
    theme_color: "#1cb587",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
