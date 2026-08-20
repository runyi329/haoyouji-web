/**
 * AfOptionSellSettings.tsx
 * 52号账本"卖期权设置"管理页面
 * 管理员可以：
 *   1. 从 Deribit 自动拉取 ETH 期权到期日（显示为中文日期格式）
 *   2. 手动添加到期日
 *   3. 选择到期日后拉取该日期的行权价列表（含 Call/Put）
 *   4. 对每个行权价配置月化收益率和启用状态
 */
import { useState, useMemo, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Plus, RefreshCw, Save, ToggleLeft, ToggleRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

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

// 将 YYYY-MM-DD 转为中文显示
function formatDateCN(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}年${parseInt(m)}月${parseInt(d)}日`;
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
    onSuccess: (data) => { toast.success(`初始化完成: ${data.results.join(', ')}`); },
    onError: (e) => toast.error(e.message),
  });
  // 保存配置
  const saveMutation = trpc.ledger.afSaveOptionSellConfig.useMutation({
    onSuccess: () => { toast.success('配置已保存'); void configQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // 本地状态
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [manualExpiryInput, setManualExpiryInput] = useState('');
  const [selectedType, setSelectedType] = useState<'PUT' | 'CALL'>('PUT');

  // 拉取选中到期日的行权价列表
  const strikesQuery = trpc.ledger.afGetOptionStrikes.useQuery(
    { ledgerId, expiryLabel: selectedExpiry },
    { enabled: !!selectedExpiry, staleTime: 120000 }
  );

  // 编辑中的配置
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

  // 当前选中类型的行权价列表
  const currentStrikes = useMemo(() => {
    if (!strikesQuery.data) return [];
    return selectedType === 'PUT' ? (strikesQuery.data as any).puts || [] : (strikesQuery.data as any).calls || [];
  }, [strikesQuery.data, selectedType]);

  // 选择到期日后，初始化编辑状态
  useEffect(() => {
    if (!selectedExpiry || !currentStrikes.length) return;
    const configs = configsByExpiry[selectedExpiry] || [];
    const map: Record<string, { enabled: boolean; yield: string }> = {};
    for (const s of currentStrikes) {
      const strike = Number(s.strike);
      const existing = configs.find((c: any) => Number(c.strike_price) === strike && c.option_type === selectedType);
      map[`${strike}`] = {
        enabled: existing ? existing.enabled === 1 : false,
        yield: existing ? (Number(existing.monthly_yield) * 100).toFixed(2) : '',
      };
    }
    setEditConfigs(map);
  }, [selectedExpiry, currentStrikes, selectedType, configsByExpiry]);

  // 手动添加到期日
  const handleAddManualExpiry = () => {
    const input = manualExpiryInput.trim().toUpperCase();
    if (!input) { toast.error('请输入到期日标签'); return; }
    if (!input.match(/^\d{1,2}[A-Z]{3}\d{2}$/)) {
      toast.error('格式错误，请使用如 28AUG26 的格式（日+月英文缩写+年后两位）');
      return;
    }
    const dateStr = expiryLabelToDate(input);
    if (!dateStr) { toast.error('无法解析日期'); return; }
    setManualExpiryInput('');
    setSelectedExpiry(input);
    toast.success(`已选择到期日 ${formatDateCN(dateStr)}`);
  };

  // 保存当前到期日的配置
  const handleSave = () => {
    if (!selectedExpiry) return;
    const expiryDate = expiryLabelToDate(selectedExpiry);
    if (!expiryDate) { toast.error('到期日格式错误'); return; }
    const configs = currentStrikes
      .map((s: any) => {
        const strike = Number(s.strike);
        const key = `${strike}`;
        const edit = editConfigs[key];
        const yieldVal = parseFloat(edit?.yield || '0') / 100;
        return {
          coin: 'ETH',
          expiryLabel: selectedExpiry,
          expiryDate,
          strikePrice: strike,
          optionType: selectedType,
          instrumentName: s.name || makeInstrumentName(selectedExpiry, strike, selectedType),
          monthlyYield: isNaN(yieldVal) ? 0 : yieldVal,
          enabled: edit?.enabled || false,
        };
      })
      .filter((c) => c.enabled || c.monthlyYield > 0);
    if (configs.length === 0) { toast.error('请至少启用一个行权价'); return; }
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
          {migrateMutation.isPending ? '执行中...' : '初始化表'}
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* 到期日选择区 */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800">以太坊 ETH 期权到期日</h2>
            <button
              onClick={() => void expiriesQuery.refetch()}
              disabled={expiriesQuery.isFetching}
              className="flex items-center gap-1 text-xs text-blue-600"
            >
              <RefreshCw className={`w-3 h-3 ${expiriesQuery.isFetching ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>

          {/* Deribit 来源状态 */}
          {expiriesQuery.data?.source === 'unavailable' && (
            <p className="text-xs text-amber-600 mb-2">Deribit 不可达，请手动添加到期日</p>
          )}
          {expiriesQuery.data?.source === 'deribit' && (
            <p className="text-xs text-green-600 mb-2">已从 Deribit 获取 {availableExpiries.length} 个可用到期日</p>
          )}

          {/* 到期日按钮列表 - 显示中文日期 */}
          <div className="flex flex-wrap gap-2 mb-3">
            {[...new Set([...savedExpiries, ...availableExpiries])].map((label) => {
              const dateStr = expiryLabelToDate(label);
              const dateCN = formatDateCN(dateStr);
              return (
                <button
                  key={label}
                  onClick={() => setSelectedExpiry(label)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    selectedExpiry === label
                      ? 'bg-blue-600 text-white'
                      : savedExpiries.includes(label)
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <div className="text-left">
                    <div>ETH {dateCN}</div>
                    {savedExpiries.includes(label) && (
                      <div className="text-[10px] opacity-70 mt-0.5">
                        已配置 {(configsByExpiry[label] || []).filter((c: any) => c.enabled).length} 档
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 手动添加 */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
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

        {/* 选中到期日后：Call/Put 选择 + 行权价列表 */}
        {selectedExpiry && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">
                  ETH {formatDateCN(expiryLabelToDate(selectedExpiry))}
                </h2>
                <p className="text-[10px] text-gray-400 mt-0.5">选择期权方向和行权价</p>
              </div>
              {/* Call / Put 切换 */}
              <div className="flex rounded-lg overflow-hidden border border-gray-200">
                <button
                  onClick={() => setSelectedType('PUT')}
                  className={`px-4 py-1.5 text-xs font-semibold ${selectedType === 'PUT' ? 'bg-red-500 text-white' : 'bg-white text-gray-500'}`}
                >
                  PUT 看跌
                </button>
                <button
                  onClick={() => setSelectedType('CALL')}
                  className={`px-4 py-1.5 text-xs font-semibold ${selectedType === 'CALL' ? 'bg-green-500 text-white' : 'bg-white text-gray-500'}`}
                >
                  CALL 看涨
                </button>
              </div>
            </div>

            {/* 加载状态 */}
            {strikesQuery.isFetching && (
              <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">正在从 Deribit 获取行权价...</span>
              </div>
            )}

            {/* 行权价列表 */}
            {!strikesQuery.isFetching && currentStrikes.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">{currentStrikes.length} 个行权价可选</span>
                  <button
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs"
                  >
                    <Save className="w-3 h-3" />
                    {saveMutation.isPending ? '保存中...' : '保存配置'}
                  </button>
                </div>

                <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                  {currentStrikes.map((s: any) => {
                    const strike = Number(s.strike);
                    const key = `${strike}`;
                    const edit = editConfigs[key] || { enabled: false, yield: '' };
                    return (
                      <div key={key} className={`flex items-center gap-3 py-2.5 px-3 rounded-lg ${edit.enabled ? 'bg-blue-50' : 'bg-gray-50'}`}>
                        {/* 启用开关 */}
                        <button
                          onClick={() => setEditConfigs((prev) => ({
                            ...prev,
                            [key]: { ...edit, enabled: !edit.enabled },
                          }))}
                          className="flex-shrink-0"
                        >
                          {edit.enabled
                            ? <ToggleRight className="w-6 h-6 text-blue-600" />
                            : <ToggleLeft className="w-6 h-6 text-gray-300" />
                          }
                        </button>
                        {/* 行权价 */}
                        <div className="flex-1">
                          <span className={`text-sm font-mono font-semibold ${edit.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                            ${strike.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-gray-300 ml-2 font-mono">{s.name}</span>
                        </div>
                        {/* 月化收益输入 */}
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-gray-400">月化</span>
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
                            placeholder="0"
                            className={`w-14 text-xs px-2 py-1.5 rounded border text-center outline-none ${
                              edit.enabled ? 'border-blue-300 bg-white text-gray-900' : 'border-gray-200 bg-gray-100 text-gray-300'
                            }`}
                          />
                          <span className="text-xs text-gray-400">%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* 无数据 */}
            {!strikesQuery.isFetching && currentStrikes.length === 0 && (strikesQuery.data as any)?.source === 'unavailable' && (
              <p className="text-xs text-amber-600 py-4 text-center">无法获取行权价数据，请检查网络</p>
            )}
          </div>
        )}

        {/* 已保存配置概览（未选中到期日时显示） */}
        {savedExpiries.length > 0 && !selectedExpiry && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">已配置的期权</h2>
            {savedExpiries.map((label) => {
              const configs = configsByExpiry[label] || [];
              const enabledCount = configs.filter((c: any) => c.enabled).length;
              const dateStr = expiryLabelToDate(label);
              return (
                <div key={label} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <div>
                    <span className="text-sm font-medium text-gray-800">ETH {formatDateCN(dateStr)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-blue-600 font-medium">{enabledCount} 档启用</span>
                    <button onClick={() => setSelectedExpiry(label)} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">编辑</button>
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
