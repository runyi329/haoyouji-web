import { defineConfig } from 'vitest/config';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../../..');
export default defineConfig({
  root,
  resolve: { alias: { '@shared': path.resolve(root, 'shared') } },
  test: { environment: 'node', include: ['client/src/lib/ledger-stock-calendar.test.ts'] },
});
