import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/sora";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/outfit";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/fira-code";
import "./globals.css";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(env.APP_URL),
  title: {
    default: `${env.APP_NAME} — your corner of the internet`,
    template: `%s · ${env.APP_NAME}`,
  },
  description:
    "Build a profile that actually feels like you. Design it visually, publish it at your own URL, and keep it in sync in seconds.",
  applicationName: env.APP_NAME,
  openGraph: {
    type: "website",
    siteName: env.APP_NAME,
    url: env.APP_URL,
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f14" },
  ],
  width: "device-width",
  initialScale: 1,
};

/** Applies the saved theme before paint so a dark-mode user never sees a flash. */
const themeScript = `
(function(){
  try {
    var stored = localStorage.getItem('null-theme');
    var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* Extensions also set scheme/background values on the root elements;
          the <html> flag does not cover <body>, and suppression never
          inherits. See the note on <Icon> in components/ui.tsx. */}
      <body className="min-h-dvh" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
