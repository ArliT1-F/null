import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    globals: false,
    // The integration tests talk to a real PostgreSQL database. They are skipped
    // automatically when TEST_DATABASE_URL is absent, so `npm test` stays green
    // on a machine without one.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` is a Next.js build-time guard; under Vitest the modules it
      // guards are exactly what we are testing.
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
    },
  },
});
