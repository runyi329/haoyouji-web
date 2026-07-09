// 读取price-cache.json，模拟getLatestPrice的KRW换算逻辑
import { readFileSync } from 'fs';

const cache = JSON.parse(readFileSync('./price-cache.json', 'utf-8'));
console.log('缓存中SKHYNIX原始数据:', JSON.stringify(cache['SKHYNIX']));

const KRW_COINS = new Set(['SKHYNIX']);
const entry = cache['SKHYNIX'];
if (entry) {
  let price = entry.price;
  if (KRW_COINS.has('SKHYNIX') && price > 10000) {
    price = parseFloat((price / 1400).toFixed(4));
    console.log('KRW换算后价格:', price, 'U');
  } else {
    console.log('直接返回价格:', price);
  }
} else {
  console.log('缓存中没有SKHYNIX数据！');
}
