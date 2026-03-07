/**
 * QrCodeManager.tsx - 意见本二维码管理
 * 路由：/ledger/:id/qrcodes
 * 功能：
 *   - 选择分店（一级分类）
 *   - 展示该分店下所有桌号（二级分类）
 *   - 每个桌号生成一个带标注的二维码（Canvas 绘制：二维码 + 店名 + 桌号）
 *   - 支持单张下载 / 全部下载（zip）
 */
import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Download, QrCode, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import QRCode from "qrcode";

// 生成带标注的二维码 canvas（店名 + 桌号 + 二维码）
async function generateQrCanvas(
  url: string,
  storeName: string,
  tableName: string
): Promise<HTMLCanvasElement> {
  const SIZE = 320;
  const HEADER = 52;
  const FOOTER = 44;
  const PADDING = 16;
  const QR_SIZE = SIZE - PADDING * 2;

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE + HEADER + FOOTER;
  const ctx = canvas.getContext("2d")!;

  // 背景
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 顶部红色区域
  ctx.fillStyle = "#D32F2F";
  ctx.fillRect(0, 0, SIZE, HEADER);

  // 店名
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(storeName, SIZE / 2, 22, SIZE - 20);

  // 桌号
  ctx.font = "bold 20px sans-serif";
  ctx.fillText(tableName, SIZE / 2, 44, SIZE - 20);

  // 二维码
  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, url, {
    width: QR_SIZE,
    margin: 1,
    color: { dark: "#1a1a1a", light: "#ffffff" },
  });
  ctx.drawImage(qrCanvas, PADDING, HEADER, QR_SIZE, QR_SIZE);

  // 底部提示文字
  ctx.fillStyle = "#888888";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("扫码提意见，享95折优惠", SIZE / 2, SIZE + HEADER + 26, SIZE - 20);

  // 边框
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, SIZE - 1, SIZE + HEADER + FOOTER - 1);

  return canvas;
}

