/**
 * Seed script.
 *
 * Idempotent: safe to run repeatedly (`npm run db:seed`). It populates the theme
 * catalogue and, in non-production environments, an admin account for testing.
 *
 * It does NOT create fake users or fake profiles — demo content in a production
 * database is exactly the kind of thing that erodes trust in a product.
 */

import { eq } from "drizzle-orm";
import { db, pool } from "./client";
import { themes, users, profiles } from "./schema";
import { DEFAULT_PROFILE_CONFIG } from "@/lib/profile-config";
import { hashPassword } from "@/lib/password";

type ThemeSeed = {
  slug: string;
  name: string;
  category: string;
  description: string;
  sortOrder: number;
  tokens: Record<string, unknown>;
};

export const THEME_SEEDS: ThemeSeed[] = [
  {
    slug: "aurora",
    name: "Aurora",
    category: "Dark",
    description: "Deep midnight blues with a green horizon. The default Vessel look.",
    sortOrder: 10,
    tokens: {
      background: { type: "gradient", gradientFrom: "#101a2b", gradientTo: "#0a2a22", gradientAngle: 140 },
      text: { primary: "#f5f7fa", muted: "#a3adbf", accent: "#3fcf9f" },
      card: { surface: "#ffffff", opacity: 6, borderColor: "#ffffff", borderOpacity: 12, radius: "xl" },
      effects: { animatedBackground: true, glow: true },
    },
  },
  {
    slug: "graphite",
    name: "Graphite",
    category: "Minimal",
    description: "Neutral charcoal, thin borders, no colour noise. Lets content speak.",
    sortOrder: 20,
    tokens: {
      background: { type: "solid", color: "#17181c" },
      card: { surface: "#1e2027", opacity: 92, borderColor: "#ffffff", borderOpacity: 8, radius: "md", shadow: "soft" },
      text: { primary: "#e8eaee", muted: "#9aa0ad", accent: "#c8cdd8" },
      typography: { font: "sora", letterSpacing: -0.2 },
      buttons: { style: "outline", radius: "md", fillOpacity: 0 },
      effects: { animatedBackground: false, glow: false },
    },
  },
  {
    slug: "paper",
    name: "Paper",
    category: "Light",
    description: "Warm off-white with ink-black type. Comfortable to read, quietly editorial.",
    sortOrder: 30,
    tokens: {
      background: { type: "solid", color: "#f7f4ee" },
      card: { surface: "#ffffff", opacity: 96, borderColor: "#d8d2c6", borderOpacity: 100, radius: "lg", shadow: "soft" },
      text: { primary: "#1c1a17", muted: "#6b655c", accent: "#b4653c" },
      typography: { font: "serif", baseSize: 16, lineHeight: 1.65 },
      buttons: { style: "outline", radius: "lg", fillOpacity: 0 },
      effects: { animatedBackground: false, glow: false },
    },
  },
  {
    slug: "manga",
    name: "Manga",
    category: "Anime",
    description: "High-contrast pink panels with crisp black type. Panel-inspired layout energy.",
    sortOrder: 40,
    tokens: {
      background: { type: "gradient", gradientFrom: "#fdf2f8", gradientTo: "#fce7f3", gradientAngle: 160 },
      card: { surface: "#ffffff", opacity: 80, borderColor: "#f472b6", borderOpacity: 60, borderWidth: 2, radius: "lg" },
      text: { primary: "#2b0a1d", muted: "#8d5570", accent: "#ec4899" },
      typography: { font: "sora", headingWeight: "800" },
      buttons: { style: "solid", radius: "lg", fillOpacity: 14 },
      effects: { animatedBackground: false, glow: false, entrance: "fade" },
    },
  },
  {
    slug: "terminal",
    name: "Terminal",
    category: "Developer",
    description: "Monospace, near-black, phosphor green accents. For people who live in a shell.",
    sortOrder: 50,
    tokens: {
      background: { type: "solid", color: "#08090b" },
      card: { surface: "#0d1117", opacity: 96, borderColor: "#1f6feb", borderOpacity: 24, radius: "sm", shadow: "none" },
      text: { primary: "#d7e2ee", muted: "#7d8998", accent: "#4ade80" },
      typography: { font: "mono", baseSize: 14, letterSpacing: 0.3, lineHeight: 1.6 },
      buttons: { style: "outline", radius: "sm", fillOpacity: 0 },
      effects: { animatedBackground: false, glow: false },
    },
  },
  {
    slug: "neon-grid",
    name: "Neon Grid",
    category: "Cyberpunk",
    description: "Electric magenta and cyan over a black void. Loud on purpose.",
    sortOrder: 60,
    tokens: {
      background: { type: "gradient", gradientFrom: "#12001f", gradientTo: "#001f2a", gradientAngle: 200 },
      card: { surface: "#0a0014", opacity: 76, borderColor: "#f0abfc", borderOpacity: 30, radius: "md", blur: 18 },
      text: { primary: "#f5e8ff", muted: "#b79ccc", accent: "#22d3ee" },
      typography: { font: "sora", headingWeight: "800", letterSpacing: 0.6 },
      buttons: { style: "glass", radius: "md", fillOpacity: 12 },
      effects: { animatedBackground: true, glow: true, noise: true },
    },
  },
  {
    slug: "frost",
    name: "Frost",
    category: "Glassmorphism",
    description: "Icy blues and heavy blur. Looks best over a photo background.",
    sortOrder: 70,
    tokens: {
      background: { type: "gradient", gradientFrom: "#1e3a5f", gradientTo: "#0b1c2c", gradientAngle: 135 },
      card: { surface: "#ffffff", opacity: 12, borderColor: "#ffffff", borderOpacity: 22, radius: "xl", blur: 24 },
      text: { primary: "#f0f6ff", muted: "#b3c6de", accent: "#7dd3fc" },
      buttons: { style: "glass", radius: "full", fillOpacity: 14 },
      effects: { animatedBackground: true, glow: true },
    },
  },
  {
    slug: "editorial",
    name: "Editorial",
    category: "Professional",
    description: "Serif headings, generous leading, restrained palette. Portfolio-ready.",
    sortOrder: 80,
    tokens: {
      background: { type: "solid", color: "#fbfbfa" },
      card: { surface: "#ffffff", opacity: 100, borderColor: "#e5e5e2", borderOpacity: 100, radius: "sm", shadow: "soft", padding: 36 },
      text: { primary: "#101010", muted: "#5f5f5c", accent: "#1f6feb" },
      typography: { font: "serif", baseSize: 16, letterSpacing: -0.1, lineHeight: 1.7, headingWeight: "600" },
      buttons: { style: "outline", radius: "sm", fillOpacity: 0 },
      effects: { animatedBackground: false, glow: false, entrance: "fade" },
    },
  },
  {
    slug: "sunset",
    name: "Sunset",
    category: "Creative",
    description: "Amber to violet gradient with warm highlights. Soft and confident.",
    sortOrder: 90,
    tokens: {
      background: { type: "gradient", gradientFrom: "#3b1d3d", gradientTo: "#7a3b2e", gradientAngle: 160 },
      card: { surface: "#fff7ed", opacity: 8, borderColor: "#fdba74", borderOpacity: 20, radius: "xl", blur: 20 },
      text: { primary: "#fff7ed", muted: "#e2c2b4", accent: "#fbbf24" },
      typography: { font: "sora" },
      buttons: { style: "soft", radius: "full", fillOpacity: 12 },
      effects: { animatedBackground: true, glow: true },
    },
  },
  {
    slug: "arcade",
    name: "Arcade",
    category: "Gaming",
    description: "Deep violet with a punchy lime accent and chunky radii.",
    sortOrder: 100,
    tokens: {
      background: { type: "gradient", gradientFrom: "#1a0b2e", gradientTo: "#2d1b4e", gradientAngle: 135 },
      card: { surface: "#12081f", opacity: 88, borderColor: "#a3e635", borderOpacity: 18, radius: "lg", borderWidth: 2 },
      text: { primary: "#f4f1ff", muted: "#a99bc4", accent: "#a3e635" },
      typography: { font: "sora", headingWeight: "800" },
      buttons: { style: "solid", radius: "lg", fillOpacity: 16 },
      effects: { animatedBackground: true, glow: true },
    },
  },
  {
    slug: "mono-light",
    name: "Mono Light",
    category: "Minimal",
    description: "Pure black type on white, hairline rules. Maximum clarity.",
    sortOrder: 110,
    tokens: {
      background: { type: "solid", color: "#ffffff" },
      card: { surface: "#ffffff", opacity: 100, borderColor: "#111111", borderOpacity: 100, radius: "none", shadow: "none", padding: 32 },
      text: { primary: "#0a0a0a", muted: "#5c5c5c", accent: "#0a0a0a" },
      typography: { font: "system", letterSpacing: 0, lineHeight: 1.5 },
      buttons: { style: "outline", radius: "none", fillOpacity: 0 },
      effects: { animatedBackground: false, glow: false, entrance: "none" },
    },
  },
  {
    slug: "vinyl",
    name: "Vinyl",
    category: "Music",
    description: "Warm black and brass, built for artists and producers.",
    sortOrder: 120,
    tokens: {
      background: { type: "gradient", gradientFrom: "#1a1410", gradientTo: "#2b2018", gradientAngle: 150 },
      card: { surface: "#0f0b08", opacity: 92, borderColor: "#d4a373", borderOpacity: 22, radius: "lg" },
      text: { primary: "#f6efe6", muted: "#b8a894", accent: "#d4a373" },
      typography: { font: "serif", headingWeight: "600" },
      buttons: { style: "soft", radius: "full", fillOpacity: 10 },
      effects: { animatedBackground: true, glow: true },
    },
  },
];

