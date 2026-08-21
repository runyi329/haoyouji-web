/**
 * AfOptionSellSettings.tsx
 * 52号账本"卖期权设置"管理页面（纯手动模式）
 * 管理员操作：
 *   1. 创建期权（币种 → 到期日 → 行权价 → Call/Put → 月化收益率）
 *   2. 将已创建的期权绑定到买入价格档位
 *   3. 绑定后，前端下单页面对应价格旁显示"锁定收益"标签
 */
import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Plus, Trash2, ToggleLeft, ToggleRight, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";

// ETH 行权价档位（50一档，1300~2200）
const STRIKE_PRICES = Array.from({ length: 19 }, (_, i) => 1300 + i * 50);

// 买入价格档位（与 CryptoPrediction.tsx 中 BUY_PRICE_OPTIONS.ETH 一致）
const BUY_PRICES = [2200, 2150, 2100, 2050, 2000, 1950, 1900, 1850, 1800, 1750, 1700, 1650, 1600, 1550, 1500, 1450, 1400, 1350, 1300];

// 生成标准期权名称：ETH-20260926-1500-P
function makeInstrumentName(coin: string, dateStr: string, strike: number, type: string): string {
  const d = dateStr.replace(/-/g, '');
  const suffix = type === 'PUT' ? 'P' : 'C';
  return `${coin}-${d}-${strike}-${suffix}`;
}

// 将 YYYY-MM-DD 转为中文显示
function formatDateCN(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}年${parseInt(m)}月${parseInt(d)}日`;
}

// 将 expiryLabel（如 28AUG26）转为 YYYY-MM-DD
function expiryLabelToDate(label: string): string {
  const months: Record<string, string> = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
  };
  const match = label.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (!match) return label;
  const [, day, mon, yr] = match;
  const monthNum = months[mon];
  if (!monthNum) return label;
  return `20${yr}-${monthNum}-${day.padStart(2, '0')}`;
}

// 将 YYYY-MM-DD 转为标签
function dateToExpiryLabel(dateStr: string): string {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(d)}${months[parseInt(m) - 1]}${y.slice(2)}`;
}

