import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * One connection pool per process. Next.js dev mode re-evaluates modules on
 * hot reload, so the pool is cached on globalThis.
 *
 * Pool size is deliberately small: the self-hosted production target is a
 * low-RAM desktop and PostgreSQL's own default max_connections is modest.
 */
const globalForDb = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: env.isProduction ? 10 : 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: "vessel-web",
  });

if (!globalForDb.pool) {
  globalForDb.pool = pool;
  pool.on("error", (err) => {
    console.error("[db] idle client error", err.message);
  });
}

export const db = drizzle(pool, { schema });
export type Database = typeof db;
export { schema };
