import { useId, useMemo, useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, Loader2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { useCenterToast } from "@/components/ui/center-toast";
import {
  ACCOUNTING_OPTIONS,
  EXPENSE_CATEGORIES,
  isValidAccountingCode,
  normalizeExpenseConfig,
  type AJExpenseConfig,
} from "@shared/aj-expense-config";

export type AJExpenseConfigPanelProps = {
  ledgerId: number;
  company: { id: number; name: string };
  onClose: () => void;
};

// 企业变更时重新挂载，绝不把另一企业的草稿带入当前企业。
export function AJExpenseConfigPanel(props: AJExpenseConfigPanelProps) {
  return <CompanyExpenseConfigPanel key={`${props.ledgerId}:${props.company.id}`} {...props} />;
}

function CompanyExpenseConfigPanel({ ledgerId, company, onClose }: AJExpenseConfigPanelProps) {
  const toast = useCenterToast();
  const utils = trpc.useUtils();
  const idPrefix = useId();
  const query = trpc.ledger.ajGetCompanyExpenseTypes.useQuery(
    { ledgerId, companyId: company.id },
    { retry: false, refetchOnWindowFocus: false },
  );
  const [draft, setDraft] = useState<AJExpenseConfig | null>(null);
  // 首次全部展开，便于发现每个事项下方的会计科目；用户可自行收起大类。
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const savedConfig = useMemo(() => normalizeExpenseConfig(query.data), [query.data]);
  const effectiveConfig = draft ?? savedConfig;

  const saveMutation = trpc.ledger.ajSetCompanyExpenseTypes.useMutation({
    retry: false,
    onSuccess: () => {
      // 配置变化会令 AI 建议与批审核对指纹过期，刷新全部 GET 派生缓存，不自动识别。
      void (utils as any).ledger.invalidate().catch(() => {
        toast.error('配置已保存，但只读缓存刷新失败；请刷新后重新核对，不要重复保存。');
      });
      toast.success("报销事项与会计科目已保存");
      onClose();
    },
    // 预览只读或权限不足等真实接口错误原样展示，不绕过、不本地假保存。
    onError: (error) => toast.error(error.message),
  });

  // 查询失败即使存在缓存/草稿也禁止保存，不能拿默认目录覆盖服务器配置。
  const canEdit = query.isSuccess && !query.isError && !query.isFetching && !saveMutation.isPending;

  const updateCategory = (
    categoryKey: string,
    update: (category: AJExpenseConfig[string]) => AJExpenseConfig[string],
  ) => {
    if (!canEdit) return;
    setDraft((previous) => {
      const base = normalizeExpenseConfig(previous ?? query.data);
      const category: AJExpenseConfig[string] = base[categoryKey] ?? { enabled: true, items: {} };
      return { ...base, [categoryKey]: update(category) };
    });
  };

  const toggleCategory = (categoryKey: string) => {
    updateCategory(categoryKey, (category) => ({ ...category, enabled: !category.enabled }));
  };

  const toggleItem = (categoryKey: string, itemKey: string) => {
    updateCategory(categoryKey, (category) => ({
      ...category,
      items: { ...category.items, [itemKey]: !(category.items[itemKey] !== false) },
    }));
  };

  const setAccountingCode = (categoryKey: string, itemKey: string, value: string) => {
    if (value !== "" && !isValidAccountingCode(value)) return;
    updateCategory(categoryKey, (category) => {
      const accountingMap = { ...category.accountingMap };
      if (value === "") delete accountingMap[itemKey];
      else accountingMap[itemKey] = value;
      return { ...category, accountingMap };
    });
  };

  const handleSave = () => {
    if (!canEdit) return;
    saveMutation.mutate({
      ledgerId,
      companyId: company.id,
      config: normalizeExpenseConfig(effectiveConfig),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${idPrefix}-title`}
        className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl"
      >
        <header className="flex flex-shrink-0 items-start justify-between gap-3 bg-[#1A2B4A] p-4 text-white">
          <div className="min-w-0">
            <h2 id={`${idPrefix}-title`} className="text-base font-semibold">报销事项与会计科目</h2>
            <p className="mt-1 break-words text-xs text-blue-100">{company.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭配置面板"
            disabled={saveMutation.isPending}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
          <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-[#1A2B4A]">
            AI只在本企业已启用事项中匹配，自动填写仅使用这里确认的科目映射；未配置由人工确认
          </p>
          {query.isError ? (
            <div role="alert" className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <p className="font-medium">企业配置加载失败，已禁止保存</p>
                  <p className="mt-1 break-words text-xs">{query.error.message}</p>
                  <p className="mt-1 text-xs">不会使用默认配置覆盖原数据，请重试加载。</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={query.isFetching}
                onClick={() => { void query.refetch(); }}
                className="h-8 border-red-200 text-xs"
              >
                {query.isFetching ? "重新加载中..." : "重新加载"}
              </Button>
            </div>
          ) : !query.isSuccess ? (
            <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载企业配置中...
            </div>
          ) : (
            <>
              <p className="text-xs leading-5 text-gray-500">
                事项默认全部启用；会计科目需逐项确认，可留空。关闭开关会保留已有映射，重新启用后仍可使用。
              </p>
              {query.isFetching && <p role="status" className="text-xs text-blue-600">正在更新企业配置，暂不可编辑或保存...</p>}
              {EXPENSE_CATEGORIES.map((category) => {
                const categoryConfig: AJExpenseConfig[string] = effectiveConfig[category.key] ?? { enabled: true, items: {} };
                const isCollapsed = collapsed[category.key] === true;
                const enabledCount = category.items.filter((item) => categoryConfig.items[item.key] !== false).length;
                const mappedCount = category.items.filter((item) => (
                  categoryConfig.items[item.key] !== false
                  && isValidAccountingCode(categoryConfig.accountingMap?.[item.key])
                )).length;
                return (
                  <section key={category.key} className="overflow-hidden rounded-xl border border-blue-100">
                    <div className="flex items-center gap-2 bg-blue-50/70 px-3 py-3">
                      <button
                        type="button"
                        onClick={() => setCollapsed((previous) => ({ ...previous, [category.key]: !previous[category.key] }))}
                        aria-expanded={!isCollapsed}
                        aria-controls={`${idPrefix}-${category.key}-items`}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {isCollapsed ? <ChevronRight className="h-4 w-4 flex-shrink-0 text-blue-600" /> : <ChevronDown className="h-4 w-4 flex-shrink-0 text-blue-600" />}
                        <span>
                          <span className="block text-sm font-semibold text-[#1A2B4A]">{category.label}</span>
                          <span className="mt-0.5 block text-[11px] text-gray-500">
                            {categoryConfig.enabled ? `启用 ${enabledCount}/${category.items.length} · 已配科目 ${mappedCount}/${enabledCount}` : "大类已关闭 · 已有映射保留"}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={categoryConfig.enabled}
                        aria-label={`${category.label}大类启用开关`}
                        onClick={() => toggleCategory(category.key)}
                        disabled={!canEdit}
                        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-50 ${categoryConfig.enabled ? "bg-[#1A2B4A]" : "bg-gray-300"}`}
                      >
                        <span className={`absolute left-[3px] top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${categoryConfig.enabled ? "translate-x-5" : "translate-x-0"}`} />
                      </button>
                    </div>
                    {!isCollapsed && (
                      <div id={`${idPrefix}-${category.key}-items`} className="divide-y divide-gray-100 px-3">
                        {categoryConfig.enabled ? category.items.map((item) => {
                          const itemEnabled = categoryConfig.items[item.key] !== false;
                          const accountingCode = categoryConfig.accountingMap?.[item.key];
                          const selectId = `${idPrefix}-${category.key}-${item.key}-accounting`;
                          return (
                            <div key={item.key} className="py-3">
                              <div className="flex items-center justify-between gap-3">
                                <span className={`text-sm ${itemEnabled ? "text-gray-800" : "text-gray-400"}`}>{item.label}</span>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={itemEnabled}
                                  aria-label={`${category.label}：${item.label}启用开关`}
                                  onClick={() => toggleItem(category.key, item.key)}
                                  disabled={!canEdit}
                                  className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors disabled:opacity-50 ${itemEnabled ? "bg-blue-600" : "bg-gray-300"}`}
                                >
                                  <span className={`absolute left-[2px] top-[2px] h-4 w-4 rounded-full bg-white shadow transition-transform ${itemEnabled ? "translate-x-4" : "translate-x-0"}`} />
                                </button>
                              </div>
                              {itemEnabled ? (
                                <div className="mt-2">
                                  <label htmlFor={selectId} className="mb-1 block text-xs text-gray-500">会计科目（可留空）</label>
                                  <select
                                    id={selectId}
                                    value={isValidAccountingCode(accountingCode) ? accountingCode : ""}
                                    onChange={(event) => setAccountingCode(category.key, item.key, event.target.value)}
                                    disabled={!canEdit}
                                    className="h-10 w-full min-w-0 rounded-lg border border-blue-100 bg-white px-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                                  >
                                    <option value="">待配置(不自动归档)</option>
                                    {ACCOUNTING_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                                  </select>
                                </div>
                              ) : (
                                <p className="mt-1 text-[11px] text-gray-400">已停用{isValidAccountingCode(accountingCode) ? ` · 保留科目：${accountingCode}` : ""}</p>
                              )}
                            </div>
                          );
                        }) : <p className="py-3 text-xs leading-5 text-gray-400">重新启用大类后可设置各事项与科目，原有子项开关和映射不会丢失。</p>}
                      </div>
                    )}
                  </section>
                );
              })}
            </>
          )}
        </div>

        <footer className="flex-shrink-0 border-t border-gray-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {saveMutation.isError && (
            <p role="alert" className="mb-3 break-words rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
              保存失败：{saveMutation.error.message}。尚未保存，当前编辑内容已保留。
            </p>
          )}
          <Button
            type="button"
            className="w-full rounded-xl bg-[#1A2B4A] text-white hover:bg-[#243C66]"
            onClick={handleSave}
            disabled={!canEdit}
          >
            {saveMutation.isPending ? "保存中..." : "保存配置"}
          </Button>
        </footer>
      </section>
    </div>
  );
}

export default AJExpenseConfigPanel;
