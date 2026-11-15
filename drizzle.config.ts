import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://vessel:vessel@localhost:5432/vessel",
  },
  strict: true,
  verbose: true,
});
