import { describe, it, expect } from 'vitest';

describe('Alipay SDK Configuration', () => {
  it('should have ALIPAY_APP_ID environment variable', () => {
    expect(process.env.ALIPAY_APP_ID).toBeDefined();
    expect(process.env.ALIPAY_APP_ID).toBe('2021006136636386');
  });

  it('should have ALIPAY_APP_PRIVATE_KEY environment variable', () => {
    expect(process.env.ALIPAY_APP_PRIVATE_KEY).toBeDefined();
    expect(process.env.ALIPAY_APP_PRIVATE_KEY!.length).toBeGreaterThan(100);
  });

  it('should have ALIPAY_PUBLIC_KEY environment variable', () => {
    expect(process.env.ALIPAY_PUBLIC_KEY).toBeDefined();
    expect(process.env.ALIPAY_PUBLIC_KEY!.length).toBeGreaterThan(100);
  });

  it('should create AlipaySdk instance without error', async () => {
    const { getAlipaySdk } = await import('./alipay');
    expect(() => getAlipaySdk()).not.toThrow();
  });

  it('should generate WAP pay URL for a test order', async () => {
    const { createWapPayUrl } = await import('./alipay');
    const url = createWapPayUrl({
      orderId: 'TEST_ORDER_001',
      subject: '测试商品',
      totalAmount: 0.01,
      returnUrl: 'https://example.com/payment/result',
      notifyUrl: 'https://example.com/api/alipay/notify',
    });
    expect(typeof url).toBe('string');
    expect(url).toContain('alipay');
    expect(url.length).toBeGreaterThan(100);
  });
});