export default function AfOptionSellSettings() {
  const [, params] = useRoute("/ledger/:id/option-sell-settings");
  const [, setLocation] = useLocation();
  const ledgerId = Number(params?.id || 52);

  // 已保存的配置
  const configQuery = trpc.ledger.afGetOptionSellConfig.useQuery({ ledgerId });
  // 迁移接口
  const migrateMutation = trpc.ledger.afMigrateOptionSellConfig.useMutation({
    onSuccess: (data) => { toast.success(`初始化完成: ${data.results.join(', ')}`); },
    onError: (e) => toast.error(e.message),
  });
  // 保存配置（用于创建和更新绑定）
  const saveMutation = trpc.ledger.afSaveOptionSellConfig.useMutation({
    onSuccess: () => { toast.success('已保存'); void configQuery.refetch(); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  // 删除配置
  const deleteMutation = trpc.ledger.afDeleteOptionSellConfig.useMutation({
    onSuccess: () => { toast.success('已删除'); void configQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // 新建表单状态
  const [formCoin] = useState('ETH');
  const [formDate, setFormDate] = useState('');
  const [formStrike, setFormStrike] = useState('');
  const [formType, setFormType] = useState<'PUT' | 'CALL'>('PUT');
  const [formYield, setFormYield] = useState('');

  // 绑定操作状态
  const [bindingOptionId, setBindingOptionId] = useState<number | null>(null);

  const resetForm = () => {
    setFormDate('');
    setFormStrike('');
    setFormType('PUT');
    setFormYield('');
  };

  // 预览期权名称
  const previewName = formDate && formStrike
    ? makeInstrumentName(formCoin, formDate, Number(formStrike), formType)
    : '';

  // 提交新建
  const handleCreate = () => {
    if (!formDate) { toast.error('请选择到期日'); return; }
    if (!formStrike) { toast.error('请选择行权价'); return; }
    const yieldVal = parseFloat(formYield || '0');
    if (yieldVal <= 0) { toast.error('请输入月化收益率'); return; }
    const expiryLabel = dateToExpiryLabel(formDate);
    saveMutation.mutate({
      ledgerId,
      configs: [{
        coin: formCoin,
        expiryLabel,
        expiryDate: formDate,
        strikePrice: Number(formStrike),
        optionType: formType,
        instrumentName: previewName,
        monthlyYield: yieldVal / 100,
        enabled: true,
      }],
    });
  };

  // 已保存配置列表
  const configs = configQuery.data?.configs || [];

  // 已保存配置按到期日分组
  const configsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const cfg of configs) {
      const dateStr = cfg.expiry_date?.slice(0, 10) || expiryLabelToDate(cfg.expiry_label);
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(cfg);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [configs]);

  // 绑定映射：买入价格 → 期权配置（通过 strike_price 字段作为绑定的买入价格）
  // 数据库中 strike_price 既是期权行权价，也用作绑定的买入价格
  // 如果需要分开，可以在数据库增加 bind_buy_price 字段
  // 当前设计：期权的 enabled=1 且 strike_price 在买入档位中 → 该买入价格已绑定
  const bindingMap = useMemo(() => {
    const map: Record<number, any> = {};
    for (const cfg of configs) {
      if (cfg.enabled) {
        map[Number(cfg.strike_price)] = cfg;
      }
    }
    return map;
  }, [configs]);

  // 切换启用状态
  const handleToggle = (cfg: any) => {
    const dateStr = cfg.expiry_date?.slice(0, 10) || expiryLabelToDate(cfg.expiry_label);
    saveMutation.mutate({
      ledgerId,
      configs: [{
        coin: cfg.coin,
        expiryLabel: cfg.expiry_label,
        expiryDate: dateStr,
        strikePrice: Number(cfg.strike_price),
        optionType: cfg.option_type,
        instrumentName: cfg.instrument_name,
        monthlyYield: Number(cfg.monthly_yield),
        enabled: cfg.enabled !== 1,
      }],
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="text-gray-600">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold text-gray-900">卖期权设置</h1>
        <div className="flex-1" />
        <button
          onClick={() => migrateMutation.mutate({ ledgerId })}
          disabled={migrateMutation.isPending}
          className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600"
        >
          {migrateMutation.isPending ? '执行中...' : '初始化表'}
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* 新建期权配置 */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">新建期权</h2>

          {/* 币种 */}
          <div className="mb-3">
            <label className="text-xs text-gray-500 mb-1 block">币种</label>
            <div className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold inline-block">ETH 以太坊</div>
          </div>

          {/* 到期日 */}
          <div className="mb-3">
            <label className="text-xs text-gray-500 mb-1 block">到期日</label>
            <input
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-blue-400"
            />
            {formDate && <p className="text-xs text-blue-600 mt-1">{formatDateCN(formDate)}</p>}
          </div>

          {/* 行权价 */}
          <div className="mb-3">
            <label className="text-xs text-gray-500 mb-1 block">行权价 (USDT)</label>
            <div className="flex flex-wrap gap-1.5">
              {STRIKE_PRICES.map((p) => (
                <button
                  key={p}
                  onClick={() => setFormStrike(p.toString())}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    formStrike === p.toString() ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {p.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* Call / Put */}
          <div className="mb-3">
            <label className="text-xs text-gray-500 mb-1 block">方向</label>
            <div className="flex gap-2">
              <button
                onClick={() => setFormType('PUT')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold ${formType === 'PUT' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500'}`}
              >PUT 看跌</button>
              <button
                onClick={() => setFormType('CALL')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold ${formType === 'CALL' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}
              >CALL 看涨</button>
            </div>
          </div>

          {/* 月化收益率 */}
          <div className="mb-4">
            <label className="text-xs text-gray-500 mb-1 block">月化收益率</label>
            <div className="flex items-center gap-2">
              <input
                type="number" step="0.1" min="0" max="100"
                value={formYield}
                onChange={(e) => setFormYield(e.target.value)}
                placeholder="例如 8.0"
                className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-blue-400"
              />
              <span className="text-sm text-gray-500 font-medium">%</span>
            </div>
          </div>

          {/* 预览 */}
          {previewName && (
            <div className="mb-3 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100">
              <p className="text-[10px] text-gray-400 mb-0.5">期权合约名称</p>
              <p className="text-sm font-mono font-semibold text-gray-800">{previewName}</p>
              <p className="text-xs text-gray-500 mt-1">
                {formCoin} {formatDateCN(formDate)} {formType === 'PUT' ? '看跌' : '看涨'} 行权价 ${Number(formStrike).toLocaleString()}
                {formYield && <span className="text-blue-600 ml-1">· 月化 {formYield}%</span>}
              </p>
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={saveMutation.isPending || !previewName}
            className={`w-full py-3 rounded-xl text-white font-semibold text-sm ${previewName ? 'bg-blue-600' : 'bg-gray-300'}`}
          >
            <Plus className="w-4 h-4 inline mr-1" />
            {saveMutation.isPending ? '保存中...' : '添加期权'}
          </button>
        </div>

        {/* 已配置的期权列表 */}
        {configsByDate.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">已配置的期权</h2>
            {configsByDate.map(([dateStr, cfgs]) => (
              <div key={dateStr} className="mb-4 last:mb-0">
                <div className="text-xs font-semibold text-gray-500 mb-2 px-1">{formatDateCN(dateStr)} 到期</div>
                <div className="space-y-1.5">
                  {cfgs.map((cfg: any) => (
                    <div key={cfg.id} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg ${cfg.enabled ? 'bg-blue-50' : 'bg-gray-50'}`}>
                      <button onClick={() => handleToggle(cfg)} className="flex-shrink-0" disabled={saveMutation.isPending}>
                        {cfg.enabled ? <ToggleRight className="w-5 h-5 text-blue-600" /> : <ToggleLeft className="w-5 h-5 text-gray-300" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${cfg.option_type === 'PUT' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                            {cfg.option_type}
                          </span>
                          <span className="text-sm font-mono font-semibold text-gray-800">${Number(cfg.strike_price).toLocaleString()}</span>
                          <span className="text-xs text-blue-600 font-medium">{(Number(cfg.monthly_yield) * 100).toFixed(1)}%</span>
                        </div>
                        <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">{cfg.instrument_name}</p>
                      </div>
                      <button
                        onClick={() => { if (confirm('确认删除？')) deleteMutation.mutate({ ledgerId, id: cfg.id }); }}
                        disabled={deleteMutation.isPending}
                        className="flex-shrink-0 text-gray-300 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 买入价格绑定区 */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-2">买入价格 · 期权绑定</h2>
          <p className="text-xs text-gray-400 mb-3">已绑定的价格，用户下单时会显示"锁定收益"标签和勾选框</p>

          <div className="space-y-1">
            {BUY_PRICES.map((price) => {
              const bound = bindingMap[price];
              return (
                <div key={price} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${bound ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
                  {/* 价格 */}
                  <span className={`text-sm font-mono font-semibold w-14 ${bound ? 'text-gray-900' : 'text-gray-400'}`}>
                    {price}
                  </span>

                  {bound ? (
                    <>
                      {/* 已绑定：显示绑定的期权信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Link2 className="w-3 h-3 text-amber-500" />
                          <span className={`text-[10px] font-semibold px-1 py-0.5 rounded ${bound.option_type === 'PUT' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                            {bound.option_type}
                          </span>
                          <span className="text-xs text-gray-600 truncate">{bound.instrument_name}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-400">{formatDateCN(bound.expiry_date?.slice(0, 10) || '')}</span>
                          <span className="text-[10px] text-blue-600 font-semibold">{(Number(bound.monthly_yield) * 100).toFixed(1)}% 月化</span>
                        </div>
                      </div>
                      {/* 解绑按钮 */}
                      <button
                        onClick={() => handleToggle(bound)}
                        disabled={saveMutation.isPending}
                        className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-500 flex items-center gap-1"
                      >
                        <Unlink className="w-3 h-3" /> 解绑
                      </button>
                    </>
                  ) : (
                    <>
                      {/* 未绑定 */}
                      <span className="flex-1 text-xs text-gray-300">未绑定期权</span>
                      {/* 绑定按钮：如果有可用的已启用期权 */}
                      {bindingOptionId === price ? (
                        <div className="flex items-center gap-1">
                          <select
                            className="text-xs px-2 py-1 rounded border border-gray-200 outline-none"
                            defaultValue=""
                            onChange={(e) => {
                              const cfgId = Number(e.target.value);
                              const cfg = configs.find((c: any) => c.id === cfgId);
                              if (!cfg) return;
                              // 更新该期权的 strike_price 为当前买入价格（绑定）
                              const dateStr = cfg.expiry_date?.slice(0, 10) || expiryLabelToDate(cfg.expiry_label);
                              saveMutation.mutate({
                                ledgerId,
                                configs: [{
                                  coin: cfg.coin,
                                  expiryLabel: cfg.expiry_label,
                                  expiryDate: dateStr,
                                  strikePrice: price,
                                  optionType: cfg.option_type,
                                  instrumentName: cfg.instrument_name,
                                  monthlyYield: Number(cfg.monthly_yield),
                                  enabled: true,
                                }],
                              });
                              setBindingOptionId(null);
                            }}
                          >
                            <option value="">选择期权...</option>
                            {configs.filter((c: any) => !bindingMap[Number(c.strike_price)] || Number(c.strike_price) === price).map((c: any) => (
                              <option key={c.id} value={c.id}>
                                {c.instrument_name} ({(Number(c.monthly_yield) * 100).toFixed(1)}%)
                              </option>
                            ))}
                          </select>
                          <button onClick={() => setBindingOptionId(null)} className="text-xs text-gray-400">取消</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setBindingOptionId(price)}
                          className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 flex items-center gap-1"
                        >
                          <Link2 className="w-3 h-3" /> 绑定
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 空状态 */}
        {configsByDate.length === 0 && !configQuery.isLoading && (
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm">暂无期权配置</p>
            <p className="text-xs mt-1">请先在上方创建期权，再绑定到买入价格</p>
          </div>
        )}
      </div>
    </div>
  );
}
