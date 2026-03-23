import { useState, useRef, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Camera, Upload, PenLine, X, Check, Loader2, Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown, Edit2, Settings, AlertTriangle, CheckCircle, RefreshCw, ClipboardPaste } from "lucide-react";
import * as XLSX from "xlsx";

const FIELDS = [
  { key: "username", label: "用户名" },
  { key: "order_no", label: "订单号" },
  { key: "lottery_type", label: "彩种" },
  { key: "play_method", label: "玩法" },
  { key: "issue_no", label: "期号" },
  { key: "trade_time", label: "时间" },
  { key: "multiplier", label: "倍数" },
  { key: "amount", label: "金额" },
  { key: "content", label: "内容" },
  { key: "win_status", label: "中奖状态" },
  { key: "odds", label: "赔率" },
  { key: "balance", label: "余额" },
] as const;

type FieldKey = typeof FIELDS[number]["key"];
type TradeRow = Record<FieldKey, string>;

function emptyRow(): TradeRow {
  return {
    username: "", order_no: "", lottery_type: "", play_method: "",
    issue_no: "", trade_time: "", multiplier: "", amount: "",
    content: "", win_status: "", odds: "", balance: "",
  };
}

type UploadMode = "photo" | "file" | "manual" | "paste" | null;

// 识别记录带状态
interface RecognizedRecord extends TradeRow {
  _status: 'new' | 'fill' | 'skip';
  _statusText: string;
  _fillFields: string[];
  _existingId?: number;
}

