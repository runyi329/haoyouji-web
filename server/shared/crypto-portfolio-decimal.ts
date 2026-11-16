/**
 * Only the new crypto natural-day engine uses exact decimal arithmetic.
 * Values originate as JSON/MySQL decimals; preserve their decimal text through
 * sums, differences, fee allocation and FX. Convert to Number only at the
 * existing snapshot API boundary. No money/quantity is rounded to cents here.
 */
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TEN = BigInt(10);
function powerOfTen(scale: number): bigint {
  let result = ONE;
  for (let i = 0; i < scale; i++) result *= TEN;
  return result;
}
function gcd(a: bigint, b: bigint): bigint {
  a = a < ZERO ? -a : a;
  b = b < ZERO ? -b : b;
  while (b !== ZERO) { const next = a % b; a = b; b = next; }
  return a || ONE;
}
export class CryptoPortfolioDecimal {
  private readonly numerator: bigint;
  private readonly denominator: bigint;
  constructor(value: number | string | CryptoPortfolioDecimal, denominator?: bigint) {
    if (value instanceof CryptoPortfolioDecimal) {
      this.numerator = value.numerator; this.denominator = value.denominator; return;
    }
    let n: bigint, d: bigint;
    if (denominator !== undefined) { n = BigInt(String(value)); d = denominator; }
    else {
      if (!Number.isFinite(Number(value))) throw new Error('invalid_crypto_decimal');
      const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(value));
      if (!match) throw new Error('invalid_crypto_decimal');
      const fraction = match[3] ?? '', scale = fraction.length - Number(match[4] ?? 0);
      n = BigInt(match[2] + fraction) * (match[1] === '-' ? -ONE : ONE);
      d = scale > 0 ? powerOfTen(scale) : ONE;
      if (scale < 0) n *= powerOfTen(-scale);
    }
    if (d === ZERO) throw new Error('invalid_crypto_decimal_divisor');
    if (d < ZERO) { n = -n; d = -d; }
    const factor = gcd(n, d);
    this.numerator = n / factor; this.denominator = d / factor;
  }
  private static fraction(n: bigint, d: bigint): CryptoPortfolioDecimal {
    return new CryptoPortfolioDecimal(String(n), d);
  }
  plus(value: number | CryptoPortfolioDecimal): CryptoPortfolioDecimal {
    const v = new CryptoPortfolioDecimal(value);
    return CryptoPortfolioDecimal.fraction(this.numerator * v.denominator + v.numerator * this.denominator, this.denominator * v.denominator);
  }
  minus(value: number | CryptoPortfolioDecimal): CryptoPortfolioDecimal {
    const v = new CryptoPortfolioDecimal(value);
    return CryptoPortfolioDecimal.fraction(this.numerator * v.denominator - v.numerator * this.denominator, this.denominator * v.denominator);
  }
  times(value: number | CryptoPortfolioDecimal): CryptoPortfolioDecimal {
    const v = new CryptoPortfolioDecimal(value);
    return CryptoPortfolioDecimal.fraction(this.numerator * v.numerator, this.denominator * v.denominator);
  }
  dividedBy(value: number | CryptoPortfolioDecimal): CryptoPortfolioDecimal {
    const v = new CryptoPortfolioDecimal(value);
    return CryptoPortfolioDecimal.fraction(this.numerator * v.denominator, this.denominator * v.numerator);
  }
  toNumber(): number {
    if (this.numerator === ZERO) return 0;
    const negative = this.numerator < ZERO;
    const n = negative ? -this.numerator : this.numerator;
    const integer = n / this.denominator;
    let remainder = n % this.denominator;
    let decimal = '';
    // Preserve 20 significant digits, including leading zeros for tiny values,
    // so the sole Number conversion is rounded by JS, not by an intermediate
    // division of two individually rounded large integers.
    const integerText = String(integer);
    let significant = integer === ZERO ? 0 : integerText.length;
    for (let i = 0; remainder !== ZERO && significant < 20 && i < 400; i++) {
      remainder *= TEN;
      const digit = remainder / this.denominator;
      remainder %= this.denominator;
      decimal += String(digit);
      if (significant > 0 || digit !== ZERO) significant++;
    }
    return Number(`${negative ? '-' : ''}${integerText}${decimal ? `.${decimal}` : ''}`);
  }
}
export const cryptoDecimal = (value: number | string | CryptoPortfolioDecimal = 0) => new CryptoPortfolioDecimal(value);
