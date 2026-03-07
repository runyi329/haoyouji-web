/**
 * QrCodeManager.tsx - 意见本二维码管理（纯前端，无需数据库）
 * 路由：/ledger/:id/qrcodes
 * 功能：
 *   - 手动输入分店名称
 *   - 输入桌号数量（如30）
 *   - 自动生成 01桌 ~ 30桌 的带标注二维码（Canvas绘制）
 *   - 支持单张下载 / 全部下载
 *   - 二维码URL：/feedback/:ledgerId?branch=分店名&table=01桌
 */
import { useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Download, QrCode, RefreshCw, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import QRCode from "qrcode";

// 生成带标注的二维码 canvas
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

  // 白色背景
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 顶部红色区域
  ctx.fillStyle = "#D32F2F";
  ctx.fillRect(0, 0, SIZE, HEADER);

  // 店名（小字）
  ctx.fillStyle = "rgba(255,255,255,0.80)";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  const displayStore = branchName ? `${storeName} · ${branchName}` : storeName;
  ctx.fillText(displayStore, SIZE / 2, 22, SIZE - 20);

  // 桌号（大字加粗）
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(tableLabel, SIZE / 2, 52, SIZE - 20);

  // 二维码
  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, url, {
    width: QR_SIZE,
    margin: 1,
    color: { dark: "#1a1a1a", light: "#ffffff" },
  });
  ctx.drawImage(qrCanvas, PADDING, HEADER, QR_SIZE, QR_SIZE);

  // 底部提示
  ctx.fillStyle = "#555555";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("扫码提意见，享95折优惠", SIZE / 2, SIZE + HEADER + 30, SIZE - 20);

  // 边框
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

// 本地存储key
const STORAGE_KEY = "qr_branches";

interface BranchConfig {
  id: string;
  name: string;
  tableCount: string;
}

