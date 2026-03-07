/**
 * QrCodeManager.tsx - 意见本二维码管理
 * 路由：/ledger/:id/qrcodes
 *
 * 数据加载方式 100% 复制自 LedgerCategories.tsx（分店管理页）：
 *   trpc.ledger.getCategories.useQuery({ ledgerId: Number(id) })
 *   然后前端过滤 parentId===null && !isDefault 得到分店列表
 */
import { useState, useCallback, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Download, QrCode, RefreshCw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import QRCode from "qrcode";

/* ─── 二维码绘制工具 ─────────────────────────────────────────── */

async function generateQrCanvas(
  url: string,
  storeName: string,
  branchName: string,
  tableLabel: string
): Promise<HTMLCanvasElement> {
  const SIZE = 320;
  const HEADER = 64;
  const FOOTER = 52;
  const PADDING = 12;
  const QR_SIZE = SIZE - PADDING * 2;

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE + HEADER + FOOTER;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 顶部红色区域
  ctx.fillStyle = "#D32F2F";
  ctx.fillRect(0, 0, SIZE, HEADER);

  ctx.fillStyle = "rgba(255,255,255,0.80)";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${storeName} · ${branchName}`, SIZE / 2, 22, SIZE - 20);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(tableLabel, SIZE / 2, 52, SIZE - 20);

  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, url, {
    width: QR_SIZE,
    margin: 1,
    color: { dark: "#1a1a1a", light: "#ffffff" },
  });
  ctx.drawImage(qrCanvas, PADDING, HEADER, QR_SIZE, QR_SIZE);

  ctx.fillStyle = "#555555";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("扫码提意见，享95折优惠", SIZE / 2, SIZE + HEADER + 30, SIZE - 20);

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, SIZE - 1, SIZE + HEADER + FOOTER - 1);

  return canvas;
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function tableLabel(index: number): string {
  return String(index).padStart(2, "0") + "桌";
}

/* ─── 组件 ───────────────────────────────────────────────────── */

export default function QrCodeManager() {
  const { id } = useParams<{ id: string }>();
  const ledgerId = Number(id);
  const [, setLocation] = useLocation();

  /* ── 数据加载：与 LedgerCategories.tsx 完全一致 ─────────────── */

  // 账本信息（参数名用 id，与分店管理页一致）
  const { data: ledgerInfo } = trpc.ledger.getLedger.useQuery(
    { id: ledgerId },
    { enabled: ledgerId > 0 }
  );

  // 分类列表（不传 type / parentId，与分店管理页一致）
  const { data: categoriesData, isLoading: catLoading } = trpc.ledger.getCategories.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0 }
  );

  // 前端过滤：parentId===null 且不是预设分类（isDefault）→ 分店
  const branches = useMemo(() => {
    if (!categoriesData) return [];
    return (categoriesData as any[]).filter(
      (c) => c.parentId === null && !c.isDefault && c.ledgerId === ledgerId
    );
  }, [categoriesData, ledgerId]);

  const storeName = (ledgerInfo as any)?.name || "好友记";
  const baseUrl = window.location.origin;

  /* ── 状态 ───────────────────────────────────────────────────── */
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [tableCount, setTableCount] = useState("10");
  const [qrCanvases, setQrCanvases] = useState<Map<number, HTMLCanvasElement>>(new Map());
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const selectedBranch = branches.find((b: any) => b.id === selectedBranchId);

  /* ── 生成二维码 ─────────────────────────────────────────────── */
  const handleGenerate = useCallback(async () => {
    if (!selectedBranch) {
      toast.error("请先选择分店");
      return;
    }
    const count = parseInt(tableCount);
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
      const url = `${baseUrl}/feedback/${ledgerId}?branch=${encodeURIComponent(selectedBranch.name)}&table=${encodeURIComponent(label)}`;
      try {
        const canvas = await generateQrCanvas(url, storeName, selectedBranch.name, label);
        map.set(i, canvas);
      } catch (e) {
        console.error("QR error", e);
      }
    }
    setQrCanvases(new Map(map));
    setGenerating(false);
    toast.success(`已生成 ${count} 张二维码`);
  }, [selectedBranch, tableCount, storeName, ledgerId, baseUrl]);

  /* ── 批量下载 ───────────────────────────────────────────────── */
  const handleDownloadAll = async () => {
    if (!selectedBranch || qrCanvases.size === 0) return;
    setDownloading(true);
    const entries = Array.from(qrCanvases.entries());
    for (let i = 0; i < entries.length; i++) {
      const [idx, canvas] = entries[i];
      downloadCanvas(canvas, `${storeName}-${selectedBranch.name}-${tableLabel(idx)}.png`);
      if (i < entries.length - 1) await new Promise((r) => setTimeout(r, 150));
    }
    setDownloading(false);
    toast.success(`已下载 ${entries.length} 张二维码`);
  };

  /* ── 调试信息（开发时可打开） ────────────────────────────────── */
  // console.log("[QrCodeManager] ledgerId:", ledgerId, "catLoading:", catLoading, "categoriesData:", categoriesData, "branches:", branches);

  /* ── 渲染 ───────────────────────────────────────────────────── */
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
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">选择分店</p>
            {catLoading ? (
              <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
            ) : branches.length === 0 ? (
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
                  onClick={() => setShowPicker((v) => !v)}
                >
                  <span className={selectedBranch ? "text-gray-800 font-medium" : "text-gray-400"}>
                    {selectedBranch ? selectedBranch.name : "请选择分店"}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showPicker ? "rotate-180" : ""}`} />
                </button>
                {showPicker && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                    {branches.map((b: any) => (
                      <button
                        key={b.id}
                        className={`w-full text-left px-4 py-3 text-sm border-b border-gray-50 last:border-0 ${
                          selectedBranchId === b.id ? "bg-red-50 text-[#D32F2F] font-medium" : "text-gray-700"
                        }`}
                        onClick={() => {
                          setSelectedBranchId(b.id);
                          setShowPicker(false);
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
                  onChange={(e) => setTableCount(e.target.value)}
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
                将为 {selectedBranch?.name} 生成 01桌 ~ {String(parseInt(tableCount) || 0).padStart(2, "0")}桌，共{" "}
                {parseInt(tableCount) || 0} 张
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
              <div className="p-10 text-center">
                <div className="w-8 h-8 border-2 border-[#D32F2F] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-400">正在生成二维码...</p>
                <p className="text-xs text-gray-300 mt-1">共 {confirmedCount} 张</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 p-4">
                {Array.from({ length: confirmedCount }, (_, i) => i + 1).map((idx) => {
                  const canvas = qrCanvases.get(idx);
                  const label = tableLabel(idx);
                  return (
                    <div key={idx} className="flex flex-col items-center gap-2">
                      <div className="w-full border border-gray-100 rounded-xl overflow-hidden bg-white">
                        {canvas ? (
                          <img src={canvas.toDataURL("image/png")} alt={label} className="w-full" />
                        ) : (
                          <div className="aspect-square flex items-center justify-center bg-gray-50">
                            <div className="w-5 h-5 border-2 border-gray-200 border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                      </div>
                      {canvas && (
                        <button
                          className="w-full py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600 flex items-center justify-center gap-1 active:bg-gray-100"
                          onClick={() =>
                            downloadCanvas(canvas, `${storeName}-${selectedBranch?.name}-${label}.png`)
                          }
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
            <li>· 分店列表来自"分店管理"，如需添加分店请先前往分店管理</li>
            <li>· 选择分店后输入桌号数量，点击"生成"即可批量生成二维码</li>
            <li>· 二维码自动编号：01桌、02桌…，顶部显示店名和桌号</li>
            <li>· 顾客扫码提交意见后，支付页面会显示分店、桌号和扫码时间</li>
            <li>· 二维码永久有效，打印后贴在对应桌位即可长期使用</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
