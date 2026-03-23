import { useState, useRef, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Camera, Upload, PenLine, X, Check, Loader2, Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown, Edit2, Settings } from "lucide-react";

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

type UploadMode = "photo" | "file" | "manual" | null;

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

  // 搜索和排序
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortField, setSortField] = useState<string>("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // 行内编辑
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingRow, setEditingRow] = useState<TradeRow>(emptyRow());
  const [recognizeDetail, setRecognizeDetail] = useState<{ count: number; details: string } | null>(null);

  const { data, isLoading, refetch } = trpc.getQQTradeRecords.useQuery(
    { page, pageSize, search: search || undefined, sortField, sortOrder },
    { refetchOnWindowFocus: false }
  );
  const list = data?.list || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  const addMutation = trpc.addQQTradeRecords.useMutation({
    onSuccess: (res) => {
      showToast(`成功导入 ${res.inserted} 条记录`);
      setSaving(false);
      setUploadMode(null);
      setPendingRows([emptyRow()]);
      refetch();
    },
    onError: (err) => {
      showToast("导入失败：" + err.message);
      setSaving(false);
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
        const mapped = res.records.map((r: any) => ({
          username: r.username || "",
          order_no: r.order_no || "",
          lottery_type: r.lottery_type || "",
          play_method: r.play_method || "",
          issue_no: r.issue_no || "",
          trade_time: r.trade_time || "",
          multiplier: r.multiplier || "",
          amount: r.amount || "",
          content: r.content || "",
          win_status: r.win_status || "",
          odds: r.odds || "",
          balance: r.balance || "",
        }));
        setPendingRows(mapped);
        setUploadMode("manual");
        // 详细提示识别结果
        const details = mapped.map((r: any, i: number) =>
          `#${i + 1} 订单:${r.order_no || '-'} 金额:${r.amount || '-'} 内容:${r.content || '-'} 状态:${r.win_status === '0' ? '未中奖' : r.win_status || '-'}`
        ).join('\n');
        setRecognizeDetail({ count: mapped.length, details });
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const startIdx = lines[0] && lines[0].includes("用户名") ? 1 : 0;
      const rows: TradeRow[] = [];
      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(",");
        rows.push({
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
        });
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
    e.target.value = "";
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
          {uploadMode === "manual" ? "编辑数据" : "交易记录"}
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

      {/* 识别结果详情弹窗 */}
      {recognizeDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setRecognizeDetail(null)}>
          <div className="bg-gray-800 rounded-xl p-4 mx-4 max-w-sm w-full shadow-2xl border border-gray-600" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-green-400 font-bold text-base">AI识别完成</h3>
              <button onClick={() => setRecognizeDetail(null)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="text-yellow-300 text-sm mb-3">共识别到 {recognizeDetail.count} 条记录</div>
            <div className="bg-gray-900/60 rounded-lg p-3 max-h-60 overflow-y-auto">
              {recognizeDetail.details.split('\n').map((line, i) => (
                <div key={i} className="text-gray-200 text-xs py-1 border-b border-gray-700/50 last:border-0 whitespace-pre-wrap">{line}</div>
              ))}
            </div>
            <button
              onClick={() => setRecognizeDetail(null)}
              className="mt-3 w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg font-medium"
            >
              确认，去编辑
            </button>
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
                onClick={() => setLocation(id ? `/ledger/${id}/qq/settings` : '/')}
                className="flex flex-col items-center gap-2 py-4 rounded-xl bg-gray-800 active:bg-gray-700"
              >
                <Settings size={22} className="text-purple-400" />
                <span className="text-xs text-gray-300">设置</span>
              </button>
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoChange} />
            <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
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

          {/* 表格 */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[1000px]">
              <thead>
                <tr className="bg-gray-900 text-gray-500">
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
                  <tr><td colSpan={13} className="text-center py-10 text-gray-500">加载中...</td></tr>
                ) : list.length === 0 ? (
                  <tr><td colSpan={13} className="text-center py-10 text-gray-500">暂无数据</td></tr>
                ) : (
                  list.map((row: any) => {
                    const isEditing = editingId === row.id;
                    return (
                      <tr key={row.id} className={`border-b border-gray-800 ${isEditing ? 'bg-gray-800' : 'hover:bg-gray-900'}`}>
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

      <div className="h-10" />
    </div>
  );
}
