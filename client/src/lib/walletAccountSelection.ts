export type WalletAccountTab = 'CRYPTO' | 'CNY';

type WalletFlowTimestamp = {
  createdAt?: unknown;
  created_at?: unknown;
};

const newestTimestamp = (flows: WalletFlowTimestamp[]): number => flows.reduce((latest, flow) => {
  const rawTimestamp = flow?.createdAt ?? flow?.created_at;
  const timestamp = rawTimestamp ? new Date(String(rawTimestamp)).getTime() : Number.NaN;
  return Number.isFinite(timestamp) && timestamp > latest ? timestamp : latest;
}, Number.NEGATIVE_INFINITY);

/**
 * 进入钱包时，以数字币与人民币两类流水中最新的一笔决定默认账户。
 * 两类均无流水或时间完全一致时保留数字币，确保与历史默认行为一致。
 */
export function selectWalletAccountByLatestFlow(
  digitalFlows: WalletFlowTimestamp[],
  cnyFlows: WalletFlowTimestamp[],
): WalletAccountTab {
  return newestTimestamp(cnyFlows) > newestTimestamp(digitalFlows) ? 'CNY' : 'CRYPTO';
}
