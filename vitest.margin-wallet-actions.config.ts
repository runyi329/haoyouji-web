import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client/src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["client/src/components/Ledger37MarginWalletActions.test.tsx"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
