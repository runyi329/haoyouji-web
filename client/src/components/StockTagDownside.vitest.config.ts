import { defineConfig } from 'vitest/config';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../../..');
export default defineConfig({
  root,
  resolve: { alias: { '@': path.resolve(root, 'client/src'), '@shared': path.resolve(root, 'shared') } },
  test: { environment: 'node', include: ['client/src/components/StockTagBuyEditDialog.test.ts', 'client/src/components/StockTagDownsideRulePanel.test.ts', 'client/src/components/StockTagCountedSummary.test.ts'] },
});
