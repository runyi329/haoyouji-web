type WalletAssetInput = { coin: string; qty: string; source?: string; note?: string };
type WalletBalance = { assetCode: string; availableBalance: unknown };
const SCALE = BigInt('1000000000000000000');

/** 只读额度计算；字符串定点运算避免18位小数在“全部”时向上舍入。 */
function decimalUnits(value: unknown): bigint | null {
  const raw = String(value ?? '').trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(raw);
  if (!match) return null;
  const exponent = Number(match[4] ?? 0);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 36) return null;
  const digits = match[2] + (match[3] ?? '');
  const point = match[2].length + exponent;
  const whole = point <= 0 ? '0' : digits.slice(0, point).padEnd(point, '0');
  const fraction = point < 0 ? '0'.repeat(-point) + digits : digits.slice(point);
  // SQL账户最多18位小数。不可表示的尾数不向上舍入扩大可用额度。
  const scaled = BigInt(whole) * SCALE + BigInt(fraction.slice(0, 18).padEnd(18, '0'));
  return match[1] === '-' ? -scaled : scaled;
}

function quantityText(units: bigint): string {
  const whole = units / SCALE;
  const fraction = String(units % SCALE).padStart(18, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/** confirmedAssets必须来自已成功读取的同用户、同订单、同段真实冻结台账，绝不传输入草稿。 */
export function getWalletCollateralMaximum(
  availableBalance: unknown,
  assetCode: string,
  confirmedAssets: readonly { coin: string; qty: string }[] = [],
): string | null {
  let units = decimalUnits(availableBalance);
  if (units === null) return null;
  const code = assetCode.trim().toUpperCase();
  for (const asset of confirmedAssets) {
    if (asset.coin.trim().toUpperCase() !== code) continue;
    const frozen = decimalUnits(asset.qty);
    if (frozen === null || frozen < BigInt(0)) return null;
    units += frozen;
  }
  return quantityText(units > BigInt(0) ? units : BigInt(0));
}

/** 提交前提示错误；后台仍必须在事务内以真实余额校验，前端不代替资金安全守卫。 */
export function getWalletCollateralDraftError(
  assets: readonly WalletAssetInput[],
  balances: readonly WalletBalance[],
  confirmedAssets: readonly { coin: string; qty: string }[],
  ready: boolean,
): string | null {
  const walletAssets = assets.filter((asset) => asset.source === 'wallet' || String(asset.note ?? '').startsWith('钱包担保冻结'));
  if (!walletAssets.length) return null;
  if (!ready) return '钱包可用余额或当前冻结尚未确认，请更新后再保存钱包担保';
  const seen = new Set<string>();
  for (const asset of walletAssets) {
    const code = String(asset.coin ?? '').trim().toUpperCase();
    const qty = String(asset.qty ?? '').trim();
    if (!code || seen.has(code)) return '钱包担保币种无效或重复，请重新选择';
    seen.add(code);
    if (!/^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(qty)) return `${code} 担保数量格式无效，最多支持18位小数`;
    const desired = decimalUnits(qty);
    if (desired === null || desired <= BigInt(0)) return `${code} 钱包担保数量必须大于 0`;
    const balance = balances.find((row) => String(row.assetCode).trim().toUpperCase() === code);
    const maximum = balance ? getWalletCollateralMaximum(balance.availableBalance, code, confirmedAssets) : null;
    if (maximum === null) return `${code} 钱包额度尚未确认，请更新后再保存`;
    const maximumUnits = decimalUnits(maximum);
    if (maximumUnits === null || desired > maximumUnits) return `${code} 担保数量超过可用额度，最多 ${maximum} ${code}`;
  }
  return null;
}
