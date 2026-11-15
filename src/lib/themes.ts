import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { themes, type Theme } from "@/db/schema";

export type ThemeCard = {
  slug: string;
  name: string;
  category: string;
  description: string;
  tokens: Record<string, unknown>;
  isPremium: boolean;
};

/**
 * In-memory cache for the (small, read-mostly) theme catalogue. Themes change
 * only when an admin edits them, so a 60s TTL plus an explicit bust on write is
 * plenty, and it keeps the profile editor's landing page off the database.
 */
let cache: { at: number; values: ThemeCard[] } | null = null;
const TTL_MS = 60_000;

export function invalidateThemeCache() {
  cache = null;
}

export async function listThemes(): Promise<ThemeCard[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.values;

  const rows = await db
    .select()
    .from(themes)
    .where(eq(themes.isActive, true))
    .orderBy(themes.sortOrder, themes.name);

  const values = rows.map(toCard);
  cache = { at: Date.now(), values };
  return values;
}

export async function getTheme(slug: string): Promise<ThemeCard | null> {
  const all = await listThemes();
  return all.find((t) => t.slug === slug) ?? null;
}

function toCard(row: Theme): ThemeCard {
  return {
    slug: row.slug,
    name: row.name,
    category: row.category,
    description: row.description,
    tokens: (row.tokens ?? {}) as Record<string, unknown>,
    isPremium: row.isPremium,
  };
}
