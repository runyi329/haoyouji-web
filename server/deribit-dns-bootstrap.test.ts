import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createDeribitDnsBootstrap } from '../scripts/create-deribit-dns-bootstrap.mjs';

// Offline dependency injection only. No DNS/API request, filesystem write, or app startup.
describe('部署动态Deribit连接引导，不是价格缓存', () => {
  it('动态解析地址先TLS验证，再保存固定官方主机和时间，不保存行情/凭据', async () => {
    const resolve4 = vi.fn(async () => ['104.18.5.240', '104.18.4.240']);
    const verify = vi.fn(async () => undefined);
    const seed = await createDeribitDnsBootstrap({ resolve4, verify, now: () => 1795317933142 });
    expect(resolve4).toHaveBeenCalledTimes(1);
    expect(verify.mock.calls.map(call => call[0])).toEqual(['104.18.5.240', '104.18.4.240']);
    expect(seed).toEqual({ hostname: 'www.deribit.com', addresses: ['104.18.5.240', '104.18.4.240'], resolvedAt: 1795317933142, kind: 'deployment_dns_tls_validated' });
    expect(Object.keys(seed).sort()).toEqual(['addresses','hostname','kind','resolvedAt']);
  });
  it('地址验证失败不保存，尝试下一动态地址；地址去重且最多存两个', async () => {
    const verify = vi.fn(async (ip: string) => { if(ip === '8.8.8.8') throw new Error('invalid certificate'); });
    const seed = await createDeribitDnsBootstrap({ resolve4: async () => ['8.8.8.8', '8.8.8.8', '104.18.5.240', '104.18.4.240', '1.1.1.1'], verify });
    expect(seed.addresses).toEqual(['104.18.5.240', '104.18.4.240']);
    expect(verify).toHaveBeenCalledTimes(3);
  });
  it.each(['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.0.1','100.64.0.1','192.0.2.1','198.51.100.1','203.0.113.1','224.0.0.1','::1','invalid'])('非法/私网地址 %s 不发送连接验证', async ip => {
    const verify = vi.fn(async () => undefined);
    await expect(createDeribitDnsBootstrap({ resolve4: async () => [ip], verify })).rejects.toThrow('No official TLS-validated');
    expect(verify).not.toHaveBeenCalled();
  });
  it('全部地址TLS失败不会生成看似可用的种子', async () => {
    await expect(createDeribitDnsBootstrap({ resolve4: async () => ['104.18.4.240'], verify: async () => { throw new Error('certificate error'); } })).rejects.toThrow('No official TLS-validated');
  });
  it('拒绝非数组DNS回包', async () => {
    await expect(createDeribitDnsBootstrap({ resolve4: async () => '104.18.4.240' })).rejects.toThrow('DNS address list invalid');
  });
  it('生产生成器固定公开GET、SNI/证书校验和现有部署产物路径，不提交IP到源码', () => {
    const code = readFileSync(new URL('../scripts/create-deribit-dns-bootstrap.mjs', import.meta.url),'utf8');
    expect(code).toContain("const HOST = 'www.deribit.com'");
    expect(code).toContain("path:'/api/v2/public/get_time',method:'GET'");
    expect(code).toContain('servername:HOST,family:4,rejectUnauthorized:true');
    expect(code).not.toContain('104.18.');
    expect(code).not.toContain('/private/');
    expect(code).not.toContain('Authorization');
    expect(code).not.toContain('process.env');
    const workflow=readFileSync(new URL('../.github/workflows/deploy.yml',import.meta.url),'utf8');
    expect(workflow).toContain('node scripts/create-deribit-dns-bootstrap.mjs dist/deribit-dns-bootstrap.json');
  });
});
