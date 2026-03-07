/**
 * QrCodeManager.tsx - 意见本二维码管理
 * 路由：/ledger/:id/qrcodes
 *
 * 持久化：生成记录存入 localStorage，下次进入自动恢复并重新渲染二维码
 */
import { useState, useCallback, useMemo, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Download, QrCode, RefreshCw, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import QRCode from "qrcode";

/* ─── 持久化 key ─────────────────────────────────────────────── */
function storageKey(ledgerId: number, branchId: number) {
  return `qr_config_${ledgerId}_${branchId}`;
}

interface SavedConfig {
  branchId: number;
  branchName: string;
  tableCount: number;
  savedAt: number; // timestamp
}

/* ─── 二维码绘制工具 ─────────────────────────────────────────── */
async function generateQrCanvas(
  url: string,
  storeName: string,
  branchName: string,
  label: string
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
  ctx.fillText(label, SIZE / 2, 52, SIZE - 20);

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

  /* ── 数据加载（与分店管理页完全一致）─────────────────────────── */
  const { data: ledgerInfo } = trpc.ledger.getLedger.useQuery(
    { id: ledgerId },
    { enabled: ledgerId > 0 }
  );
  const { data: categoriesData, isLoading: catLoading } = trpc.ledger.getCategories.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0 }
  );
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
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const selectedBranch = branches.find((b: any) => b.id === selectedBranchId);

  /* ── 恢复持久化配置 ─────────────────────────────────────────── */
  // 当分店列表加载完成后，检查是否有已保存的配置
  useEffect(() => {
    if (branches.length === 0) return;
    // 找到最近一次保存的配置
    let latest: SavedConfig | null = null;
    for (const branch of branches) {
      const raw = localStorage.getItem(storageKey(ledgerId, branch.id));
      if (!raw) continue;
      try {
        const cfg: SavedConfig = JSON.parse(raw);
        if (!latest || cfg.savedAt > latest.savedAt) latest = cfg;
      } catch {}
    }
    if (!latest) return;
    // 恢复选中分店和数量
    setSelectedBranchId(latest.branchId);
    setTableCount(String(latest.tableCount));
    // 自动重新生成二维码
    autoRestore(latest, storeName, ledgerId, baseUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches.length]);

  const autoRestore = useCallback(
    async (cfg: SavedConfig, sName: string, lId: number, bUrl: string) => {
      setGenerating(true);
      setConfirmedCount(cfg.tableCount);
      setQrCanvases(new Map());
      const map = new Map<number, HTMLCanvasElement>();
      for (let i = 1; i <= cfg.tableCount; i++) {
        const label = tableLabel(i);
        const url = `${bUrl}/feedback/${lId}?branch=${encodeURIComponent(cfg.branchName)}&table=${encodeURIComponent(label)}`;
        try {
          const canvas = await generateQrCanvas(url, sName, cfg.branchName, label);
          map.set(i, canvas);
        } catch {}
      }
      setQrCanvases(new Map(map));
      setGenerating(false);
    },
    []
  );

  /* ── 生成二维码 ─────────────────────────────────────────────── */
  const handleGenerate = useCallback(async () => {
    if (!selectedBranch) { toast.error("请先选择分店"); return; }
    const count = parseInt(tableCount);
    if (isNaN(count) || count < 1 || count > 200) { toast.error("请输入1~200之间的数量"); return; }

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
      } catch (e) { console.error("QR error", e); }
    }
    setQrCanvases(new Map(map));
    setGenerating(false);

    // 持久化保存配置
    const cfg: SavedConfig = {
      branchId: selectedBranch.id,
      branchName: selectedBranch.name,
      tableCount: count,
      savedAt: Date.now(),
    };
    localStorage.setItem(storageKey(ledgerId, selectedBranch.id), JSON.stringify(cfg));
    toast.success(`已生成 ${count} 张二维码，下次进入将自动恢复`);
  }, [selectedBranch, tableCount, storeName, ledgerId, baseUrl]);

  /* ── 清空当前分店的二维码 ────────────────────────────────────── */
  const handleClear = () => {
    if (selectedBranch) {
      localStorage.removeItem(storageKey(ledgerId, selectedBranch.id));
    }
    setQrCanvases(new Map());
    setConfirmedCount(0);
    setShowClearConfirm(false);
    toast.success("已清空，可重新生成");
  };

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
                          // 切换分店时，检查是否有该分店的已保存配置
                          const raw = localStorage.getItem(storageKey(ledgerId, b.id));
                          if (raw) {
                            try {
                              const cfg: SavedConfig = JSON.parse(raw);
                              setTableCount(String(cfg.tableCount));
                              setConfirmedCount(0);
                              setQrCanvases(new Map());
                              // 自动恢复
                              autoRestore(cfg, storeName, ledgerId, baseUrl);
                            } catch {}
                          } else {
                            setQrCanvases(new Map());
                            setConfirmedCount(0);
                          }
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
                    <><RefreshCw className="w-4 h-4 animate-spin" />生成中</>
                  ) : (
                    <><QrCode className="w-4 h-4" />生成</>
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                将为 {selectedBranch?.name} 生成 01桌 ~ {String(parseInt(tableCount) || 0).padStart(2, "0")}桌，共 {parseInt(tableCount) || 0} 张
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
                  {generating ? "恢复中..." : `共 ${qrCanvases.size} 张 · 已自动保存`}
                </p>
              </div>
              {!generating && qrCanvases.size > 0 && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl h-8 px-3 text-xs gap-1 text-red-500 border-red-200 hover:bg-red-50"
                    onClick={() => setShowClearConfirm(true)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    清空
                  </Button>
                  <Button
                    size="sm"
                    className="bg-[#D32F2F] hover:bg-red-700 text-white rounded-xl h-8 px-3 text-xs gap-1"
                    onClick={handleDownloadAll}
                    disabled={downloading}
                  >
                    <Download className="w-3.5 h-3.5" />
                    {downloading ? "下载中..." : "全部下载"}
                  </Button>
                </div>
              )}
            </div>

            {generating ? (
              <div className="p-10 text-center">
                <div className="w-8 h-8 border-2 border-[#D32F2F] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-400">正在恢复二维码...</p>
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
                          onClick={() => downloadCanvas(canvas, `${storeName}-${selectedBranch?.name}-${label}.png`)}
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
            <li>· 生成后自动保存，下次进入会自动恢复，无需重新生成</li>
            <li>· 点击"清空"可删除当前分店的二维码，然后重新生成</li>
            <li>· 顾客扫码提交意见后，支付页面会显示分店、桌号和扫码时间</li>
            <li>· 二维码永久有效，打印后贴在对应桌位即可长期使用</li>
          </ul>
        </div>
      </div>

      {/* 清空确认弹窗 */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-semibold text-gray-800 mb-2">确认清空？</h3>
            <p className="text-sm text-gray-500 mb-5">
              将清空 <span className="font-medium text-gray-700">{selectedBranch?.name}</span> 的所有二维码，清空后可重新生成。
            </p>
            <div className="flex gap-3">
              <button
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600"
                onClick={() => setShowClearConfirm(false)}
              >
                取消
              </button>
              <button
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium"
                onClick={handleClear}
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
