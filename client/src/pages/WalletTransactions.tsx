import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, Loader2 } from "lucide-react";
import { trpc } from "../lib/trpc";

// 从交易备注中提取世界杯球队 code（小写），如 [ES] → 'es'
function extractWcTeamCode(note: string): string | null {
  const isWcRelated = note.includes('世界杯投注') || note.includes('订单作废-退回投注');
  if (!isWcRelated) return null;
  const codeMatch = note.match(/\[([A-Z]{2,10})\]/);
  if (codeMatch) return codeMatch[1].toLowerCase();
  const nameToCode: Record<string, string> = {
    '西班牙': 'es', '法国': 'fr', '英格兰': 'gb-eng', '巴西': 'br', '阿根廷': 'ar',
    '葡萄牙': 'pt', '德国': 'de', '荷兰': 'nl', '挪威': 'no', '比利时': 'be',
    '哥伦比亚': 'co', '摩洛哥': 'ma', '日本': 'jp', '美国': 'us', '瑞士': 'ch',
    '乌拉圭': 'uy', '墨西哥': 'mx', '厄瓜多尔': 'ec', '克罗地亚': 'hr', '土耳其': 'tr',
    '塞内加尔': 'sn', '瑞典': 'se', '奥地利': 'at', '苏格兰': 'gb-sct', '加拿大': 'ca',
    '科特迪瓦': 'ci', '巴拉圭': 'py', '捷克': 'cz', '埃及': 'eg', '波黑': 'ba',
    '韩国': 'kr', '阿尔及利亚': 'dz', '加纳': 'gh', '澳大利亚': 'au', '突尼斯': 'tn',
    '伊朗': 'ir', '刚果民主共和国': 'cd', '南非': 'za', '沙特阿拉伯': 'sa', '巴拿马': 'pa',
    '卡塔尔': 'qa', '佛得角': 'cv', '新西兰': 'nz', '伊拉克': 'iq', '乌兹别克斯坦': 'uz',
    '库拉索': 'cw', '约旦': 'jo', '海地': 'ht',
  };
  for (const [name, code] of Object.entries(nameToCode)) {
    if (note.includes(name)) return code;
  }
  return null;
}

