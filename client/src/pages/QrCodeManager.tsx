/**
 * QrCodeManager.tsx - 意见本二维码管理
 * 路由：/ledger/:id/qrcodes
 * 功能：
 *   - 选择分店（一级分类）
 *   - 输入要生成的桌号数量（如30）
 *   - 自动生成 01桌 ~ 30桌 的带标注二维码（Canvas绘制）
 *   - 支持单张下载 / 全部下载
 *   - 二维码URL格式：/feedback/:ledgerId?branch=分店名&table=01桌
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Download, QrCode, ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import QRCode from "qrcode";

// 生成带标注的二维码 canvas（店名 + 桌号 + 二维码 + 底部说明）
async function generateQrCanvas(
  url: string,
  storeName: string,
  branchName: string,
  tableLabel: string
): Promise<HTMLCanvasElement> {
  const SIZE = 320;
  const HEADER = 60;
  const FOOTER = 48;
  const PADDING = 12;
  const QR_SIZE = SIZE - PADDING * 2;

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE + HEADER + FOOTER;
  const ctx = canvas.getContext("2d")!;

  // 白色背景
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 顶部红色区域
  ctx.fillStyle = "#D32F2F";
  ctx.fillRect(0, 0, SIZE, HEADER);

  // 店名（小字）
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(storeName + (branchName ? ` · ${branchName}` : ""), SIZE / 2, 22, SIZE - 16);

  // 桌号（大字加粗）
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px sans-serif";
  ctx.fillText(tableLabel, SIZE / 2, 50, SIZE - 16);

  // 二维码
  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, url, {
    width: QR_SIZE,
    margin: 1,
    color: { dark: "#1a1a1a", light: "#ffffff" },
  });
  ctx.drawImage(qrCanvas, PADDING, HEADER, QR_SIZE, QR_SIZE);

  // 底部提示文字
  ctx.fillStyle = "#555555";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("扫码提意见，享95折优惠", SIZE / 2, SIZE + HEADER + 28, SIZE - 20);

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

// 生成桌号标签，如 "01桌", "02桌" ... "30桌"
function tableLabel(index: number): string {
  return String(index).padStart(2, "0") + "桌";
}

export default function QrCodeManager() {
  const params = useParams<{ id: string }>();
  const ledgerId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();

  // 账本信息
  const { data: ledgerData } = trpc.ledger.getLedger.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0 }
  );

  // 分店列表（一级分类）
  const { data: branches, isLoading: branchLoading } = trpc.opinionBook.getBranches.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0 }
  );

  // 选中的分店
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [showBranchPicker, setShowBranchPicker] = useState(false);

  // 桌号数量输入
  const [tableCount, setTableCount] = useState<string>("10");
  const [confirmedCount, setConfirmedCount] = useState<number>(0);

  // 已生成的二维码 canvas 缓存
  const [qrCanvases, setQrCanvases] = useState<Map<number, HTMLCanvasElement>>(new Map());
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const selectedBranch = branches?.find(b => b.id === selectedBranchId);
  const storeName = ledgerData?.name || "好友记";
  const baseUrl = window.location.origin;

  // 生成二维码（点击"生成"按钮后触发）
  const handleGenerate = useCallback(async () => {
    const count = parseInt(tableCount);
    if (!selectedBranchId || !selectedBranch) {
      toast.error("请先选择分店");
      return;
    }
    if (isNaN(count) || count < 1 || count > 200) {
      toast.error("请输入1~200之间的数量");
      return;
    }
    setConfirmedCount(count);
    setGenerating(true);
    setQrCanvases(new Map());

    const map = new Map<number, HTMLCanvasElement>();
    for (let i = 1; i <= count; i++) {
      const label = tableLabel(i);
      // URL携带分店名和桌号作为query参数，方便FeedbackPage读取
      const url = `${baseUrl}/feedback/${ledgerId}?branch=${encodeURIComponent(selectedBranch.name)}&table=${encodeURIComponent(label)}`;
      try {
        const canvas = await generateQrCanvas(url, storeName, selectedBranch.name, label);
        map.set(i, canvas);
      } catch (e) {
        console.error("QR gen error", e);
      }
    }
    setQrCanvases(new Map(map));
    setGenerating(false);
    toast.success(`已生成 ${count} 张二维码`);
  }, [selectedBranchId, selectedBranch, tableCount, storeName, ledgerId, baseUrl]);

  // 批量下载（逐个触发，间隔150ms避免浏览器拦截）
  const handleDownloadAll = async () => {
    if (qrCanvases.size === 0) return;
    setDownloading(true);
    const entries = Array.from(qrCanvases.entries());
    for (let i = 0; i < entries.length; i++) {
      const [idx, canvas] = entries[i];
      const filename = `${storeName}-${selectedBranch?.name || "分店"}-${tableLabel(idx)}.png`;
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

        {/* 选择分店 + 输入数量 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
          {/* 选择分店 */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">选择分店</p>
            {branchLoading ? (
              <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
            ) : !branches || branches.length === 0 ? (
              <div className="text-center py-3">
                <p className="text-sm text-gray-400">暂无分店，请先在"分店管理"中添加分店</p>
                <button
                  className="mt-1.5 text-xs text-[#D32F2F] underline"
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
                          setQrCanvases(new Map());
                          setConfirmedCount(0);
                        }}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 输入桌号数量 */}
          {selectedBranchId !== null && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">生成桌号数量</p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={tableCount}
                  onChange={e => setTableCount(e.target.value)}
                  placeholder="输入桌号数量（如30）"
                  className="flex-1 rounded-xl border-gray-200 text-sm"
                />
                <Button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="bg-[#D32F2F] hover:bg-red-700 text-white rounded-xl px-5 text-sm gap-1.5 shrink-0"
                >
                  {generating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      生成中
                    </>
                  ) : (
                    <>
                      <QrCode className="w-4 h-4" />
                      生成
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                将生成 {selectedBranch?.name} · 01桌 ~ {tableCount.padStart ? String(parseInt(tableCount) || 0).padStart(2,"0") : tableCount}桌，共 {parseInt(tableCount) || 0} 张二维码
              </p>
            </div>
          )}
        </div>

        {/* 二维码列表 */}
        {confirmedCount > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {selectedBranch?.name} · 桌号二维码
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {generating ? "生成中..." : `共 ${qrCanvases.size} 张`}
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

            {generating ? (
              <div className="p-8 text-center">
                <div className="w-8 h-8 border-2 border-[#D32F2F] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-400">正在生成二维码，请稍候...</p>
                <p className="text-xs text-gray-300 mt-1">共 {confirmedCount} 张</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 p-4">
                {Array.from({ length: confirmedCount }, (_, i) => i + 1).map(idx => {
                  const canvas = qrCanvases.get(idx);
                  const label = tableLabel(idx);
                  const filename = `${storeName}-${selectedBranch?.name || "分店"}-${label}.png`;
                  return (
                    <div key={idx} className="flex flex-col items-center gap-2">
                      {/* 二维码预览 */}
                      <div className="w-full border border-gray-100 rounded-xl overflow-hidden bg-white">
                        {canvas ? (
                          <img
                            src={canvas.toDataURL("image/png")}
                            alt={label}
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
            <li>· 选择分店后，输入桌号数量，点击"生成"即可批量生成二维码</li>
            <li>· 二维码自动编号：01桌、02桌…，顶部显示店名和桌号，不会混淆</li>
            <li>· 顾客扫码提交意见后，支付页面会显示分店、桌号和扫码时间</li>
            <li>· 二维码永久有效，打印后贴在对应桌位即可长期使用</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