export default function QrCodeManager() {
  const params = useParams<{ id: string }>();
  const ledgerId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();

  // 从localStorage恢复分店配置
  const loadBranches = (): BranchConfig[] => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY + "_" + ledgerId);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [{ id: "1", name: "", tableCount: "10" }];
  };

  const [branches, setBranches] = useState<BranchConfig[]>(loadBranches);
  const [selectedBranch, setSelectedBranch] = useState<BranchConfig | null>(null);
  const [qrCanvases, setQrCanvases] = useState<Map<number, HTMLCanvasElement>>(new Map());
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // 账本名（用于二维码标注）
  const [storeName] = useState(() => {
    // 从URL或localStorage读取，默认"好友记"
    return localStorage.getItem("ledger_name_" + ledgerId) || "好友记";
  });

  const baseUrl = window.location.origin;

  // 保存分店配置到localStorage
  const saveBranches = (list: BranchConfig[]) => {
    localStorage.setItem(STORAGE_KEY + "_" + ledgerId, JSON.stringify(list));
  };

  const updateBranch = (id: string, field: keyof BranchConfig, value: string) => {
    const updated = branches.map(b => b.id === id ? { ...b, [field]: value } : b);
    setBranches(updated);
    saveBranches(updated);
  };

  const addBranch = () => {
    const newBranch: BranchConfig = {
      id: Date.now().toString(),
      name: "",
      tableCount: "10",
    };
    const updated = [...branches, newBranch];
    setBranches(updated);
    saveBranches(updated);
  };

  const removeBranch = (id: string) => {
    if (branches.length <= 1) { toast.error("至少保留一个分店"); return; }
    const updated = branches.filter(b => b.id !== id);
    setBranches(updated);
    saveBranches(updated);
    if (selectedBranch?.id === id) {
      setSelectedBranch(null);
      setQrCanvases(new Map());
    }
  };

  // 生成二维码
  const handleGenerate = useCallback(async (branch: BranchConfig) => {
    if (!branch.name.trim()) {
      toast.error("请先输入分店名称");
      return;
    }
    const count = parseInt(branch.tableCount);
    if (isNaN(count) || count < 1 || count > 200) {
      toast.error("桌号数量请填写1~200之间的数字");
      return;
    }

    setSelectedBranch(branch);
    setGenerating(true);
    setQrCanvases(new Map());

    const map = new Map<number, HTMLCanvasElement>();
    for (let i = 1; i <= count; i++) {
      const label = tableLabel(i);
      const url = `${baseUrl}/feedback/${ledgerId}?branch=${encodeURIComponent(branch.name)}&table=${encodeURIComponent(label)}`;
      try {
        const canvas = await generateQrCanvas(url, storeName, branch.name, label);
        map.set(i, canvas);
      } catch (e) {
        console.error("QR error", e);
      }
    }
    setQrCanvases(new Map(map));
    setGenerating(false);
    toast.success(`已生成 ${count} 张二维码`);
  }, [storeName, ledgerId, baseUrl]);

  // 批量下载
  const handleDownloadAll = async () => {
    if (!selectedBranch || qrCanvases.size === 0) return;
    setDownloading(true);
    const entries = Array.from(qrCanvases.entries());
    for (let i = 0; i < entries.length; i++) {
      const [idx, canvas] = entries[i];
      downloadCanvas(canvas, `${storeName}-${selectedBranch.name}-${tableLabel(idx)}.png`);
      if (i < entries.length - 1) await new Promise(r => setTimeout(r, 150));
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
          <p className="text-white/70 text-xs">每桌一码，扫码提意见享95折</p>
        </div>
        <QrCode className="w-5 h-5 opacity-60" />
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 pb-10 space-y-4">

        {/* 分店配置区 */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">分店配置</p>
            <button
              onClick={addBranch}
              className="flex items-center gap-1 text-xs text-[#D32F2F] font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              添加分店
            </button>
          </div>

          <div className="divide-y divide-gray-50">
            {branches.map((branch, idx) => (
              <div key={branch.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 shrink-0 w-12">分店{idx + 1}</span>
                  <Input
                    value={branch.name}
                    onChange={e => updateBranch(branch.id, "name", e.target.value)}
                    placeholder="输入分店名称（如：西三环分店）"
                    className="flex-1 h-9 text-sm rounded-xl border-gray-200"
                  />
                  {branches.length > 1 && (
                    <button onClick={() => removeBranch(branch.id)} className="p-1 text-gray-300 active:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 pl-14">
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={branch.tableCount}
                    onChange={e => updateBranch(branch.id, "tableCount", e.target.value)}
                    placeholder="桌号数量"
                    className="w-28 h-9 text-sm rounded-xl border-gray-200"
                  />
                  <span className="text-xs text-gray-400">张（01桌~{String(parseInt(branch.tableCount)||0).padStart(2,"0")}桌）</span>
                  <Button
                    size="sm"
                    onClick={() => handleGenerate(branch)}
                    disabled={generating}
                    className="ml-auto bg-[#D32F2F] hover:bg-red-700 text-white rounded-xl h-9 px-4 text-xs gap-1 shrink-0"
                  >
                    {generating && selectedBranch?.id === branch.id ? (
                      <><RefreshCw className="w-3.5 h-3.5 animate-spin" />生成中</>
                    ) : (
                      <><QrCode className="w-3.5 h-3.5" />生成</>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 二维码预览区 */}
        {selectedBranch && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {selectedBranch.name} · 桌号二维码
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
                <p className="text-xs text-gray-300 mt-1">共 {selectedBranch.tableCount} 张</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 p-4">
                {Array.from({ length: parseInt(selectedBranch.tableCount) || 0 }, (_, i) => i + 1).map(idx => {
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
                          onClick={() => downloadCanvas(canvas, `${storeName}-${selectedBranch.name}-${label}.png`)}
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
            <li>· 输入分店名称和桌号数量，点击"生成"即可批量生成二维码</li>
            <li>· 二维码自动编号：01桌、02桌…，顶部显示店名和桌号，不会混淆</li>
            <li>· 顾客扫码提交意见后，支付页面会显示分店、桌号和扫码时间</li>
            <li>· 分店配置会自动保存，下次进入无需重新输入</li>
            <li>· 二维码永久有效，打印后贴在对应桌位即可长期使用</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
