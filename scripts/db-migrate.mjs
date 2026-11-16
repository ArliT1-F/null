/**
 * Plain-JS migration runner for the runtime container.
 *
 * The application source is TypeScript and is not present in the standalone
 * production image, so migrations are applied by this script using only runtime
 * dependencies (pg + drizzle-orm), which the Dockerfile copies in explicitly.
 *
 * Usage:
 *   node scripts/db-migrate.mjs
 *   DATABASE_URL=… MIGRATIONS_DIR=./src/db/migrations node scripts/db-migrate.mjs
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is required");
  process.exit(1);
}

const migrationsFolder = process.env.MIGRATIONS_DIR ?? "./src/db/migrations";

const pool = new Pool({ connectionString: url, max: 1, application_name: "null-migrate" });

try {
  const started = Date.now();
  await migrate(drizzle(pool), { migrationsFolder });
  console.log(`[migrate] applied in ${Date.now() - started}ms`);
} catch (error) {
  console.error("[migrate] failed:", error?.message ?? error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
