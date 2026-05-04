import { getKlinesMeta } from "./server/db-crypto";

async function main() {
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  for (const sym of symbols) {
    const meta = await getKlinesMeta(sym);
    console.log(`${sym}: latest=${meta.latestDate}, oldest=${meta.oldestDate}, total=${meta.total}`);
  }
  process.exit(0);
}
main().catch(console.error);
