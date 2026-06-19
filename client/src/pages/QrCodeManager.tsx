/**
 * QrCodeManager.tsx - 意见本二维码管理
 * 路由：/ledger/:id/qrcodes
 *
 * 架构：
 * - 桌号作为二级分类存在数据库（分店 > 桌号），永久不消失
 * - 二维码 URL 格式：/ab/opinion/:ledgerId/:categoryId（categoryId = 桌号分类ID）
 * - 每次进入页面直接从数据库读取桌号，无需重新生成
 */
import { useState, useCallback, useMemo, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Download, QrCode, RefreshCw, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import QRCode from "qrcode";

/* ─── 二维码绘制工具 ─────────────────────────────────────────── */
async function generateQrCanvas(
  url: string,
  storeName: string,
  branchName: string,
  tableName: string
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

  ctx.fillStyle = "#D32F2F";
  ctx.fillRect(0, 0, SIZE, HEADER);

  ctx.fillStyle = "rgba(255,255,255,0.80)";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${storeName} · ${branchName}`, SIZE / 2, 22, SIZE - 20);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(tableName, SIZE / 2, 52, SIZE - 20);

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

/* ─── 组件 ───────────────────────────────────────────────────── */
export default function QrCodeManager() {
  const { id } = useParams<{ id: string }>();
  const ledgerId = Number(id);
  const [, setLocation] = useLocation();

  /* ── 数据加载 ─────────────────────────────────────────────── */
  const { data: ledgerInfo } = trpc.ledger.getLedger.useQuery(
    { id: ledgerId },
    { enabled: ledgerId > 0 }
  );
  const { data: categoriesData, isLoading: catLoading, refetch: refetchCategories } = trpc.ledger.getCategories.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0 }
  );

  // 一级分类 = 分店
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
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // 二维码 canvas 缓存（categoryId -> canvas）
  const [qrCanvases, setQrCanvases] = useState<Map<number, HTMLCanvasElement>>(new Map());
  const [renderingQrs, setRenderingQrs] = useState(false);

  const selectedBranch = branches.find((b: any) => b.id === selectedBranchId);

  // 当前分店下的桌号（二级分类）
  const tables = useMemo(() => {
    if (!categoriesData || selectedBranchId === null) return [];
    return (categoriesData as any[])
      .filter((c) => c.parentId === selectedBranchId)
      .map((c) => ({ categoryId: c.id, name: c.name }))
      .sort((a, b) => {
        const na = parseInt(a.name); const nb = parseInt(b.name);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.name.localeCompare(b.name);
      });
  }, [categoriesData, selectedBranchId]);

  /* ── 渲染二维码（当桌号列表变化时） ─────────────────────────── */
  const renderQrCodes = useCallback(async (
    tableList: Array<{ categoryId: number; name: string }>,
    branchName: string
  ) => {
    if (tableList.length === 0) return;
    setRenderingQrs(true);
    const map = new Map<number, HTMLCanvasElement>();
    for (const table of tableList) {
      const url = `${baseUrl}/ab/opinion/${ledgerId}/${table.categoryId}`;
      try {
        const canvas = await generateQrCanvas(url, storeName, branchName, table.name);
        map.set(table.categoryId, canvas);
      } catch (e) {
        console.error("QR render error", e);
      }
    }
    setQrCanvases(new Map(map));
    setRenderingQrs(false);
  }, [baseUrl, ledgerId, storeName]);

  /* ── 生成桌号（写入数据库 + 渲染二维码）─────────────────────── */
  const ensureTablesMutation = trpc.opinionBook.ensureTables.useMutation({
    onSuccess: async (data) => {
      await refetchCategories();
      toast.success(
        data.created > 0
          ? `已新增 ${data.created} 个桌号，共 ${data.tables.length} 张二维码`
          : `桌号已存在，共 ${data.tables.length} 张二维码`
      );
      if (selectedBranch) {
        await renderQrCodes(data.tables, selectedBranch.name);
      }
      setGenerating(false);
    },
    onError: (e) => {
      toast.error(e.message || "生成失败");
      setGenerating(false);
    },
  });

  const handleGenerate = useCallback(async () => {
    if (!selectedBranch) { toast.error("请先选择分店"); return; }
    const count = parseInt(tableCount);
    if (isNaN(count) || count < 1 || count > 200) { toast.error("请输入1~200之间的数量"); return; }
    setGenerating(true);
    ensureTablesMutation.mutate({
      ledgerId,
      branchId: selectedBranch.id,
      tableCount: count,
    });
  }, [selectedBranch, tableCount, ledgerId, ensureTablesMutation]);

  /* ── 切换分店时自动渲染已有桌号的二维码 ─────────────────────── */
  const handleSelectBranch = useCallback(async (branch: any) => {
    setSelectedBranchId(branch.id);
    setShowPicker(false);
    setQrCanvases(new Map());
    // 从 categoriesData 中读取该分店的桌号
    if (categoriesData) {
      const branchTables = (categoriesData as any[])
        .filter((c) => c.parentId === branch.id)
        .map((c) => ({ categoryId: c.id, name: c.name }))
        .sort((a: any, b: any) => {
          const na = parseInt(a.name); const nb = parseInt(b.name);
          if (!isNaN(na) && !isNaN(nb)) return na - nb;
          return a.name.localeCompare(b.name);
        });
      if (branchTables.length > 0) {
        await renderQrCodes(branchTables, branch.name);
      }
    }
  }, [categoriesData, renderQrCodes]);

  /* ── 批量下载 ───────────────────────────────────────────────── */
  const handleDownloadAll = async () => {
    if (!selectedBranch || qrCanvases.size === 0) return;
    setDownloading(true);
    const entries = Array.from(qrCanvases.entries());
    for (let i = 0; i < entries.length; i++) {
      const [catId, canvas] = entries[i];
      const table = tables.find(t => t.categoryId === catId);
      downloadCanvas(canvas, `${storeName}-${selectedBranch.name}-${table?.name || catId}.png`);
      if (i < entries.length - 1) await new Promise((r) => setTimeout(r, 150));
    }
    setDownloading(false);
    toast.success(`已下载 ${entries.length} 张二维码`);
  };

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

        {/* 说明卡片 */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
          <p className="text-xs text-blue-700 leading-relaxed">
            <span className="font-semibold">使用说明：</span>
            选择分店 → 输入桌号数量 → 点击生成。桌号会永久保存在数据库，下次进入直接展示，无需重新生成。
          </p>
        </div>

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
                        onClick={() => handleSelectBranch(b)}
                      >
                        {b.name}
                        {(() => {
                          const cnt = (categoriesData as any[] || []).filter(c => c.parentId === b.id).length;
                          return cnt > 0 ? <span className="ml-2 text-xs text-gray-400">已有 {cnt} 个桌号</span> : null;
                        })()}
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
              <p className="text-xs font-semibold text-gray-500 mb-2">
                生成桌号数量
                {tables.length > 0 && (
                  <span className="ml-2 font-normal text-gray-400">（当前已有 {tables.length} 个桌号）</span>
                )}
              </p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={tableCount}
                  onChange={(e) => setTableCount(e.target.value)}
                  placeholder="输入桌号总数（如30）"
                  className="flex-1 rounded-xl border-gray-200 text-sm"
                />
                <Button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="bg-[#D32F2F] hover:bg-red-700 text-white rounded-xl px-5 text-sm gap-1.5 shrink-0"
                >
                  {generating ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" />生成中</>
                  ) : (
                    <><Plus className="w-4 h-4" />生成</>
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                将为 {selectedBranch?.name} 生成 01桌 ~ {String(parseInt(tableCount) || 0).padStart(2, "0")}桌，已存在的桌号不会重复创建
              </p>
            </div>
          )}
        </div>

        {/* 二维码列表 */}
        {selectedBranchId !== null && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {selectedBranch?.name} · 桌号二维码
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {renderingQrs
                    ? "渲染中..."
                    : tables.length === 0
                    ? "暂无桌号，请先生成"
                    : `共 ${tables.length} 张 · 数据已保存`}
                </p>
              </div>
              {!renderingQrs && qrCanvases.size > 0 && (
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

            {renderingQrs ? (
              <div className="p-10 text-center">
                <div className="w-8 h-8 border-2 border-[#D32F2F] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-400">正在渲染二维码...</p>
                <p className="text-xs text-gray-300 mt-1">共 {tables.length} 张</p>
              </div>
            ) : tables.length === 0 ? (
              <div className="p-10 text-center text-gray-400">
                <QrCode className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">请输入桌号数量后点击生成</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 p-4">
                {tables.map((table) => {
                  const canvas = qrCanvases.get(table.categoryId);
                  return (
                    <div key={table.categoryId} className="flex flex-col items-center gap-2">
                      <div className="w-full border border-gray-100 rounded-xl overflow-hidden bg-white">
                        {canvas ? (
                          <img src={canvas.toDataURL("image/png")} alt={table.name} className="w-full" />
                        ) : (
                          <div className="aspect-square flex items-center justify-center bg-gray-50">
                            <div className="w-5 h-5 border-2 border-gray-200 border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1.5 w-full">
                        <button
                          className="flex-1 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-600 active:bg-gray-50"
                          onClick={() => {
                            if (canvas) downloadCanvas(canvas, `${storeName}-${selectedBranch?.name}-${table.name}.png`);
                          }}
                        >
                          <Download className="w-3 h-3 inline mr-1" />
                          下载
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
