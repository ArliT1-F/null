/**
 * null — database schema (Drizzle ORM / PostgreSQL).
 *
 * Modular monolith: one database, one schema, clear module ownership.
 * Core business data is structured and constrained. JSONB is reserved for
 * genuinely flexible per-profile presentation configuration (see
 * docs/DATABASE.md).
 */

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum("user_role", ["USER", "ADMIN"]);
export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "SUSPENDED", "DELETED"]);
export const authProviderEnum = pgEnum("auth_provider", ["CREDENTIALS", "GITHUB", "GOOGLE", "DISCORD"]);
export const authTokenPurposeEnum = pgEnum("auth_token_purpose", [
  "EMAIL_VERIFICATION",
  "PASSWORD_RESET",
  "EMAIL_CHANGE",
]);
export const profileVisibilityEnum = pgEnum("profile_visibility", ["PUBLIC", "UNLISTED", "PRIVATE"]);
export const mediaKindEnum = pgEnum("media_kind", ["AVATAR", "BACKGROUND", "GALLERY", "AUDIO", "DOCUMENT"]);
export const reportStatusEnum = pgEnum("report_status", ["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"]);

export const LINK_ICONS = [
  "LINK",
  "GLOBE",
  "GITHUB",
  "X",
  "INSTAGRAM",
  "YOUTUBE",
  "TWITCH",
  "DISCORD",
  "SPOTIFY",
  "STEAM",
  "LINKEDIN",
  "TIKTOK",
  "MAIL",
  "MUSIC",
  "CODE",
  "GAME",
  "SHOP",
  "HEART",
] as const;
export type LinkIcon = (typeof LINK_ICONS)[number];