async function seedThemes() {
  for (const theme of THEME_SEEDS) {
    const existing = await db.select({ id: themes.id }).from(themes).where(eq(themes.slug, theme.slug)).limit(1);
    if (existing.length > 0) {
      await db
        .update(themes)
        .set({
          name: theme.name,
          category: theme.category,
          description: theme.description,
          sortOrder: theme.sortOrder,
          tokens: theme.tokens,
          isActive: true,
        })
        .where(eq(themes.slug, theme.slug));
    } else {
      await db.insert(themes).values({
        slug: theme.slug,
        name: theme.name,
        category: theme.category,
        description: theme.description,
        sortOrder: theme.sortOrder,
        tokens: theme.tokens,
        isActive: true,
        isPremium: false,
      });
    }
  }
  console.log(`[seed] themes: ${THEME_SEEDS.length} upserted`);
}

async function seedAdmin() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_ADMIN !== "true") {
    console.log("[seed] skipping admin account in production (set SEED_ADMIN=true to force)");
    return;
  }

  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@localhost";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "vessel-admin-2026";
  const username = process.env.SEED_ADMIN_USERNAME ?? "admin";

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    console.log(`[seed] admin account already exists (${email})`);
    return;
  }

  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email,
        passwordHash,
        role: "ADMIN",
        username,
        usernameDisplay: username,
        displayName: "Administrator",
        emailVerifiedAt: new Date(),
      })
      .returning({ id: users.id });

    await tx.insert(profiles).values({
      userId: user.id,
      draftConfig: DEFAULT_PROFILE_CONFIG,
      themeSlug: "aurora",
    });
  });

  console.log(`[seed] admin account created: ${email} / ${password}`);
}

async function main() {
  await seedThemes();
  await seedAdmin();
  await pool.end();
  console.log("[seed] done");
}

main().catch(async (error) => {
  console.error("[seed] failed", error);
  await pool.end().catch(() => {});
  process.exit(1);
});
