import { defineConfig } from "vitest/config";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
export default defineConfig({
  root,
  resolve: { alias: {
    "@": path.resolve(root, "client/src"),
    "@shared": path.resolve(root, "shared"),
    "@assets": path.resolve(root, "attached_assets"),
  } },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["client/src/components/StockMiniCandlestick.test.ts", "client/src/components/StockChipDistribution.test.ts", "client/src/components/StockConsecutiveDaySquares.test.ts", "client/src/components/ChipCostModelExplanation.test.ts", "client/src/pages/StockMAMonitor.frontend.test.ts"],
  },
});
