/**
 * 牙伴 - 今日收费列表页
 * 路由：/yaban/charge?date=YYYY-MM-DD
 * 风格：与牙伴网其他页面一致（蓝色渐变顶栏 + 白底列表）
 */
import { useLocation, useSearch } from "wouter";
import { ChevronLeft, ChevronRight, Receipt } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = toDateStr(new Date());
  const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const weekday = WEEK[d.getDay()];
  const suffix = dateStr === today ? "（今天）" : "";
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekday}${suffix}`;
}

function money(n: number): string {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  paid:      { label: "已收费",   cls: "bg-green-50 text-green-600" },
  partial:   { label: "部分收款", cls: "bg-amber-50 text-amber-600" },
  draft:     { label: "草稿",     cls: "bg-gray-100 text-gray-400" },
  refunded:  { label: "已退款",   cls: "bg-red-50 text-red-500" },
  cancelled: { label: "已取消",   cls: "bg-gray-100 text-gray-400" },
};

export default function YabanTodayCharges() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const today = toDateStr(new Date());
  const dateStr = params.get("date") || today;

  const { current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";

  const { data, isLoading } = trpc.yabanComm.todayCharges.useQuery(
    { date: dateStr },
    { keepPreviousData: true }
  );

  const list = data?.list || [];
  const totalActual = list.reduce((s, r) => s + r.actualAmount, 0);

  const prevDay = () => {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() - 1);
    navigate(`/yaban/charge?date=${toDateStr(d)}`);
  };
  const nextDay = () => {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + 1);
    navigate(`/yaban/charge?date=${toDateStr(d)}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* 顶部导航栏 - 蓝色渐变（与牙伴网统一） */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-sky-500 to-sky-400 text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate("/yaban")} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center">
            <h1 className="text-lg font-semibold leading-tight">今日收费</h1>
            {clinicName && (
              <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">
                所属：{clinicName}
              </span>
            )}
          </div>
          <div className="w-8" />
        </div>
      </div>

      {/* 日期切换栏 */}
      <div className="bg-white border-b border-gray-100 sticky top-[52px] z-40">
        <div className="flex items-center justify-between px-4 py-2.5">
          <button
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200"
            onPointerDown={prevDay}
          >
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          </button>
          <span className="text-sm font-medium text-gray-700">
            {formatDateLabel(dateStr)}
          </span>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200"
            onPointerDown={nextDay}
          >
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* 汇总统计卡 */}
      {!isLoading && list.length > 0 && (
        <div className="px-4 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded shadow-sm p-3 flex flex-col items-center">
              <span className="text-[11px] text-gray-400 mb-0.5">收费笔数</span>
              <span className="text-xl font-bold text-sky-600">{list.length}</span>
            </div>
            <div className="bg-white rounded shadow-sm p-3 flex flex-col items-center">
              <span className="text-[11px] text-gray-400 mb-0.5">实收合计</span>
              <span className="text-xl font-bold text-sky-600">¥{money(totalActual)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 列表内容 */}
      <div className="flex-1 overflow-y-auto mt-3">
        {isLoading ? (
          <div className="py-32 text-center text-sm text-gray-400">加载中…</div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="w-24 h-24 rounded-md bg-gray-100 flex items-center justify-center mb-4">
              <Receipt className="w-10 h-10 text-gray-300" />
            </div>
            <p className="text-gray-400 text-sm">当日暂无收费记录</p>
          </div>
        ) : (
          <div className="bg-white divide-y divide-gray-100">
            {list.map((item) => {
              const st = STATUS_MAP[item.status] || { label: item.statusLabel, cls: "bg-gray-100 text-gray-500" };
              return (
                <button
                  key={item.id}
                  className="w-full bg-white px-4 py-4 text-left active:bg-gray-50 transition-colors"
                  onClick={() =>
                    item.customerId
                      ? navigate(`/yaban/patient/${item.customerId}/charge`)
                      : undefined
                  }
                >
                  {/* 第一行：顾客名 + 状态 */}
                  <div className="flex items-start justify-between mb-1.5">
                    <span className="text-sm font-bold text-gray-900">
                      {item.customerName}
                    </span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${st.cls}`}>
                      {st.label}
                    </span>
                  </div>
                  {/* 第二行：单号 + 医生 */}
                  {(item.chargeNo || item.doctor) && (
                    <p className="text-sm text-gray-500 mb-1.5">
                      {item.chargeNo && <span>单号：{item.chargeNo}</span>}
                      {item.chargeNo && item.doctor && <span className="mx-2 text-gray-300">|</span>}
                      {item.doctor && <span>医生：{item.doctor}</span>}
                    </p>
                  )}
                  {/* 第三行：金额 */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">
                      应收 <span className="text-gray-700 font-medium">¥{money(item.receivable)}</span>
                    </span>
                    <span className="text-base font-bold text-sky-600">
                      ¥{money(item.actualAmount)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
