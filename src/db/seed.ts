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
    description: "Deep midnight blues with a green horizon. The default null look.",
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
  {
    slug: "prism-mesh",
    name: "Prism Mesh",
    category: "Atmospheric",
    description: "Luminous three-point mesh gradient with frosted glass buttons.",
    sortOrder: 130,
    tokens: {
      background: {
        type: "mesh",
        color: "#090b14",
        gradientFrom: "#1d2b64",
        gradientMid: "#2c1654",
        gradientTo: "#0f3d3e",
      },
      card: { surface: "#ffffff", opacity: 7, borderColor: "#ffffff", borderOpacity: 16, blur: 20, radius: "xl" },
      text: { primary: "#f8fafc", muted: "#b6c2d9", accent: "#67e8f9" },
      typography: { font: "space-grotesk", headingWeight: "700" },
      buttons: { style: "glass", radius: "xl", fillOpacity: 10 },
      effects: { animatedBackground: true, backgroundMotion: "aurora", glow: true, entrance: "blur", stagger: true },
    },
  },
  {
    slug: "editorial-rose",
    name: "Editorial Rose",
    category: "Editorial",
    description: "Playfair headlines over blush linen and deep burgundy ink.",
    sortOrder: 140,
    tokens: {
      background: { type: "solid", color: "#fbf4f2" },
      card: { surface: "#ffffff", opacity: 96, borderColor: "#4a1c2a", borderOpacity: 12, shadow: "soft", radius: "lg" },
      text: { primary: "#261119", muted: "#73545e", accent: "#9f1239" },
      typography: { font: "dm-sans", headingFont: "playfair", headingWeight: "700", lineHeight: 1.6 },
      buttons: { style: "outline", radius: "full", fillOpacity: 4 },
      effects: { animatedBackground: false, glow: false, entrance: "fade", cardHover: "lift" },
    },
  },
  {
    slug: "tokyo-midnight",
    name: "Tokyo Midnight",
    category: "Neon",
    description: "Electric magenta and indigo mesh built for night-owl creators.",
    sortOrder: 150,
    tokens: {
      background: {
        type: "mesh",
        color: "#080710",
        gradientFrom: "#241142",
        gradientMid: "#3b0a2a",
        gradientTo: "#0b2244",
      },
      card: { surface: "#0e0c1d", opacity: 84, borderColor: "#f472b6", borderOpacity: 24, blur: 16, radius: "xl" },
      text: { primary: "#fdf4ff", muted: "#c4b5d6", accent: "#f472b6" },
      typography: { font: "outfit", headingWeight: "700" },
      buttons: { style: "soft", radius: "lg", fillOpacity: 12 },
      effects: { animatedBackground: true, backgroundMotion: "pulse", glow: true, noise: true, cardHover: "glow" },
    },
  },
  {
    slug: "matcha-studio",
    name: "Matcha Studio",
    category: "Warm",
    description: "Calm sage ceramic tones paired with crisp geometric type.",
    sortOrder: 160,
    tokens: {
      background: { type: "gradient", color: "#eef3ec", gradientFrom: "#f3f6ef", gradientTo: "#e3ecde", gradientAngle: 160 },
      card: { surface: "#ffffff", opacity: 92, borderColor: "#2d4732", borderOpacity: 12, shadow: "soft", radius: "xl" },
      text: { primary: "#18261c", muted: "#556b5b", accent: "#2f6f44" },
      typography: { font: "jakarta", headingWeight: "700" },
      buttons: { style: "soft", radius: "lg", fill: "#2f6f44", fillOpacity: 10 },
      effects: { animatedBackground: false, glow: false, entrance: "rise", stagger: true },
    },
  },
  {
    slug: "blueprint",
    name: "Blueprint",
    category: "Developer",
    description: "Drafting-table cobalt and JetBrains Mono for systems builders.",
    sortOrder: 170,
    tokens: {
      background: { type: "gradient", gradientFrom: "#07182e", gradientTo: "#0b2748", gradientAngle: 145 },
      card: { surface: "#061529", opacity: 90, borderColor: "#60a5fa", borderOpacity: 32, radius: "sm", blur: 6 },
      text: { primary: "#e8f2ff", muted: "#8fb3d9", accent: "#60a5fa" },
      typography: { font: "jetbrains-mono", baseSize: 14, headingWeight: "600", letterSpacing: -0.5 },
      buttons: { style: "outline", radius: "sm", fillOpacity: 8 },
      effects: { animatedBackground: false, glow: true, entrance: "fade" },
    },
  },
  {
    slug: "cobalt-glass",
    name: "Cobalt Glass",
    category: "Glass",
    description: "Translucent sapphire panel floating over a deep ocean gradient.",
    sortOrder: 180,
    tokens: {
      background: {
        type: "gradient",
        gradientFrom: "#081226",
        gradientMid: "#0f2c59",
        gradientTo: "#0b192c",
        gradientAngle: 125,
      },
      card: { surface: "#ffffff", opacity: 8, borderColor: "#93c5fd", borderOpacity: 22, blur: 24, radius: "xl" },
      text: { primary: "#f0f7ff", muted: "#a6c1e1", accent: "#38bdf8" },
      typography: { font: "jakarta", headingFont: "space-grotesk", headingWeight: "700" },
      buttons: { style: "glass", radius: "lg", fillOpacity: 10 },
      effects: { animatedBackground: true, backgroundMotion: "drift", glow: true, entrance: "scale" },
    },
  },
  {
    slug: "solstice",
    name: "Solstice",
    category: "Atmospheric",
    description: "Golden-hour amber melting into dusk terracotta and plum.",
    sortOrder: 190,
    tokens: {
      background: {
        type: "mesh",
        color: "#170d12",
        gradientFrom: "#4a1d1f",
        gradientMid: "#3b1d36",
        gradientTo: "#2d1f0d",
      },
      card: { surface: "#ffffff", opacity: 6, borderColor: "#fdba74", borderOpacity: 18, blur: 18, radius: "xl" },
      text: { primary: "#fff7ed", muted: "#d6b8a6", accent: "#fb923c" },
      typography: { font: "dm-sans", headingFont: "outfit", headingWeight: "700" },
      buttons: { style: "soft", radius: "full", fillOpacity: 10 },
      effects: { animatedBackground: true, backgroundMotion: "aurora", glow: true, noise: true, stagger: true },
    },
  },
  {
    slug: "cyber-grid",
    name: "Cyber Grid",
    category: "Developer",
    description: "Sharp zero-radius Fira Code terminal card with acid cyan trim.",
    sortOrder: 200,
    tokens: {
      background: { type: "solid", color: "#05080a" },
      card: {
        surface: "#0a1014",
        opacity: 96,
        borderColor: "#22d3ee",
        borderOpacity: 36,
        borderWidth: 1,
        radius: "none",
        shadow: "strong",
      },
      text: { primary: "#ecfeff", muted: "#7ca2ab", accent: "#22d3ee" },
      typography: { font: "fira-code", baseSize: 14, headingWeight: "600" },
      buttons: { style: "outline", radius: "none", fillOpacity: 8 },
      effects: { animatedBackground: true, backgroundMotion: "pulse", glow: true, entrance: "rise", cardHover: "glow" },
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
  const password = process.env.SEED_ADMIN_PASSWORD ?? "null-admin-2026";
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

const isDirectRun =
  typeof process !== "undefined" &&
  typeof process.argv[1] === "string" &&
  /[/\\]seed\.(ts|js|mjs)$/.test(process.argv[1]);

if (isDirectRun) {
  main().catch(async (error) => {
    console.error("[seed] failed", error);
    await pool.end().catch(() => {});
    process.exit(1);
  });
}
