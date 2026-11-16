export const TAG_MARGIN_STOCK_FEE_RATE = 0.001;

/** Exact decimal representation of a finite number, including scientific notation. */
function decimal(value: number): { coefficient: bigint; exponent: number } {
  const [mantissa, power = '0'] = String(value).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  return { coefficient: BigInt(whole + fraction), exponent: Number(power) - fraction.length };
}

function tenTo(exponent: number): bigint {
  let result = BigInt(1);
  for (let i = 0; i < exponent; i++) result *= BigInt(10);
  return result;
}
const decimalNumber = (coefficient: bigint, exponent: number): number => Number(`${coefficient}e${exponent}`);

/** price * this sale's quantity * 1‰, rounded half-up to RMB cents. */
function feeCents(price: number, quantity: number): bigint {
  const value = decimal(price);
  const coefficient = value.coefficient * BigInt(quantity);
  const exponent = value.exponent - 1; // 1‰ in yuan, then * 100 to cents.
  if (exponent >= 0) return coefficient * tenTo(exponent);
  const divisor = tenTo(-exponent);
  return (coefficient + divisor / BigInt(2)) / divisor;
}

/**
 * Missing feeRate is legacy gross cash, never retroactively charged.
 * A present feeRate opts into both 1‰ fees; an omitted purchase price uses sale price.
 * Old gross retains JS price * quantity precision; new charges use decimal prices.
 * Only fees are rounded to cents, never the original price or share count.
 */
export function getTagMarginStockSaleAmounts(
  sale: { quantity: number; price: number; feeRate?: number },
  purchasePrice?: number,
): { valid: boolean; grossValue: number; buyFee: number; sellFee: number; totalFee: number; netValue: number } {
  const invalid = () => ({ valid: false, grossValue: 0, buyFee: 0, sellFee: 0, totalFee: 0, netValue: 0 });
  if (!sale || typeof sale !== 'object' || Array.isArray(sale)
    || !Number.isSafeInteger(sale.quantity) || sale.quantity <= 0
    || typeof sale.price !== 'number' || !Number.isFinite(sale.price) || sale.price <= 0) return invalid();
  let grossValue = sale.price * sale.quantity;
  if (!Number.isFinite(grossValue)) return invalid();
  if (!Object.prototype.hasOwnProperty.call(sale, 'feeRate')) {
    return { valid: true, grossValue, buyFee: 0, sellFee: 0, totalFee: 0, netValue: grossValue };
  }
  if (sale.feeRate !== TAG_MARGIN_STOCK_FEE_RATE || (purchasePrice !== undefined
    && (typeof purchasePrice !== 'number' || !Number.isFinite(purchasePrice) || purchasePrice <= 0))) return invalid();
  const buyCents = feeCents(purchasePrice ?? sale.price, sale.quantity);
  const sellCents = feeCents(sale.price, sale.quantity);
  const totalCents = buyCents + sellCents;
  const buyFee = decimalNumber(buyCents, -2);
  const sellFee = decimalNumber(sellCents, -2);
  const totalFee = decimalNumber(totalCents, -2);
  const gross = decimal(sale.price);
  gross.coefficient *= BigInt(sale.quantity);
  grossValue = decimalNumber(gross.coefficient, gross.exponent);
  const exponent = Math.min(gross.exponent, -2);
  const netValue = decimalNumber(gross.coefficient * tenTo(gross.exponent - exponent)
    - totalCents * tenTo(-2 - exponent), exponent);
  if (![grossValue, buyFee, sellFee, totalFee, netValue].every(Number.isFinite)) return invalid();
  return { valid: true, grossValue, buyFee, sellFee, totalFee, netValue };
}