// 下载单张
function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export default function QrCodeManager() {
  const params = useParams<{ id: string }>();
  const ledgerId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();

  // 分店列表（一级分类）
  const { data: branches, isLoading: branchLoading } = trpc.opinionBook.getBranches.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0 }
  );

  // 账本信息
  const { data: ledgerData } = trpc.ledger.getLedger.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0 }
  );

  // 选中的分店
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [showBranchPicker, setShowBranchPicker] = useState(false);

  // 桌号（二级分类）
  const { data: tables, isLoading: tableLoading } = trpc.ledger.getCategories.useQuery(
    { ledgerId, parentId: selectedBranchId ?? undefined },
    { enabled: selectedBranchId !== null }
  );

  // 已生成的二维码 canvas 缓存
  const [qrCanvases, setQrCanvases] = useState<Map<number, HTMLCanvasElement>>(new Map());
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const selectedBranch = branches?.find(b => b.id === selectedBranchId);
  const storeName = ledgerData?.name || "好友记";
  const baseUrl = window.location.origin;

  // 自动生成所有桌号的二维码
  useEffect(() => {
    if (!tables || tables.length === 0) {
      setQrCanvases(new Map());
      return;
    }
    let cancelled = false;
    setGenerating(true);
    const generate = async () => {
      const map = new Map<number, HTMLCanvasElement>();
      for (const table of tables) {
        if (cancelled) break;
        const url = `${baseUrl}/feedback/${ledgerId}/${table.id}`;
        const branchName = selectedBranch?.name || "";
        const label = branchName ? `${branchName} · ${table.name}` : table.name;
        try {
          const canvas = await generateQrCanvas(url, storeName, label);
          map.set(table.id, canvas);
        } catch (e) {
          console.error("QR gen error", e);
        }
      }
      if (!cancelled) {
        setQrCanvases(new Map(map));
        setGenerating(false);
      }
    };
    generate();
    return () => { cancelled = true; };
  }, [tables, storeName, selectedBranch, ledgerId, baseUrl]);

  // 批量下载（逐个触发，间隔 150ms 避免浏览器拦截）
  const handleDownloadAll = async () => {
    if (qrCanvases.size === 0) return;
    setDownloading(true);
    const entries = Array.from(qrCanvases.entries());
    for (let i = 0; i < entries.length; i++) {
      const [tableId, canvas] = entries[i];
      const table = tables?.find(t => t.id === tableId);
      const branchName = selectedBranch?.name || "分店";
      const filename = `${storeName}-${branchName}-${table?.name || tableId}.png`;
      downloadCanvas(canvas, filename);
      if (i < entries.length - 1) {
        await new Promise(r => setTimeout(r, 150));
      }
    }
    setDownloading(false);
    toast.success(`已下载 ${entries.length} 张二维码`);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      {/* 顶部导航 */}
      <div className="bg-[#D32F2F] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="p-1 -ml-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="font-semibold text-base leading-tight">二维码管理</h1>
          <p className="text-white/70 text-xs">{storeName}</p>
        </div>
        <QrCode className="w-5 h-5 opacity-60" />
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 pb-10 space-y-4">

        {/* 选择分店 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">选择分店</p>
          {branchLoading ? (
            <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
          ) : !branches || branches.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-gray-400">暂无分店，请先在"分店管理"中添加分店</p>
              <button
                className="mt-2 text-xs text-[#D32F2F] underline"
                onClick={() => setLocation(`/ledger/${ledgerId}/categories`)}
              >
                前往分店管理
              </button>
            </div>
          ) : (
            <div className="relative">
              <button
                className="w-full flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
                onClick={() => setShowBranchPicker(v => !v)}
              >
                <span className={selectedBranch ? "text-gray-800 font-medium" : "text-gray-400"}>
                  {selectedBranch ? selectedBranch.name : "请选择分店"}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showBranchPicker ? "rotate-180" : ""}`} />
              </button>
              {showBranchPicker && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                  {branches.map(b => (
                    <button
                      key={b.id}
                      className={`w-full text-left px-4 py-3 text-sm border-b border-gray-50 last:border-0 ${
                        selectedBranchId === b.id ? "bg-red-50 text-[#D32F2F] font-medium" : "text-gray-700 active:bg-gray-50"
                      }`}
                      onClick={() => {
                        setSelectedBranchId(b.id);
                        setShowBranchPicker(false);
                      }}
                    >
                      {b.name}
                      <span className="ml-2 text-xs text-gray-400">{b.entry_count} 条意见</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 桌号列表 + 二维码 */}
        {selectedBranchId !== null && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {selectedBranch?.name} · 桌号二维码
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {tableLoading ? "加载中..." : generating ? "生成中..." : `共 ${tables?.length || 0} 张`}
                </p>
              </div>
              {!generating && qrCanvases.size > 0 && (
                <Button
                  size="sm"
                  className="bg-[#D32F2F] hover:bg-red-700 text-white rounded-xl h-8 px-3 text-xs gap-1"
                  onClick={handleDownloadAll}
                  disabled={downloading}
                >
                  <Download className="w-3.5 h-3.5" />
                  {downloading ? "下载中..." : "全部下载"}
                </Button>
              )}
            </div>

            {tableLoading || generating ? (
              <div className="p-6 text-center">
                <div className="w-8 h-8 border-2 border-[#D32F2F] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-sm text-gray-400">{generating ? "正在生成二维码..." : "加载桌号中..."}</p>
              </div>
            ) : !tables || tables.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-gray-400">该分店暂无桌号</p>
                <p className="text-xs text-gray-300 mt-1">请在"分店管理"中为该分店添加二级分类（桌号）</p>
                <button
                  className="mt-3 text-xs text-[#D32F2F] underline"
                  onClick={() => setLocation(`/ledger/${ledgerId}/categories`)}
                >
                  前往分店管理
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 p-4">
                {tables.map(table => {
                  const canvas = qrCanvases.get(table.id);
                  const branchName = selectedBranch?.name || "";
                  const filename = `${storeName}-${branchName}-${table.name}.png`;
                  return (
                    <div key={table.id} className="flex flex-col items-center gap-2">
                      {/* 二维码预览 */}
                      <div className="w-full border border-gray-100 rounded-xl overflow-hidden bg-white">
                        {canvas ? (
                          <img
                            src={canvas.toDataURL("image/png")}
                            alt={table.name}
                            className="w-full"
                          />
                        ) : (
                          <div className="aspect-square flex items-center justify-center bg-gray-50">
                            <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                      </div>
                      {/* 下载按钮 */}
                      {canvas && (
                        <button
                          className="w-full py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600 flex items-center justify-center gap-1 active:bg-gray-100"
                          onClick={() => downloadCanvas(canvas, filename)}
                        >
                          <Download className="w-3 h-3" />
                          下载
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 使用说明 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">使用说明</p>
          <ul className="space-y-1.5 text-xs text-gray-400 leading-relaxed">
            <li>· 每张二维码对应一个桌号，扫码后直接进入该桌的意见提交页</li>
            <li>· 二维码图片包含店名和桌号标注，下载后不会混淆</li>
            <li>· 顾客提交意见后，支付页面会显示分店、桌号和扫码时间，方便核对</li>
            <li>· 如需添加桌号，请前往"分店管理"在对应分店下添加二级分类</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
