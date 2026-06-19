/**
 * 牙伴齿科管理 - 出入库流水
 * 路由：/yaban/inventory/logs
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";
import { ChevronLeft, Loader2, ArrowDownToLine, ArrowUpFromLine, ScrollText } from "lucide-react";

const BLUE_GRAD = "linear-gradient(135deg, #2196C8 0%, #4DB8E8 100%)";

const TABS = [
  { key: "", label: "全部" },
  { key: "in", label: "入库" },
  { key: "out", label: "出库" },
];

const BIZ_LABEL: Record<string, string> = {
  purchase: "采购入库", return: "退货", adjust: "盘点调整",
  use: "诊疗领用", scrap: "报损",
};

export default function YabanInventoryLogs() {
  const [, navigate] = useLocation();
  const { current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const [dir, setDir] = useState<string>("");

  const logsQuery = trpc.yabanInventory.logs.useQuery({
    direction: dir ? (dir as "in" | "out") : undefined,
    pageSize: 100,
  });
  const items = logsQuery.data?.items || [];

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-10">
      <div className="text-white sticky top-0 z-20" style={{ background: BLUE_GRAD }}>
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate("/yaban/inventory")} className="p-1"><ChevronLeft className="w-6 h-6" /></button>
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold leading-tight">出入库流水</span>
            {clinicName && <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">所属：{clinicName}</span>}
          </div>
          <div className="w-8" />
        </div>
        <div className="px-4 pb-3 flex gap-2">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setDir(t.key)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium ${dir === t.key ? "bg-white text-sky-600" : "bg-white/20 text-white"}`}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">
        {logsQuery.isLoading ? (
          <div className="flex justify-center py-16 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <ScrollText className="w-12 h-12 mb-3" /><p className="text-sm">暂无出入库记录</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((l) => {
              const isIn = l.direction === "in";
              return (
                <div key={l.id} className="bg-white rounded-2xl shadow-sm p-3.5 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isIn ? "bg-green-50" : "bg-orange-50"}`}>
                    {isIn ? <ArrowDownToLine className="w-5 h-5 text-green-500" /> : <ArrowUpFromLine className="w-5 h-5 text-orange-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800 truncate">{l.materialName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">{BIZ_LABEL[l.bizType] || l.bizType}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate">
                      {l.createdAt}
                      {l.receiverName ? ` · 领用 ${l.receiverName}` : ""}
                      {l.chair ? ` · ${l.chair}` : ""}
                      {l.supplier ? ` · ${l.supplier}` : ""}
                      {l.operatorName ? ` · 经手 ${l.operatorName}` : ""}
                    </div>
                  </div>
                  <div className={`text-right shrink-0 font-bold ${isIn ? "text-green-600" : "text-orange-600"}`}>
                    {isIn ? "+" : "-"}{l.qty}<span className="text-xs text-gray-400 ml-0.5 font-normal">{l.unit}</span>
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
