/**
 * AfOptionSellSettings.tsx
 * 52号账本"卖期权设置"管理页面
 * 管理员可以：
 *   1. 从 Deribit 自动拉取 ETH 期权到期日
 *   2. 手动添加到期日
 *   3. 对每个价格档位配置月化收益率和启用状态
 */
import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Plus, Trash2, RefreshCw, Save, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";

// ETH 买入价格档位（50一档，1300~2200）
const ETH_STRIKE_PRICES = Array.from({ length: 19 }, (_, i) => 1300 + i * 50);

// 将 Deribit 到期日标签（如 "28AUG26"）转为 YYYY-MM-DD
function expiryLabelToDate(label: string): string {
  const months: Record<string, string> = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
  };
  const match = label.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (!match) return '';
  const [, day, mon, yr] = match;
  const monthNum = months[mon];
  if (!monthNum) return '';
  return `20${yr}-${monthNum}-${day.padStart(2, '0')}`;
}

// 生成标准合约名称
function makeInstrumentName(expiryLabel: string, strike: number, optionType: string): string {
  const suffix = optionType === 'PUT' ? 'P' : 'C';
  return `ETH-${expiryLabel}-${strike}-${suffix}`;
}

export default function AfOptionSellSettings() {
  const [, params] = useRoute("/ledger/:id/option-sell-settings");
  const [, setLocation] = useLocation();
  const ledgerId = Number(params?.id || 52);
  const utils = trpc.useUtils();

  // 拉取 Deribit 到期日
  const expiriesQuery = trpc.ledger.afGetOptionExpiries.useQuery({ ledgerId }, { staleTime: 60000 });
  // 已保存的配置
  const configQuery = trpc.ledger.afGetOptionSellConfig.useQuery({ ledgerId });
  // 迁移接口
  const migrateMutation = trpc.ledger.afMigrateOptionSellConfig.useMutation({
    onSuccess: (data) => { toast.success(`迁移完成: ${data.results.join(', ')}`); },
    onError: (e) => toast.error(e.message),
  });
  // 保存配置
  const saveMutation = trpc.ledger.afSaveOptionSellConfig.useMutation({
    onSuccess: () => { toast.success('配置已保存'); void configQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  // 删除配置
  const deleteMutation = trpc.ledger.afDeleteOptionSellConfig.useMutation({
    onSuccess: () => { toast.success('已删除'); void configQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // 本地状态：选中的到期日
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [manualExpiryInput, setManualExpiryInput] = useState('');
  const [optionType, setOptionType] = useState<'PUT' | 'CALL'>('PUT');

  // 编辑中的配置（按到期日+档位）
  const [editConfigs, setEditConfigs] = useState<Record<string, { enabled: boolean; yield: string }>>({});

  // 已保存配置按到期日分组
  const configsByExpiry = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const cfg of (configQuery.data?.configs || [])) {
      const key = cfg.expiry_label;
      if (!map[key]) map[key] = [];
      map[key].push(cfg);
    }
    return map;
  }, [configQuery.data]);

  const savedExpiries = Object.keys(configsByExpiry);

  // Deribit 到期日列表（过滤掉已过期的）
  const availableExpiries = (expiriesQuery.data?.expiries || []).filter((e: string) => {
    const d = expiryLabelToDate(e);
    return d && d >= new Date().toISOString().slice(0, 10);
  });

  // 当前选中到期日的配置
  const currentExpiryConfigs = selectedExpiry ? (configsByExpiry[selectedExpiry] || []) : [];

  // 初始化编辑状态
  const initEditForExpiry = (expiryLabel: string) => {
    const configs = configsByExpiry[expiryLabel] || [];
    const map: Record<string, { enabled: boolean; yield: string }> = {};
    for (const strike of ETH_STRIKE_PRICES) {
      const existing = configs.find((c: any) => Number(c.strike_price) === strike);
      const key = `${strike}`;
      map[key] = {
        enabled: existing ? existing.enabled === 1 : false,
        yield: existing ? (Number(existing.monthly_yield) * 100).toFixed(2) : '',
      };
    }
    setEditConfigs(map);
  };

  // 选择到期日
  const handleSelectExpiry = (label: string) => {
    setSelectedExpiry(label);
    initEditForExpiry(label);
  };

  // 手动添加到期日
  const handleAddManualExpiry = () => {
    const input = manualExpiryInput.trim().toUpperCase();
    if (!input) { toast.error('请输入到期日标签'); return; }
    // 验证格式
    if (!input.match(/^\d{1,2}[A-Z]{3}\d{2}$/)) {
      toast.error('格式错误，请使用如 28AUG26 的格式');
      return;
    }
    const dateStr = expiryLabelToDate(input);
    if (!dateStr) { toast.error('无法解析日期'); return; }
    setManualExpiryInput('');
    handleSelectExpiry(input);
    toast.success(`已添加到期日 ${input} (${dateStr})`);
  };

  // 保存当前到期日的配置
  const handleSave = () => {
    if (!selectedExpiry) return;
    const expiryDate = expiryLabelToDate(selectedExpiry);
    if (!expiryDate) { toast.error('到期日格式错误'); return; }
    const configs = ETH_STRIKE_PRICES.map((strike) => {
      const key = `${strike}`;
      const edit = editConfigs[key];
      const yieldVal = parseFloat(edit?.yield || '0') / 100;
      return {
        coin: 'ETH',
        expiryLabel: selectedExpiry,
        expiryDate,
        strikePrice: strike,
        optionType,
        instrumentName: makeInstrumentName(selectedExpiry, strike, optionType),
        monthlyYield: isNaN(yieldVal) ? 0 : yieldVal,
        enabled: edit?.enabled || false,
      };
    }).filter((c) => c.enabled || c.monthlyYield > 0); // 只保存有意义的配置
    if (configs.length === 0) { toast.error('请至少启用一个档位'); return; }
    saveMutation.mutate({ ledgerId, configs });
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
          {migrateMutation.isPending ? '迁移中...' : '初始化表'}
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* 到期日选择区 */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800">选择到期日</h2>
            <button
              onClick={() => void expiriesQuery.refetch()}
              disabled={expiriesQuery.isFetching}
              className="flex items-center gap-1 text-xs text-blue-600"
            >
              <RefreshCw className={`w-3 h-3 ${expiriesQuery.isFetching ? 'animate-spin' : ''}`} />
              从Deribit刷新
            </button>
          </div>

          {/* Deribit 来源状态 */}
          {expiriesQuery.data?.source === 'unavailable' && (
            <p className="text-xs text-amber-600 mb-2">Deribit 不可达（可能被网络限制），请手动添加到期日</p>
          )}

          {/* 已有到期日标签 */}
          <div className="flex flex-wrap gap-2 mb-3">
            {[...new Set([...savedExpiries, ...availableExpiries])].map((label) => (
              <button
                key={label}
                onClick={() => handleSelectExpiry(label)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedExpiry === label
                    ? 'bg-blue-600 text-white'
                    : savedExpiries.includes(label)
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'bg-gray-100 text-gray-600'
                }`}
              >
                {label}
                {savedExpiries.includes(label) && <span className="ml-1 text-[10px]">({(configsByExpiry[label] || []).filter((c: any) => c.enabled).length})</span>}
              </button>
            ))}
          </div>

          {/* 手动添加 */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={manualExpiryInput}
              onChange={(e) => setManualExpiryInput(e.target.value)}
              placeholder="手动输入，如 28AUG26"
              className="flex-1 text-xs px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-blue-400"
            />
            <button onClick={handleAddManualExpiry} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-800 text-white text-xs">
              <Plus className="w-3 h-3" /> 添加
            </button>
          </div>
        </div>

        {/* 期权类型选择 */}
        {selectedExpiry && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-4 mb-3">
              <h2 className="text-sm font-semibold text-gray-800">期权类型</h2>
              <div className="flex gap-2">
                {(['PUT', 'CALL'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setOptionType(t)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium ${optionType === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-400">
              到期日：{selectedExpiry} ({expiryLabelToDate(selectedExpiry)})
              ，合约示例：{makeInstrumentName(selectedExpiry, 1500, optionType)}
            </p>
          </div>
        )}

        {/* 价格档位配置 */}
        {selectedExpiry && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-800">价格档位配置</h2>
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs"
              >
                <Save className="w-3 h-3" />
                {saveMutation.isPending ? '保存中...' : '保存'}
              </button>
            </div>

            <div className="space-y-2">
              {ETH_STRIKE_PRICES.map((strike) => {
                const key = `${strike}`;
                const edit = editConfigs[key] || { enabled: false, yield: '' };
                return (
                  <div key={strike} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    {/* 启用开关 */}
                    <button
                      onClick={() => setEditConfigs((prev) => ({
                        ...prev,
                        [key]: { ...edit, enabled: !edit.enabled },
                      }))}
                      className="flex-shrink-0"
                    >
                      {edit.enabled
                        ? <ToggleRight className="w-5 h-5 text-blue-600" />
                        : <ToggleLeft className="w-5 h-5 text-gray-300" />
                      }
                    </button>
                    {/* 行权价 */}
                    <span className={`text-sm font-mono w-12 ${edit.enabled ? 'text-gray-900 font-semibold' : 'text-gray-400'}`}>
                      {strike}
                    </span>
                    {/* 月化收益输入 */}
                    <div className="flex items-center gap-1 flex-1">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={edit.yield}
                        onChange={(e) => setEditConfigs((prev) => ({
                          ...prev,
                          [key]: { ...edit, yield: e.target.value },
                        }))}
                        disabled={!edit.enabled}
                        placeholder="月化%"
                        className={`w-20 text-xs px-2 py-1.5 rounded border outline-none ${
                          edit.enabled ? 'border-blue-200 bg-blue-50 text-gray-900' : 'border-gray-100 bg-gray-50 text-gray-300'
                        }`}
                      />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                    {/* 合约名称预览 */}
                    <span className="text-[10px] text-gray-300 font-mono hidden sm:block">
                      {makeInstrumentName(selectedExpiry, strike, optionType)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 已保存配置概览 */}
        {savedExpiries.length > 0 && !selectedExpiry && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">已配置的到期日</h2>
            {savedExpiries.map((label) => {
              const configs = configsByExpiry[label] || [];
              const enabledCount = configs.filter((c: any) => c.enabled).length;
              return (
                <div key={label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{label}</span>
                    <span className="text-xs text-gray-400 ml-2">({expiryLabelToDate(label)})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-blue-600">{enabledCount} 档启用</span>
                    <button onClick={() => handleSelectExpiry(label)} className="text-xs text-gray-500 underline">编辑</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
