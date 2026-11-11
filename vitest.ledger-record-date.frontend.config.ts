import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client/src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    environment: "node",
    include: ["client/src/lib/ledgerRecordDate.frontend.test.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
