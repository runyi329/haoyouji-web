import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  Check,
  ChevronRight,
  History,
  Loader2,
  Plus,
  Search,
  Store,
  Users,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { SupplierDTO } from "@shared/miban-supplier";

// Supplier permissions are independent of sales rank and global account roles.
export const supplierApi = trpc.supplier;
type MemberOption = { id: number; name: string | null; username: string };
type SupplierForm = {
  id?: number;
  name: string;
  active: boolean;
  seriesKeys: string[];
  userIds: number[];
};
const emptyForm = (): SupplierForm => ({
  name: "",
  active: true,
  seriesKeys: [],
  userIds: [],
});
export const supplierInputClass =
  "w-full min-w-0 max-w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400 disabled:opacity-50";
export const supplierButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#FF6900] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";
export const supplierCardClass =
  "min-w-0 rounded-2xl border border-gray-100 bg-white p-4";

export function SupplierNotice({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`flex min-w-0 items-start gap-2 rounded-xl p-3 text-xs leading-5 ${error ? "bg-red-50 text-red-700" : "bg-orange-50 text-orange-700"}`}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 break-words">{message}</p>
    </div>
  );
}

function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter(item => item !== value)
    : [...values, value];
}

export default function SupplierAdminPanel() {
  const me = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const access = supplierApi.access.useQuery(undefined, {
    enabled: me.isSuccess && !!me.data?.id && !me.error,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const canAdmin =
    !!me.data?.id &&
    !me.error &&
    access.data?.isAdmin === true &&
    !access.error;
  const catalog = supplierApi.adminCatalog.useQuery(undefined, {
    enabled: canAdmin,
    retry: false,
  });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [knownMembers, setKnownMembers] = useState<MemberOption[]>([]);
  const [searchText, setSearchText] = useState("");
  const [keyword, setKeyword] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [historySupplier, setHistorySupplier] = useState<SupplierDTO | null>(
    null
  );
  const [historyIds, setHistoryIds] = useState<number[]>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => setKeyword(searchText.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchText]);
  const users = supplierApi.adminSearchUsers.useQuery(
    { keyword },
    { enabled: canAdmin && editing && keyword.length > 0, retry: false }
  );
  const history = supplierApi.adminHistory.useQuery(
    { supplierId: historySupplier?.id ?? 0 },
    { enabled: canAdmin && !!historySupplier, retry: false }
  );
  const utils = trpc.useUtils();
  const save = supplierApi.adminSave.useMutation({
    onSuccess: async () => {
      setEditing(false);
      setNotice("供货商设置已保存。员工下次读取授权后即可进入供货商中心。");
      await Promise.all([
        utils.supplier.adminCatalog.invalidate(),
        utils.supplier.access.invalidate(),
        utils.supplier.workspace.invalidate(),
      ]);
    },
    onError: error => setFormError(error.message),
  });
  const assign = supplierApi.adminAssignHistory.useMutation({
    onSuccess: async result => {
      setHistoryIds([]);
      setNotice(
        `已确认导入 ${result.assignedCount} 笔历史订单。取消订单不计入销售额。`
      );
      await Promise.all([
        utils.supplier.adminHistory.invalidate(),
        utils.supplier.workspace.invalidate(),
      ]);
    },
    onError: error => setFormError(error.message),
  });

  function openEditor(supplier?: SupplierDTO) {
    if (save.isPending || assign.isPending) return;
    setHistorySupplier(null);
    setForm(
      supplier
        ? {
            id: supplier.id,
            name: supplier.name,
            active: supplier.active,
            seriesKeys: [...supplier.seriesKeys],
            userIds: supplier.members.map(member => member.userId),
          }
        : emptyForm()
    );
    setKnownMembers(
      supplier?.members.map(member => ({
        id: member.userId,
        name: member.name,
        username: member.username,
      })) ?? []
    );
    setSearchText("");
    setKeyword("");
    setFormError("");
    setNotice("");
    setEditing(true);
  }
  function submit() {
    if (save.isPending) return;
    const name = form.name.trim();
    if (!name) return setFormError("请填写供货商姓名或名称。");
    if (!form.seriesKeys.length)
      return setFormError("请至少选择一个精选系列。");
    if (!form.userIds.length) return setFormError("请至少选择一名已注册员工。");
    setFormError("");
    save.mutate({ ...form, name });
  }
  const memberOptions = Array.from(
    new Map(
      [...knownMembers, ...(users.data ?? [])].map(member => [
        member.id,
        member,
      ])
    ).values()
  );

  if (me.error)
    return (
      <SupplierNotice error message={`本人账户读取失败：${me.error.message}`} />
    );
  if (!me.data && !me.isLoading)
    return <SupplierNotice error message="请先登录本人账户。" />;
  if (access.error)
    return (
      <SupplierNotice
        error
        message={`供货商权限读取失败：${access.error.message}`}
      />
    );
  if (me.isLoading || access.isLoading)
    return (
      <p role="status" className="py-8 text-center text-sm text-gray-400">
        正在读取供货商权限…
      </p>
    );
  if (!canAdmin)
    return (
      <SupplierNotice
        error
        message="仅供货商管理员可修改设置，请返回供货商中心查看本人授权。"
      />
    );

  return (
    <section className="mx-auto w-full max-w-[480px] min-w-0 space-y-4 text-gray-800">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Store className="h-5 w-5 text-[#FF6900]" />
            供货商管理
          </h2>
          <p className="mt-1 text-xs text-gray-400">
            精选系列归属与独立员工授权
          </p>
        </div>
        <button
          type="button"
          className={supplierButtonClass}
          disabled={save.isPending || assign.isPending}
          onClick={() => openEditor()}
        >
          <Plus className="h-4 w-4" />
          新增
        </button>
      </div>
      <Link
        href="/p/proj_hzxm2t/supplier"
        className="flex items-center justify-between rounded-xl bg-orange-50 p-3 text-sm text-orange-700"
      >
        进入供货商中心审核
        <ChevronRight className="h-4 w-4 shrink-0" />
      </Link>
      <SupplierNotice message="供货商是独立的额外能力，不改变米伴职级、团队或钱包权限。系列与员工冲突以服务端校验为准，保存后生效，不会自动保存。" />
      {notice && <SupplierNotice message={notice} />}
      {catalog.error && (
        <SupplierNotice error message={catalog.error.message} />
      )}
      {catalog.isLoading ? (
        <p role="status" className="py-6 text-center text-sm text-gray-400">
          加载供货商设置…
        </p>
      ) : catalog.data?.suppliers.length === 0 ? (
        <div className={supplierCardClass}>
          <Store className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          <p className="text-center text-sm text-gray-500">
            尚未设置供货商，点击“新增”开始配置。
          </p>
        </div>
      ) : (
        catalog.data?.suppliers.map(supplier => (
          <div key={supplier.id} className={`${supplierCardClass} space-y-3`}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="min-w-0 break-words font-semibold">
                {supplier.name}
              </h3>
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${supplier.active ? "bg-orange-50 text-orange-600" : "bg-gray-100 text-gray-500"}`}
              >
                {supplier.active ? "已启用" : "已停用"}
              </span>
            </div>
            <p className="break-words text-xs leading-5 text-gray-500">
              系列：
              {supplier.seriesKeys
                .map(
                  key =>
                    catalog.data?.series.find(series => series.key === key)
                      ?.title ?? key
                )
                .join("、") || "未设置"}
            </p>
            <p className="flex items-start gap-1.5 text-xs leading-5 text-gray-500">
              <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">
                {supplier.members
                  .map(
                    member =>
                      `${member.name || member.username}（${member.username}）`
                  )
                  .join("、") || "暂无员工"}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={save.isPending || assign.isPending}
                onClick={() => openEditor(supplier)}
                className="rounded-lg border border-orange-200 px-3 py-2 text-xs font-semibold text-orange-600"
              >
                编辑供货商
              </button>
              <button
                type="button"
                disabled={save.isPending || assign.isPending}
                onClick={() => {
                  setEditing(false);
                  setHistorySupplier(supplier);
                  setHistoryIds([]);
                  setFormError("");
                }}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600"
              >
                <History className="h-3.5 w-3.5" />
                审核历史订单
              </button>
            </div>
          </div>
        ))
      )}
      {editing && (
        <div className={`${supplierCardClass} space-y-4 border-orange-200`}>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              {form.id ? "编辑供货商" : "新增供货商"}
            </h3>
            <button
              type="button"
              aria-label="关闭编辑"
              disabled={save.isPending}
              onClick={() => setEditing(false)}
              className="p-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <fieldset disabled={save.isPending} className="min-w-0 space-y-4">
            <label className="block text-xs font-medium">
              姓名 / 名称 <span className="text-orange-500">*</span>
              <input
                required
                maxLength={100}
                value={form.name}
                onChange={event =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="输入供货商姓名或名称"
                className={`${supplierInputClass} mt-2`}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={event =>
                  setForm({ ...form, active: event.target.checked })
                }
                className="accent-orange-500"
              />
              启用供货商（停用后员工不可继续操作）
            </label>
            <div>
              <p className="mb-2 text-xs font-medium">
                选择精选系列 <span className="text-orange-500">*</span>
              </p>
              <div className="space-y-2">
                {catalog.data?.series.map(series => (
                  <label
                    key={series.key}
                    className="flex items-start gap-2 rounded-xl bg-gray-50 p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.seriesKeys.includes(series.key)}
                      onChange={() =>
                        setForm({
                          ...form,
                          seriesKeys: toggleValue(form.seriesKeys, series.key),
                        })
                      }
                      className="mt-1 shrink-0 accent-orange-500"
                    />
                    <span className="min-w-0 break-words">
                      {series.title}
                      <span className="mt-1 block text-xs text-gray-400">
                        {series.brand} · {series.productCount} 款商品
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium">
                搜索真实用户，多选员工{" "}
                <span className="text-orange-500">*</span>
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  maxLength={100}
                  value={searchText}
                  onChange={event => setSearchText(event.target.value)}
                  placeholder="搜索姓名或用户名"
                  className={`${supplierInputClass} pl-9`}
                />
              </div>
              <p className="my-2 text-xs text-gray-400">
                已选 {form.userIds.length} 人；仅绑定真实注册账户。
              </p>
              {users.error && (
                <SupplierNotice error message={users.error.message} />
              )}
              {users.isFetching && (
                <p role="status" className="py-2 text-xs text-gray-400">
                  正在搜索用户…
                </p>
              )}
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {memberOptions.map(member => (
                  <label
                    key={member.id}
                    className="flex items-start gap-2 rounded-xl border border-gray-100 p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.userIds.includes(member.id)}
                      onChange={() => {
                        setKnownMembers(previous =>
                          Array.from(
                            new Map(
                              [...previous, member].map(item => [item.id, item])
                            ).values()
                          )
                        );
                        setForm({
                          ...form,
                          userIds: toggleValue(form.userIds, member.id),
                        });
                      }}
                      className="mt-1 shrink-0 accent-orange-500"
                    />
                    <span className="min-w-0 break-words">
                      {member.name || member.username}
                      <span className="block text-xs text-gray-400">
                        @{member.username} · ID {member.id}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {keyword && !users.isFetching && users.data?.length === 0 && (
                <p className="py-3 text-xs text-gray-400">
                  未找到匹配用户，请调整关键词。
                </p>
              )}
            </div>
          </fieldset>
          {formError && <SupplierNotice error message={formError} />}
          <button
            type="button"
            onClick={submit}
            disabled={save.isPending || !catalog.data}
            className={`${supplierButtonClass} w-full`}
          >
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {save.isPending ? "保存中…" : "确认保存设置"}
          </button>
        </div>
      )}
      {historySupplier && (
        <div className={`${supplierCardClass} space-y-3 border-orange-200`}>
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 break-words font-semibold">
              {historySupplier.name} · 历史订单归属审核
            </h3>
            <button
              type="button"
              aria-label="关闭历史订单"
              disabled={assign.isPending}
              onClick={() => setHistorySupplier(null)}
              className="shrink-0 p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <SupplierNotice message="旧订单需确认归属，取消订单无销售额。请核对订单号、商品和创建时间，精确勾选属于该供货商的订单；未勾选的订单不会导入。" />
          {history.error && (
            <SupplierNotice error message={history.error.message} />
          )}
          {history.isLoading && (
            <p role="status" className="text-sm text-gray-400">
              正在加载历史订单…
            </p>
          )}
          {history.data && (
            <>
              <p className="text-xs text-gray-500">
                待确认归属 {history.data.unresolvedCount} 笔 · 当前候选{" "}
                {history.data.candidates.length} 笔 · 已选 {historyIds.length}{" "}
                笔
              </p>
              <div className="max-h-[440px] space-y-2 overflow-y-auto">
                {history.data.candidates.map(order => (
                  <label
                    key={order.id}
                    className="flex items-start gap-2 rounded-xl border border-gray-100 p-3"
                  >
                    <input
                      type="checkbox"
                      disabled={assign.isPending}
                      checked={historyIds.includes(order.id)}
                      onChange={() =>
                        setHistoryIds(toggleValue(historyIds, order.id))
                      }
                      className="mt-1 shrink-0 accent-orange-500"
                    />
                    <span className="min-w-0 flex-1 space-y-1 text-xs">
                      <span className="block break-all font-semibold">
                        {order.orderNo}
                      </span>
                      <span className="block break-words text-gray-500">
                        {order.productNames}
                      </span>
                      <span className="block break-words text-gray-400">
                        {order.createdAt} · {order.status} · ¥{order.totalPrice}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {history.data.candidates.length === 0 && (
                <p className="py-4 text-center text-sm text-gray-400">
                  暂无需要确认的历史订单。
                </p>
              )}
            </>
          )}
          {formError && <SupplierNotice error message={formError} />}
          <button
            type="button"
            disabled={assign.isPending || historyIds.length === 0}
            onClick={() => {
              if (assign.isPending) return;
              setFormError("");
              assign.mutate({
                supplierId: historySupplier.id,
                orderIds: historyIds,
              });
            }}
            className={`${supplierButtonClass} w-full`}
          >
            {assign.isPending
              ? "导入中…"
              : `确认归属并导入 ${historyIds.length} 笔`}
          </button>
        </div>
      )}
    </section>
  );
}
