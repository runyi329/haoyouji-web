import { getAllChangePcts } from './server/db-crypto';
import { getCryptoKlines } from './server/db-crypto';

async function main() {
  console.log('\n===== 核查：每年「累计涨幅 - 累计跌幅」vs「年头到年底实际涨幅」=====\n');
  
  for (const symbol of ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']) {
    console.log(`--- ${symbol} ---`);
    
    const allData = await getAllChangePcts(symbol);
    
    // 按年分组
    const yearMap: Record<string, { pcts: number[]; firstClose?: number; lastClose?: number }> = {};
    for (const item of allData) {
      if (item.changePct == null) continue;
      const year = item.date.slice(0, 4);
      if (!yearMap[year]) yearMap[year] = { pcts: [] };
      yearMap[year].pcts.push(item.changePct);
    }
    
    // 获取每年首末收盘价（通过klines接口）
    // 用全量数据中的日期推算
    const allKlines = await getCryptoKlines(symbol, 1, 99999);
    const klinesMap: Record<string, number> = {};
    for (const k of allKlines.rows) {
      klinesMap[k.date] = k.close;
    }
    
    // 按年找首末收盘价
    const yearDates: Record<string, { first: string; last: string }> = {};
    for (const item of allData) {
      const year = item.date.slice(0, 4);
      if (!yearDates[year]) yearDates[year] = { first: item.date, last: item.date };
      if (item.date < yearDates[year].first) yearDates[year].first = item.date;
      if (item.date > yearDates[year].last) yearDates[year].last = item.date;
    }
    
    const years = Object.keys(yearMap).sort((a, b) => b.localeCompare(a)).slice(0, 6);
    
    for (const yr of years) {
      const pcts = yearMap[yr].pcts;
      const totalUp = pcts.filter(p => p > 0).reduce((s, p) => s + p, 0);
      const totalDown = pcts.filter(p => p < 0).reduce((s, p) => s + Math.abs(p), 0);
      const net = totalUp - totalDown;
      
      const firstDate = yearDates[yr]?.first;
      const lastDate = yearDates[yr]?.last;
      const firstClose = klinesMap[firstDate];
      const lastClose = klinesMap[lastDate];
      
      let actual: number | null = null;
      if (firstClose && lastClose) {
        actual = ((lastClose - firstClose) / firstClose) * 100;
      }
      
      const diff = actual != null ? Math.abs(net - actual) : null;
      
      console.log(`  ${yr}年 (${firstDate}~${lastDate}, ${pcts.length}天):`);
      console.log(`    涨幅累加: +${totalUp.toFixed(2)}%  跌幅累加: -${totalDown.toFixed(2)}%  净值(涨-跌): ${net.toFixed(2)}%`);
      if (actual != null) {
        console.log(`    实际年涨幅(首末收盘价): ${actual.toFixed(2)}%`);
        console.log(`    差值: ${diff!.toFixed(2)}% ${diff! > 5 ? '⚠️ 差异较大（复利效应导致）' : '✅ 基本一致'}`);
      }
    }
    console.log();
  }
}

main().catch(console.error);