export default function QQTradeRecords() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [uploadMode, setUploadMode] = useState<UploadMode>(null);
  const [pendingRows, setPendingRows] = useState<TradeRow[]>([emptyRow()]);
  const [recognizing, setRecognizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [pasteText, setPasteText] = useState("");

  // 搜索和排序
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortField, setSortField] = useState<string>("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // 行内编辑
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingRow, setEditingRow] = useState<TradeRow>(emptyRow());

  // 识别结果预览（带查重/补录状态）
  const [recognizeResults, setRecognizeResults] = useState<RecognizedRecord[] | null>(null);

  const { data, isLoading, refetch } = trpc.getQQTradeRecords.useQuery(
    { page, pageSize, search: search || undefined, sortField, sortOrder },
    { refetchOnWindowFocus: false }
  );
  const list = data?.list || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  // 批量选中
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchMode, setBatchMode] = useState(false);

  // 查重结果弹窗
  const [importResult, setImportResult] = useState<{ inserted: number; skipped: number; filled: number; details: { order_no: string; status: string; fillFields?: string[] }[] } | null>(null);

  const addMutation = trpc.addQQTradeRecords.useMutation({
    onSuccess: (res) => {
      setSaving(false);
      setUploadMode(null);
      setPendingRows([emptyRow()]);
      refetch();
      if (res.skipped > 0 || res.filled > 0) {
        setImportResult({ inserted: res.inserted, skipped: res.skipped, filled: res.filled, details: res.details || [] });
      } else {
        showToast(`成功导入 ${res.inserted} 条记录`);
      }
    },
    onError: (err) => {
      showToast("导入失败：" + err.message);
      setSaving(false);
    },
  });

  const batchDeleteMutation = trpc.batchDeleteQQTradeRecords.useMutation({
    onSuccess: (res) => {
      showToast(`已删除 ${res.deleted} 条记录`);
      setSelectedIds(new Set());
      setBatchMode(false);
      refetch();
    },
    onError: (err) => {
      showToast("批量删除失败：" + err.message);
    },
  });

  const deleteMutation = trpc.deleteQQTradeRecord.useMutation({
    onSuccess: () => {
      showToast("已删除");
      refetch();
    },
    onError: (err) => {
      showToast("删除失败：" + err.message);
    },
  });

  const updateMutation = trpc.updateQQTradeRecord.useMutation({
    onSuccess: () => {
      showToast("已保存");
      setEditingId(null);
      refetch();
    },
    onError: (err) => {
      showToast("保存失败：" + err.message);
    },
  });

  const recognizeMutation = trpc.recognizeQQTradeImage.useMutation({
    onSuccess: (res) => {
      if (res.records && res.records.length > 0) {
        // 后端返回带 _status/_statusText/_fillFields 的记录
        setRecognizeResults(res.records as RecognizedRecord[]);
      } else {
        showToast("未识别到数据，请手动输入");
        setUploadMode("manual");
      }
      setRecognizing(false);
    },
    onError: (err) => {
      showToast("识别失败：" + err.message);
      setRecognizing(false);
    },
  });

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function handleSave() {
    const validRows = pendingRows.filter(r =>
      Object.values(r).some(v => v.trim() !== "")
    );
    if (validRows.length === 0) {
      showToast("请至少填写一行数据");
      return;
    }
    setSaving(true);
    addMutation.mutate({
      records: validRows,
      batchId: `batch_${Date.now()}`,
    });
  }

  // 确认识别结果：新增的进入编辑，补录的自动更新，跳过的忽略
  async function handleConfirmRecognize() {
    if (!recognizeResults) return;
    setSaving(true);

    const newRecords: TradeRow[] = [];
    const fillPromises: Promise<void>[] = [];

    for (const r of recognizeResults) {
      if (r._status === 'new') {
        // 新增记录 → 放入待编辑列表
        newRecords.push({
          username: r.username, order_no: r.order_no, lottery_type: r.lottery_type,
          play_method: r.play_method, issue_no: r.issue_no, trade_time: r.trade_time,
          multiplier: r.multiplier, amount: r.amount, content: r.content,
          win_status: r.win_status, odds: r.odds, balance: r.balance,
        });
      } else if (r._status === 'fill' && r._existingId) {
        // 补录记录 → 直接调用更新接口
        const updateFields: Record<string, string> = {};
        for (const f of r._fillFields) {
          updateFields[f] = (r as any)[f] || '';
        }
        fillPromises.push(
          new Promise<void>((resolve) => {
            updateMutation.mutate(
              { id: r._existingId!, ...updateFields } as any,
              { onSuccess: () => resolve(), onError: () => resolve() }
            );
          })
        );
      }
      // skip 的不做任何操作
    }

    // 等待所有补录完成
    if (fillPromises.length > 0) {
      await Promise.all(fillPromises);
      const fillCount = fillPromises.length;
      showToast(`已补录 ${fillCount} 条记录`);
    }

    // 关闭预览弹窗
    setRecognizeResults(null);

    if (newRecords.length > 0) {
      // 有新增记录 → 进入编辑模式
      setPendingRows(newRecords);
      setUploadMode("manual");
      if (fillPromises.length === 0) {
        showToast(`${newRecords.length} 条新记录，请确认后保存`);
      }
    } else {
      // 没有新增记录
      setSaving(false);
      refetch();
      if (fillPromises.length === 0) {
        showToast("所有记录均已存在，无需操作");
      }
    }
    setSaving(false);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRecognizing(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      recognizeMutation.mutate({ imageBase64: base64 });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function parseColumnsToRow(cols: string[]): TradeRow {
    return {
      username: cols[0]?.trim() || "",
      order_no: cols[1]?.trim() || "",
      lottery_type: cols[2]?.trim() || "",
      play_method: cols[3]?.trim() || "",
      issue_no: cols[4]?.trim() || "",
      trade_time: cols[5]?.trim() || "",
      multiplier: cols[6]?.trim() || "",
      amount: cols[7]?.trim() || "",
      content: cols[8]?.trim() || "",
      win_status: cols[9]?.trim() || "",
      odds: cols[10]?.trim() || "",
      balance: cols[11]?.trim() || "",
    };
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "xlsx" || ext === "xls") {
      // Excel
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const jsonRows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
          const startIdx = jsonRows[0] && String(jsonRows[0][0]).includes("用户名") ? 1 : 0;
          const rows: TradeRow[] = [];
          for (let i = startIdx; i < jsonRows.length; i++) {
            const cols = jsonRows[i].map(c => String(c));
            if (cols.some(c => c.trim())) rows.push(parseColumnsToRow(cols));
          }
          if (rows.length > 0) {
            setPendingRows(rows);
            setUploadMode("manual");
            showToast(`Excel解析到 ${rows.length} 行数据，请确认后保存`);
          } else {
            showToast("Excel中未解析到数据");
          }
        } catch {
          showToast("Excel解析失败，请检查文件格式");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // CSV/TXT
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const startIdx = lines[0] && lines[0].includes("用户名") ? 1 : 0;
        const rows: TradeRow[] = [];
        for (let i = startIdx; i < lines.length; i++) {
          const cols = lines[i].split(",");
          if (cols.some(c => c.trim())) rows.push(parseColumnsToRow(cols));
        }
        if (rows.length > 0) {
          setPendingRows(rows);
          setUploadMode("manual");
          showToast(`解析到 ${rows.length} 行数据，请确认后保存`);
        } else {
          showToast("未解析到数据");
        }
      };
      reader.readAsText(file, "utf-8");
    }
    e.target.value = "";
  }

  function handleParsePaste() {
    if (!pasteText.trim()) {
      showToast("请先粘贴数据");
      return;
    }
    const lines = pasteText.split(/\r?\n/).filter(l => l.trim());
    const startIdx = lines[0] && lines[0].includes("用户名") ? 1 : 0;
    const rows: TradeRow[] = [];
    for (let i = startIdx; i < lines.length; i++) {
      // 支持Tab分隔(从Excel/网页复制)和逗号分隔
      const line = lines[i];
      const cols = line.includes("\t") ? line.split("\t") : line.split(",");
      if (cols.some(c => c.trim())) rows.push(parseColumnsToRow(cols));
    }
    if (rows.length > 0) {
      setPendingRows(rows);
      setUploadMode("manual");
      setPasteText("");
      showToast(`粘贴解析到 ${rows.length} 行数据，请确认后保存`);
    } else {
      showToast("未解析到有效数据，请检查格式");
    }
  }

  function updateRow(idx: number, key: FieldKey, val: string) {
    setPendingRows(rows => rows.map((r, i) => i === idx ? { ...r, [key]: val } : r));
  }

  function addRow() {
    setPendingRows(rows => [...rows, emptyRow()]);
  }

  function removeRow(idx: number) {
    setPendingRows(rows => rows.length === 1 ? [emptyRow()] : rows.filter((_, i) => i !== idx));
  }

  function handleSort(field: string) {
    if (sortField === field) {
      setSortOrder(o => o === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
    setPage(1);
  }

  function handleSearch() {
    setSearch(searchInput);
    setPage(1);
  }

  function startEdit(row: any) {
    setEditingId(row.id);
    setEditingRow({
      username: row.username || "",
      order_no: row.order_no || "",
      lottery_type: row.lottery_type || "",
      play_method: row.play_method || "",
      issue_no: row.issue_no || "",
      trade_time: row.trade_time || "",
      multiplier: row.multiplier || "",
      amount: row.amount || "",
      content: row.content || "",
      win_status: row.win_status || "",
      odds: row.odds || "",
      balance: row.balance || "",
    });
  }

  function saveEdit(id: number) {
    updateMutation.mutate({ id, ...editingRow });
  }

  function SortIcon({ field }: { field: string }) {
    if (sortField !== field) return <ArrowUpDown size={10} className="text-gray-600 inline ml-0.5" />;
    return sortOrder === "asc"
      ? <ArrowUp size={10} className="text-blue-400 inline ml-0.5" />
      : <ArrowDown size={10} className="text-blue-400 inline ml-0.5" />;
  }

  // 状态颜色映射
  function statusColor(status: string) {
    if (status === 'new') return 'text-green-400';
    if (status === 'fill') return 'text-yellow-400';
    if (status === 'skip') return 'text-gray-500';
    return 'text-gray-400';
  }
  function statusBg(status: string) {
    if (status === 'new') return 'bg-green-900/30 border-green-700/50';
    if (status === 'fill') return 'bg-yellow-900/30 border-yellow-700/50';
    if (status === 'skip') return 'bg-gray-800/50 border-gray-700/50';
    return 'bg-gray-800/50 border-gray-700/50';
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 sticky top-0 z-20">
        <button
          onClick={() => {
            if (uploadMode) {
              setUploadMode(null);
              setPendingRows([emptyRow()]);
            } else if (window.history.length > 1) {
              window.history.back();
            } else {
              setLocation(id ? `/ledger/${id}/qq` : '/');
            }
          }}
          className="flex items-center gap-1 text-gray-400 active:text-white"
        >
          <ChevronLeft size={20} />
          <span className="text-sm">{uploadMode ? "取消" : "返回"}</span>
        </button>
        <h1 className="text-base font-bold text-white">
          {uploadMode === "manual" ? "编辑数据" : uploadMode === "paste" ? "粘贴数据" : "交易记录"}
        </h1>
        {uploadMode === "manual" ? (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 text-blue-400 active:text-blue-300 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            <span className="text-sm">保存</span>
          </button>
        ) : uploadMode === "paste" ? (
          <button
            onClick={handleParsePaste}
            className="flex items-center gap-1 text-cyan-400 active:text-cyan-300"
          >
            <Check size={16} />
            <span className="text-sm">解析</span>
          </button>
        ) : (
          <div className="w-14" />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gray-700 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      {/* ===== 识别结果预览弹窗（带查重/补录状态） ===== */}
      {recognizeResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setRecognizeResults(null)}>
          <div className="bg-gray-800 rounded-xl p-4 mx-3 max-w-md w-full shadow-2xl border border-gray-600 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-green-400 font-bold text-base">AI识别完成</h3>
              <button onClick={() => setRecognizeResults(null)} className="text-gray-400 active:text-white">
                <X size={18} />
              </button>
            </div>

            {/* 统计摘要 */}
            <div className="flex gap-3 mb-3 text-xs">
              <span className="text-green-400">
                新增: {recognizeResults.filter(r => r._status === 'new').length}
              </span>
              <span className="text-yellow-400">
                补录: {recognizeResults.filter(r => r._status === 'fill').length}
              </span>
              <span className="text-gray-500">
                跳过: {recognizeResults.filter(r => r._status === 'skip').length}
              </span>
              <span className="text-gray-400 ml-auto">
                共 {recognizeResults.length} 条
              </span>
            </div>

            {/* 记录详情列表 */}
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {recognizeResults.map((r, i) => (
                <div key={i} className={`rounded-lg border p-3 ${statusBg(r._status)}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white text-sm font-medium">#{i + 1}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      r._status === 'new' ? 'bg-green-800 text-green-300' :
                      r._status === 'fill' ? 'bg-yellow-800 text-yellow-300' :
                      'bg-gray-700 text-gray-400'
                    }`}>
                      {r._statusText}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div><span className="text-gray-500">订单号: </span><span className="text-gray-200">{r.order_no || '-'}</span></div>
                    <div><span className="text-gray-500">玩法: </span><span className="text-gray-200">{r.play_method || '-'}</span></div>
                    <div><span className="text-gray-500">期号: </span><span className="text-gray-200">{r.issue_no || '-'}</span></div>
                    <div><span className="text-gray-500">时间: </span><span className="text-gray-200">{r.trade_time || '(空)'}</span></div>
                    <div><span className="text-gray-500">金额: </span><span className="text-gray-200">{r.amount || '-'}</span></div>
                    <div><span className="text-gray-500">倍数: </span><span className="text-gray-200">{r.multiplier || '-'}</span></div>
                    <div><span className="text-gray-500">内容: </span><span className="text-blue-300">{r.content || '-'}</span></div>
                    <div><span className="text-gray-500">中奖: </span><span className={r.win_status !== '0' ? 'text-green-400 font-bold' : 'text-red-400'}>{r.win_status === '0' ? '未中奖' : r.win_status}</span></div>
                  </div>
                  {r._status === 'fill' && r._fillFields.length > 0 && (
                    <div className="mt-2 text-xs text-yellow-400 flex items-center gap-1">
                      <RefreshCw size={10} />
                      将补录: {r._fillFields.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setRecognizeResults(null)}
                className="flex-1 py-2.5 bg-gray-700 text-gray-300 text-sm rounded-lg font-medium active:bg-gray-600"
              >
                取消
              </button>
              <button
                onClick={handleConfirmRecognize}
                disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white text-sm rounded-lg font-medium active:bg-blue-500 disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                确认执行
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 识别中遮罩 */}
      {recognizing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={36} className="animate-spin text-blue-400" />
            <span className="text-white text-sm">AI识别中...</span>
          </div>
        </div>
      )}

      {/* 上传模式选择 */}
      {!uploadMode && (
        <>
          {/* 上传按钮区 */}
          <div className="px-4 pt-4 pb-2">
            <div className="text-xs text-gray-500 mb-3">选择上传方式</div>
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => photoInputRef.current?.click()}
                className="flex flex-col items-center gap-2 py-4 rounded-xl bg-gray-800 active:bg-gray-700"
              >
                <Camera size={22} className="text-blue-400" />
                <span className="text-xs text-gray-300">拍照识别</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-2 py-4 rounded-xl bg-gray-800 active:bg-gray-700"
              >
                <Upload size={22} className="text-green-400" />
                <span className="text-xs text-gray-300">上传文件</span>
              </button>
              <button
                onClick={() => { setPendingRows([emptyRow()]); setUploadMode("manual"); }}
                className="flex flex-col items-center gap-2 py-4 rounded-xl bg-gray-800 active:bg-gray-700"
              >
                <PenLine size={22} className="text-yellow-400" />
                <span className="text-xs text-gray-300">手动输入</span>
              </button>
              <button
                onClick={() => { setPasteText(""); setUploadMode("paste"); }}
                className="flex flex-col items-center gap-2 py-4 rounded-xl bg-gray-800 active:bg-gray-700"
              >
                <ClipboardPaste size={22} className="text-cyan-400" />
                <span className="text-xs text-gray-300">粘贴数据</span>
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-2">
              <button
                onClick={() => setLocation(id ? `/ledger/${id}/qq/settings` : '/')}
                className="flex flex-col items-center gap-2 py-4 rounded-xl bg-gray-800 active:bg-gray-700"
              >
                <Settings size={22} className="text-purple-400" />
                <span className="text-xs text-gray-300">设置</span>
              </button>
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoChange} />
            <input ref={fileInputRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
          </div>

          {/* 搜索栏 */}
          <div className="px-4 pb-2">
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                <Search size={14} className="text-gray-500 flex-shrink-0" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="搜索用户名、订单号、彩种、内容..."
                  className="flex-1 bg-transparent text-white text-xs outline-none placeholder-gray-600"
                />
                {searchInput && (
                  <button onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}>
                    <X size={12} className="text-gray-500" />
                  </button>
                )}
              </div>
              <button
                onClick={handleSearch}
                className="px-3 py-2 bg-blue-600 rounded-lg text-xs text-white active:bg-blue-500"
              >
                搜索
              </button>
            </div>
            {search && (
              <div className="text-xs text-blue-400 mt-1">搜索：{search} · 共 {total} 条</div>
            )}
          </div>

          {/* 数据列表 */}
          {!search && (
            <div className="px-4 pb-1">
              <div className="text-xs text-gray-500">共 {total} 条记录</div>
            </div>
          )}

          {/* 批量操作栏 */}
          <div className="px-4 pb-2 flex items-center gap-2">
            <button
              onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()); }}
              className={`px-3 py-1.5 text-xs rounded-lg ${batchMode ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400'} active:opacity-80`}
            >
              {batchMode ? '取消批量' : '批量删除'}
            </button>
            {batchMode && selectedIds.size > 0 && (
              <button
                onClick={() => {
                  if (confirm(`确认删除选中的 ${selectedIds.size} 条记录？此操作不可撤销！`)) {
                    batchDeleteMutation.mutate({ ids: Array.from(selectedIds) });
                  }
                }}
                disabled={batchDeleteMutation.isPending}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-700 text-white active:bg-red-600 disabled:opacity-50"
              >
                {batchDeleteMutation.isPending ? '删除中...' : `删除选中 (${selectedIds.size})`}
              </button>
            )}
          </div>

          {/* 表格 */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[1000px]">
              <thead>
                <tr className="bg-gray-900 text-gray-500">
                  {batchMode && (
                    <th className="px-1 py-2 text-center border-b border-gray-800 w-10">
                      <input
                        type="checkbox"
                        checked={list.length > 0 && list.every((r: any) => selectedIds.has(r.id))}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedIds(new Set(list.map((r: any) => r.id)));
                          } else {
                            setSelectedIds(new Set());
                          }
                        }}
                        className="accent-red-500"
                      />
                    </th>
                  )}
                  <th className="px-2 py-2 text-center border-b border-gray-800 w-16">操作</th>
                  {FIELDS.map(f => (
                    <th
                      key={f.key}
                      className="px-2 py-2 text-center whitespace-nowrap border-b border-gray-800 cursor-pointer active:bg-gray-800 select-none"
                      onClick={() => handleSort(f.key)}
                    >
                      {f.label}<SortIcon field={f.key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={batchMode ? 14 : 13} className="text-center py-10 text-gray-500">加载中...</td></tr>
                ) : list.length === 0 ? (
                  <tr><td colSpan={batchMode ? 14 : 13} className="text-center py-10 text-gray-500">暂无数据</td></tr>
                ) : (
                  list.map((row: any) => {
                    const isEditing = editingId === row.id;
                    return (
                      <tr key={row.id} className={`border-b border-gray-800 ${isEditing ? 'bg-gray-800' : 'hover:bg-gray-900'} ${selectedIds.has(row.id) ? 'bg-red-900/20' : ''}`}>
                        {batchMode && (
                          <td className="px-1 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(row.id)}
                              onChange={e => {
                                const next = new Set(selectedIds);
                                if (e.target.checked) next.add(row.id);
                                else next.delete(row.id);
                                setSelectedIds(next);
                              }}
                              className="accent-red-500"
                            />
                          </td>
                        )}
                        {/* 操作列 */}
                        <td className="px-1 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => saveEdit(row.id)}
                                  disabled={updateMutation.isPending}
                                  className="text-green-400 active:text-green-300 disabled:opacity-50"
                                >
                                  {updateMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                </button>
                                <button onClick={() => setEditingId(null)} className="text-gray-500 active:text-gray-300">
                                  <X size={13} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEdit(row)} className="text-blue-400 active:text-blue-300">
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('确认删除这条记录？')) {
                                      deleteMutation.mutate({ id: row.id });
                                    }
                                  }}
                                  className="text-gray-600 active:text-red-400"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                        {FIELDS.map(f => {
                          if (isEditing) {
                            return (
                              <td key={f.key} className="px-1 py-1">
                                <input
                                  type="text"
                                  value={editingRow[f.key as FieldKey]}
                                  onChange={e => setEditingRow(r => ({ ...r, [f.key]: e.target.value }))}
                                  className="w-full bg-gray-700 text-white text-xs px-1.5 py-1 rounded border border-gray-600 focus:border-blue-500 outline-none min-w-[64px]"
                                />
                              </td>
                            );
                          }
                          if (f.key === 'win_status') {
                            const val = Number(row[f.key]);
                            const won = !isNaN(val) && val > 0;
                            return (
                              <td key={f.key} className="px-2 py-2 text-center whitespace-nowrap">
                                <span className={won ? 'text-green-400 font-bold' : 'text-red-400'}>
                                  {won ? '已中奖' : '未中奖'}
                                </span>
                              </td>
                            );
                          }
                          return (
                            <td key={f.key} className="px-2 py-2 text-center text-gray-300 whitespace-nowrap">
                              {row[f.key] ?? ""}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 py-4 border-t border-gray-800">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-3 py-1 text-sm bg-gray-800 rounded disabled:opacity-40">上一页</button>
              <span className="text-sm text-gray-400">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="px-3 py-1 text-sm bg-gray-800 rounded disabled:opacity-40">下一页</button>
            </div>
          )}
        </>
      )}

      {/* 粘贴数据模式 */}
      {uploadMode === "paste" && (
        <div className="px-4 pt-4">
          <div className="text-xs text-gray-400 mb-2">从Excel或网页复制表格数据后粘贴到下方，支持Tab分隔和逗号分隔</div>
          <div className="text-xs text-gray-600 mb-3">格式: 用户名, 订单号, 彩种, 玩法, 期号, 时间, 倍数, 金额, 内容, 中奖状态, 赔率, 余额</div>
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder={"粘贴数据到这里...\n\n示例(逗号分隔):\njjh2378,ORD001,奇趣腾讯分分彩,后二跨度,20250301001,2025-03-01 10:00,1,2.000,0369,中奖,5.880,100\n\n示例(Tab分隔 - 从Excel复制):\njjh2378\tORD002\t奇趣腾讯分分彩\t后二跨度\t..."}
            className="w-full h-64 bg-gray-800 text-white text-xs p-3 rounded-lg border border-gray-700 focus:border-cyan-500 outline-none resize-none font-mono"
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-gray-500">{pasteText.split(/\r?\n/).filter(l => l.trim()).length} 行</span>
            <button
              onClick={() => setPasteText("")}
              className="text-xs text-gray-500 active:text-white"
            >
              清空
            </button>
          </div>
        </div>
      )}

      {/* 手动输入/编辑模式 */}
      {uploadMode === "manual" && (
        <div className="px-2 pt-3">
          <div className="text-xs text-gray-500 mb-2 px-2">共 {pendingRows.length} 行 · 左右滑动查看所有字段</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[900px]">
              <thead>
                <tr className="bg-gray-900 text-gray-500">
                  <th className="px-1 py-2 w-8 border-b border-gray-800"></th>
                  {FIELDS.map(f => (
                    <th key={f.key} className="px-1 py-2 text-center whitespace-nowrap border-b border-gray-800 min-w-[80px]">{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pendingRows.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-800">
                    <td className="px-1 py-1 text-center">
                      <button onClick={() => removeRow(idx)} className="text-gray-600 active:text-red-400">
                        <X size={14} />
                      </button>
                    </td>
                    {FIELDS.map(f => (
                      <td key={f.key} className="px-1 py-1">
                        <input
                          type="text"
                          value={row[f.key]}
                          onChange={e => updateRow(idx, f.key, e.target.value)}
                          className="w-full bg-gray-800 text-white text-xs px-2 py-1 rounded border border-gray-700 focus:border-blue-500 outline-none min-w-[72px]"
                          placeholder={f.label}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-center mt-3 mb-20">
            <button
              onClick={addRow}
              className="px-6 py-2 text-sm bg-gray-800 text-gray-300 rounded-lg active:bg-gray-700"
            >
              + 添加一行
            </button>
          </div>
        </div>
      )}

      {/* 导入结果弹窗（查重/补缺结果） */}
      {importResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setImportResult(null)}>
          <div className="bg-gray-800 rounded-xl p-4 mx-3 max-w-md w-full shadow-2xl border border-gray-600 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-white mb-3">导入结果</h3>
            <div className="flex gap-3 mb-3 text-xs">
              <span className="text-green-400">新增 {importResult.inserted} 条</span>
              <span className="text-yellow-400">补录 {importResult.filled} 条</span>
              <span className="text-gray-500">跳过 {importResult.skipped} 条</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {importResult.details.map((d, i) => (
                <div key={i} className={`text-xs px-2 py-1.5 rounded border ${
                  d.status === 'new' ? 'bg-green-900/20 border-green-700/40 text-green-300' :
                  d.status === 'fill' ? 'bg-yellow-900/20 border-yellow-700/40 text-yellow-300' :
                  'bg-gray-800/50 border-gray-700/40 text-gray-500'
                }`}>
                  <span className="font-mono">{d.order_no || '(无订单号)'}</span>
                  <span className="ml-2">
                    {d.status === 'new' ? '→ 新增' :
                     d.status === 'fill' ? `→ 补录: ${(d.fillFields || []).join(', ')}` :
                     '→ 跳过(已存在)'}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setImportResult(null)}
              className="mt-3 w-full py-2 bg-blue-600 text-white text-sm rounded-lg active:bg-blue-500"
            >
              确定
            </button>
          </div>
        </div>
      )}

      <div className="h-10" />
    </div>
  );
}