// ---------------------------------------------------------------------------
// Accounts & authentication
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: id(),
    /** Stored lower-cased; uniqueness is enforced case-insensitively. */
    email: text("email").notNull().unique(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash"),
    role: userRoleEnum("role").notNull().default("USER"),
    status: userStatusEnum("status").notNull().default("ACTIVE"),

    /** Canonical (lower-cased) username. The display casing lives in usernameDisplay. */
    username: varchar("username", { length: 30 }).notNull().unique(),
    usernameDisplay: varchar("username_display", { length: 30 }).notNull(),
    usernameChangedAt: timestamp("username_changed_at", { withTimezone: true }),

    displayName: varchar("display_name", { length: 60 }),
    bio: varchar("bio", { length: 600 }),
    avatarUrl: text("avatar_url"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("users_status_idx").on(t.status), index("users_created_at_idx").on(t.createdAt)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: authProviderEnum("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    /** AES-256-GCM ciphertext — see src/lib/crypto.ts. */
    accessTokenEnc: text("access_token_enc"),
    refreshTokenEnc: text("refresh_token_enc"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scope: text("scope"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("accounts_provider_account_uq").on(t.provider, t.providerAccountId),
    uniqueIndex("accounts_user_provider_uq").on(t.userId, t.provider),
    index("accounts_user_idx").on(t.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    /** SHA-256 of the opaque cookie token; the raw token never touches the DB. */
    tokenHash: text("token_hash").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: varchar("user_agent", { length: 400 }),
    ipHash: text("ip_hash"),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: authTokenPurposeEnum("purpose").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("auth_tokens_user_purpose_idx").on(t.userId, t.purpose),
    index("auth_tokens_expires_idx").on(t.expiresAt),
  ],
);

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export const profiles = pgTable(
  "profiles",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Working (draft) presentation state: ProfileConfig. */
    draftConfig: jsonb("draft_config").notNull().default({}),
    draftUpdatedAt: timestamp("draft_updated_at", { withTimezone: true }).notNull().defaultNow(),
    themeSlug: varchar("theme_slug", { length: 40 }).notNull().default("aurora"),

    headline: varchar("headline", { length: 120 }),
    location: varchar("location", { length: 120 }),
    statusText: varchar("status_text", { length: 120 }),

    visibility: profileVisibilityEnum("visibility").notNull().default("PUBLIC"),

    /** Immutable snapshot currently served at /username. */
    publishedSnapshot: jsonb("published_snapshot"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** Monotonic counter bumped on publish; drives cache invalidation. */
    revision: integer("revision").notNull().default(0),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("profiles_published_idx").on(t.publishedAt),
    index("profiles_visibility_idx").on(t.visibility),
  ],
);

export const profileVersions = pgTable(
  "profile_versions",
  {
    id: id(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("profile_versions_profile_version_uq").on(t.profileId, t.version),
    index("profile_versions_created_idx").on(t.profileId, t.createdAt),
  ],
);

export const profileLinks = pgTable(
  "profile_links",
  {
    id: id(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 80 }).notNull(),
    url: varchar("url", { length: 2048 }).notNull(),
    icon: varchar("icon", { length: 20 }).notNull().default("LINK"),
    position: integer("position").notNull().default(0),
    visible: boolean("visible").notNull().default(true),
    highlight: boolean("highlight").notNull().default(false),
    clicks: integer("clicks").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("profile_links_profile_position_idx").on(t.profileId, t.position)],
);

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export type MediaVariant = {
  key: string;
  width: number;
  height: number;
  format: string;
};

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: mediaKindEnum("kind").notNull(),
    /** Provider-relative key, e.g. "avatars/<userId>/<assetId>.webp". */
    storageKey: text("storage_key").notNull(),
    provider: varchar("provider", { length: 20 }).notNull().default("local"),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    variants: jsonb("variants").notNull().default(sql`'[]'::jsonb`).$type<MediaVariant[]>(),
    checksum: varchar("checksum", { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [index("media_assets_user_kind_idx").on(t.userId, t.kind), index("media_assets_created_idx").on(t.createdAt)],
);

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

export const themes = pgTable(
  "themes",
  {
    id: id(),
    slug: varchar("slug", { length: 40 }).notNull().unique(),
    name: varchar("name", { length: 60 }).notNull(),
    category: varchar("category", { length: 40 }).notNull(),
    description: varchar("description", { length: 300 }).notNull(),
    isPremium: boolean("is_premium").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Partial ThemeTokens that seed a new profile. */
    tokens: jsonb("tokens").notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("themes_active_sort_idx").on(t.isActive, t.sortOrder)],
);

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 80 }).notNull(),
    targetType: varchar("target_type", { length: 40 }),
    targetId: text("target_id"),
    metadata: jsonb("metadata").notNull().default({}),
    ipHash: text("ip_hash"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_actor_created_idx").on(t.actorId, t.createdAt), index("audit_logs_action_created_idx").on(t.action, t.createdAt)],
);

export const reports = pgTable(
  "reports",
  {
    id: id(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    reporterId: text("reporter_id").references(() => users.id, { onDelete: "set null" }),
    reason: varchar("reason", { length: 120 }).notNull(),
    details: varchar("details", { length: 2000 }),
    status: reportStatusEnum("status").notNull().default("OPEN"),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("reports_status_created_idx").on(t.status, t.createdAt), index("reports_profile_idx").on(t.profileId)],
);

// ---------------------------------------------------------------------------
// Relations (for typed joins)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  media: many(mediaAssets),
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
}));

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  user: one(users, { fields: [profiles.userId], references: [users.id] }),
  links: many(profileLinks),
  versions: many(profileVersions),
}));

export const profileLinksRelations = relations(profileLinks, ({ one }) => ({
  profile: one(profiles, { fields: [profileLinks.profileId], references: [profiles.id] }),
}));

export const profileVersionsRelations = relations(profileVersions, ({ one }) => ({
  profile: one(profiles, { fields: [profileVersions.profileId], references: [profiles.id] }),
}));

export const mediaAssetsRelations = relations(mediaAssets, ({ one }) => ({
  user: one(users, { fields: [mediaAssets.userId], references: [users.id] }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type ProfileLink = typeof profileLinks.$inferSelect;
export type NewProfileLink = typeof profileLinks.$inferInsert;
export type ProfileVersion = typeof profileVersions.$inferSelect;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type Theme = typeof themes.$inferSelect;
export type Session = typeof sessions.$inferSelect;