export default function WalletTransactions() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const isYaban = params.get("from") === "yaban";
  const viewAsUserId = params.get("viewAs") ? parseInt(params.get("viewAs")!) : undefined;
  const backTo = isYaban ? "/yaban/wallet" : "/wallet";

  type FilterType = "all" | "recharge" | "withdraw" | "manual";
  const [activeType, setActiveType] = useState<FilterType>("all");

  // 统一走 afGetMyRechargeHistory（全局口径，不传 ledgerId）
  const historyQuery = trpc.ledger.afGetMyRechargeHistory.useQuery(
    { ...(viewAsUserId ? { viewAsUserId } : {}) },
    { staleTime: 30000 }
  );

  const formatDate = (dateStr: string | Date) => {
    const date = new Date(dateStr);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  };

  const bhTypeLabel: Record<string, string> = {
    consume: '消费', refund: '退款', reward: '奖励', withdraw: '提现',
    reward_clawback: '奖励回收',
  };

  const allItems: any[] = (historyQuery.data as any[]) || [];

  const filteredItems = allItems.filter((item: any) => {
    if (activeType === "all") return true;
    if (activeType === "recharge") return item.sourceType === 'recharge';
    if (activeType === "withdraw") return item.sourceType === 'balance_history' && item.type === 'withdraw';
    if (activeType === "manual") return item.sourceType === 'manual';
    return true;
  });

  const isLoading = historyQuery.isLoading;

  // ============ 牙伴蓝白主题 ============
  if (isYaban) {
    return (
      <div className="min-h-screen pb-20" style={{ background: '#F4F8FB' }}>
        <div className="sticky top-0 z-10" style={{ background: 'linear-gradient(135deg,#2196C8,#3BA9E0)' }}>
          <div className="flex items-center px-4 py-3">
            <button onClick={() => setLocation(backTo)} className="mr-3 flex items-center justify-center w-9 h-9 rounded-full" style={{ background: 'rgba(255,255,255,0.18)' }}>
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-lg font-semibold text-white">交易明细</h1>
          </div>
        </div>
        <div className="sticky top-[56px] z-10 bg-white shadow-sm">
          <div className="flex px-4">
            {(['all', 'recharge', 'withdraw', 'manual'] as FilterType[]).map(type => {
              const labels: Record<FilterType, string> = { all: '全部', recharge: '充值', withdraw: '提现', manual: '调账' };
              return (
                <button
                  key={type}
                  onClick={() => setActiveType(type)}
                  className="flex-1 py-3 text-center font-medium transition-colors text-sm"
                  style={activeType === type
                    ? { color: '#1E88D6', borderBottom: '2px solid #1E88D6' }
                    : { color: '#8AA0B2', borderBottom: '2px solid transparent' }
                  }
                >
                  {labels[type]}
                </button>
              );
            })}
          </div>
        </div>
        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-[#1E88D6]" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-20 text-gray-400">暂无交易记录</div>
          ) : (
            <div className="space-y-3">
              {filteredItems.map((item: any) => {
                const amt = parseFloat(String(item.amount));
                const isPositive = amt >= 0;
                const noteText = item.note || item.description || '';
                const wcCode = extractWcTeamCode(noteText);
                const isRecharge = item.sourceType === 'recharge';
                const isManual = item.sourceType === 'manual';
                const isBh = item.sourceType === 'balance_history';
                const label = isRecharge
                  ? '充值到账'
                  : isManual
                  ? '手动调账'
                  : isBh
                  ? (bhTypeLabel[item.type] || item.type || '流水')
                  : '系统结算';
                return (
                  <div key={item.id} className="rounded-2xl p-4 bg-white" style={{ boxShadow: '0 4px 16px rgba(33,150,200,0.1)' }}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center mr-2 flex-shrink-0" style={{ background: isPositive ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)' }}>
                          {wcCode ? (
                            <img src={`/flags/${wcCode}.png`} alt={wcCode} className="w-8 h-8 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          ) : (
                            isPositive ? <ArrowDownCircle className="w-5 h-5 text-green-500" /> : <ArrowUpCircle className="w-5 h-5 text-red-500" />
                          )}
                        </div>
                        <div>
                          {!wcCode && (
                            <div className="font-medium text-gray-800 text-sm">{label}</div>
                          )}
                          <div className="text-xs text-gray-400 mt-0.5">{formatDate(item.createdAt)} <span className="text-gray-300">UTC+8</span></div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-bold ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
                          {isPositive ? '+' : ''}{amt.toFixed(4)} USDT
                        </div>
                      </div>
                    </div>
                    {!wcCode && noteText && (
                      <div className="text-xs text-gray-500 mt-1 ml-10">{noteText}</div>
                    )}
                    {item.balanceAfter != null && (
                      <div className="text-xs mt-2 pt-2 border-t border-gray-100 flex justify-between items-center">
                        <span className="text-gray-400">余额</span>
                        <span className="text-gray-600 font-medium">{parseFloat(String(item.balanceAfter)).toFixed(2)} USDT</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============ 原黑金主题 ============
  return (
    <div className="min-h-screen pb-20" style={{ background: 'linear-gradient(160deg,#111111 0%,#1a1a1a 100%)' }}>
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 border-b border-[#2a2a2a]" style={{ background: '#111111' }}>
        <div style={{ height: '2px', background: 'linear-gradient(90deg,transparent,#CBA471,#e8c98a,#CBA471,transparent)' }} />
        <div className="flex items-center px-4 py-3">
          <button onClick={() => setLocation(backTo)} className="mr-3">
            <ArrowLeft className="w-6 h-6 text-[#CBA471]" />
          </button>
          <h1 className="text-lg font-semibold text-[#CBA471] tracking-widest">交易明细</h1>
        </div>
      </div>

      {/* 类型筛选 */}
      <div className="sticky top-[57px] z-10 border-b border-[#2a2a2a]" style={{ background: '#111111' }}>
        <div className="flex px-4">
          {(['all', 'recharge', 'withdraw', 'manual'] as FilterType[]).map(type => {
            const labels: Record<FilterType, string> = { all: '全部', recharge: '充值', withdraw: '提现', manual: '调账' };
            return (
              <button
                key={type}
                onClick={() => setActiveType(type)}
                className="flex-1 py-3 text-center font-medium transition-colors text-sm"
                style={activeType === type
                  ? { color: '#CBA471', borderBottom: '2px solid #CBA471' }
                  : { color: '#666', borderBottom: '2px solid transparent' }
                }
              >
                {labels[type]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 交易列表 */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#CBA471]" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-20 text-gray-500">暂无交易记录</div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item: any) => {
              const amt = parseFloat(String(item.amount));
              const isPositive = amt >= 0;
              const noteText = item.note || item.description || '';
              const wcCode = extractWcTeamCode(noteText);
              const isRecharge = item.sourceType === 'recharge';
              const isManual = item.sourceType === 'manual';
              const isBh = item.sourceType === 'balance_history';
              const label = isRecharge
                ? '充值到账'
                : isManual
                ? '手动调账'
                : isBh
                ? (bhTypeLabel[item.type] || item.type || '流水')
                : '系统结算';
              return (
                <div
                  key={item.id}
                  className="rounded-2xl p-4"
                  style={{ background: 'linear-gradient(135deg,#1e1e1e,#252525)', border: '1px solid #2a2a2a', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center mr-2 flex-shrink-0"
                        style={{ background: isPositive ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)' }}
                      >
                        {wcCode ? (
                          <img
                            src={`/flags/${wcCode}.png`}
                            alt={wcCode}
                            className="w-8 h-8 object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          isPositive
                            ? <ArrowDownCircle className="w-5 h-5 text-green-400" />
                            : <ArrowUpCircle className="w-5 h-5 text-red-400" />
                        )}
                      </div>
                      <div>
                        {!wcCode && (
                          <div className="font-medium text-white text-sm">{label}</div>
                        )}
                        <div className="text-xs text-gray-500 mt-0.5">{formatDate(item.createdAt)} <span className="text-gray-600">UTC+8</span></div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        {isPositive ? '+' : ''}{amt.toFixed(4)} USDT
                      </div>
                    </div>
                  </div>

                  {/* 非世界杯才显示备注文字 */}
                  {!wcCode && noteText && (
                    <div className="text-xs text-gray-500 mt-1 ml-10">{noteText}</div>
                  )}

                  {/* 余额快照 */}
                  {item.balanceAfter != null && (
                    <div className="text-xs mt-2 pt-2 border-t border-[#2a2a2a] flex justify-between items-center">
                      <span className="text-gray-600">余额</span>
                      <span className="text-gray-400 font-medium">{parseFloat(String(item.balanceAfter)).toFixed(2)} USDT</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
