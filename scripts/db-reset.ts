/**
 * Drops and recreates the public schema, then re-applies migrations.
 *
 * Refuses to run in production or against a database whose name does not end in
 * `_dev` or `_test`, because this destroys all data.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("db:reset refuses to run with NODE_ENV=production");
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const database = new URL(url).pathname.replace(/^\//, "");
  const allowlist = /(^|[_-])(dev|test|local)$/;
  if (!allowlist.test(database)) {
    throw new Error(
      `Refusing to reset database "${database}". Name it *_dev, *_test or *_local, or run the SQL manually.`,
    );
  }

  const pool = new Pool({ connectionString: url, max: 1 });

  try {
    const db = drizzle(pool);
    console.log(`[reset] dropping schema in ${database}`);
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`create schema public`);
    await migrate(db, { migrationsFolder: "./src/db/migrations" });
    console.log("[reset] database rebuilt");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[reset] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
