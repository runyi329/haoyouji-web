/**
 * 牙伴齿科管理 - 库存工作台（入口页）
 * 路由：/yaban/inventory
 * 牙伴蓝青色系，移动端优先
 */
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";
import {
  ChevronLeft,
  ScanLine,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  PackageSearch,
  AlertTriangle,
  Clock,
  CircleAlert,
  ClipboardList,
  Loader2,
} from "lucide-react";

const BLUE_GRAD = "linear-gradient(135deg, #2196C8 0%, #4DB8E8 100%)";

export default function YabanInventory() {
  const [, navigate] = useLocation();
  const { current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const dash = trpc.yabanInventory.dashboard.useQuery();
  const d = dash.data;

  const lowCount = d?.lowStock?.length || 0;
  const nearCount = d?.nearExpiry?.length || 0;
  const expiredCount = d?.expired?.length || 0;

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-10">

      {/* 顶部栏 */}
      <div className="text-white sticky top-0 z-20" style={{ background: BLUE_GRAD }}>
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate("/yaban")} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold leading-tight">库存管理</span>
            {clinicName && <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">所属：{clinicName}</span>}
          </div>
          <button onClick={() => navigate("/yaban/inventory/logs")} className="p-1">
            <ClipboardList className="w-5 h-5" />
          </button>
        </div>

        {/* 概览数据 */}
        <div className="px-4 pb-5 pt-1">
          <div className="flex items-end gap-6">
            <div>
              <div className="text-3xl font-bold leading-none">{d?.materialCount ?? "--"}</div>
              <div className="text-xs text-white/80 mt-1">在用物品种类</div>
            </div>
            <div>
              <div className="text-3xl font-bold leading-none">{d?.totalQty ?? "--"}</div>
              <div className="text-xs text-white/80 mt-1">库存总件数</div>
            </div>
          </div>
        </div>
      </div>

      {/* 主操作区：扫码 / 入库 / 出库 */}
      <div className="px-4 pt-4">
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => navigate("/yaban/inventory/inbound?scan=1")}
            className="bg-white rounded shadow-sm py-4 flex flex-col items-center active:scale-95 transition"
          >
            <div className="w-11 h-11 rounded-md flex items-center justify-center mb-2" style={{ background: BLUE_GRAD }}>
              <ScanLine className="w-6 h-6 text-white" />
            </div>
            <span className="text-[13px] font-medium text-gray-700">扫码入库</span>
          </button>
          <button
            onClick={() => navigate("/yaban/inventory/inbound")}
            className="bg-white rounded shadow-sm py-4 flex flex-col items-center active:scale-95 transition"
          >
            <div className="w-11 h-11 rounded-md bg-green-50 flex items-center justify-center mb-2">
              <ArrowDownToLine className="w-6 h-6 text-green-500" />
            </div>
            <span className="text-[13px] font-medium text-gray-700">入库</span>
          </button>
          <button
            onClick={() => navigate("/yaban/inventory/outbound")}
            className="bg-white rounded shadow-sm py-4 flex flex-col items-center active:scale-95 transition"
          >
            <div className="w-11 h-11 rounded-md bg-orange-50 flex items-center justify-center mb-2">
              <ArrowUpFromLine className="w-6 h-6 text-orange-500" />
            </div>
            <span className="text-[13px] font-medium text-gray-700">领用出库</span>
          </button>
        </div>
      </div>

      {/* 库存一览入口 */}
      <div className="px-4 pt-3">
        <button
          onClick={() => navigate("/yaban/inventory/list")}
          className="w-full bg-white rounded shadow-sm p-4 flex items-center justify-between active:scale-[0.99] transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-sky-50 flex items-center justify-center">
              <Boxes className="w-6 h-6 text-sky-500" />
            </div>
            <div className="text-left">
              <div className="text-sm font-bold text-gray-800">库存一览</div>
              <div className="text-xs text-gray-400 mt-0.5">查看所有耗材、批次与效期</div>
            </div>
          </div>
          <PackageSearch className="w-5 h-5 text-gray-300" />
        </button>
      </div>

      {/* 预警区 */}
      <div className="px-4 pt-4">
        <div className="text-sm font-bold text-gray-700 mb-2 px-1">库存预警</div>
        {dash.isLoading ? (
          <div className="flex justify-center py-10 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => navigate("/yaban/inventory/list?filter=low")}
              className="bg-white rounded shadow-sm py-4 flex flex-col items-center"
            >
              <AlertTriangle className={`w-6 h-6 mb-1.5 ${lowCount ? "text-amber-500" : "text-gray-300"}`} />
              <span className={`text-xl font-bold ${lowCount ? "text-amber-600" : "text-gray-300"}`}>{lowCount}</span>
              <span className="text-[11px] text-gray-400 mt-0.5">库存不足</span>
            </button>
            <button
              onClick={() => navigate("/yaban/inventory/list?filter=near")}
              className="bg-white rounded shadow-sm py-4 flex flex-col items-center"
            >
              <Clock className={`w-6 h-6 mb-1.5 ${nearCount ? "text-orange-500" : "text-gray-300"}`} />
              <span className={`text-xl font-bold ${nearCount ? "text-orange-600" : "text-gray-300"}`}>{nearCount}</span>
              <span className="text-[11px] text-gray-400 mt-0.5">近效期</span>
            </button>
            <button
              onClick={() => navigate("/yaban/inventory/list?filter=expired")}
              className="bg-white rounded shadow-sm py-4 flex flex-col items-center"
            >
              <CircleAlert className={`w-6 h-6 mb-1.5 ${expiredCount ? "text-red-500" : "text-gray-300"}`} />
              <span className={`text-xl font-bold ${expiredCount ? "text-red-600" : "text-gray-300"}`}>{expiredCount}</span>
              <span className="text-[11px] text-gray-400 mt-0.5">已过期</span>
            </button>
          </div>
        )}
      </div>

      {/* 近效期/过期明细清单 */}
      {!dash.isLoading && (nearCount > 0 || expiredCount > 0) && (
        <div className="px-4 pt-4">
          <div className="bg-white rounded shadow-sm p-4 space-y-3">
            {(d?.expired || []).slice(0, 5).map((it: any) => (
              <div key={`e${it.batchId}`} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500 font-medium">已过期</span>
                  <span className="text-sm text-gray-700 truncate">{it.name}</span>
                </div>
                <span className="text-xs text-gray-400 shrink-0 ml-2">{it.expiryDate} · {it.qty}{it.unit}</span>
              </div>
            ))}
            {(d?.nearExpiry || []).slice(0, 5).map((it: any) => (
              <div key={`n${it.batchId}`} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-500 font-medium">近效期</span>
                  <span className="text-sm text-gray-700 truncate">{it.name}</span>
                </div>
                <span className="text-xs text-gray-400 shrink-0 ml-2">{it.expiryDate} · {it.qty}{it.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 库存充足时的低库存清单 */}
      {!dash.isLoading && lowCount > 0 && (
        <div className="px-4 pt-3">
          <div className="bg-white rounded shadow-sm p-4 space-y-3">
            <div className="text-xs font-bold text-gray-500">需补货</div>
            {(d?.lowStock || []).slice(0, 6).map((it: any) => (
              <div key={`l${it.id}`} className="flex items-center justify-between">
                <span className="text-sm text-gray-700 truncate">{it.name}</span>
                <span className="text-xs shrink-0 ml-2">
                  <span className="text-red-500 font-medium">{it.stock}</span>
                  <span className="text-gray-400"> / 安全{it.safetyStock}{it.unit}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
