import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Plus, MessageSquare, QrCode, Star, ChevronDown, ChevronUp,
  Store, Table2, Eye, RefreshCw, Lightbulb, ArrowLeft, Building2, Gem
} from "lucide-react";
import QRCode from "qrcode";

// ===== 二维码生成弹窗 =====
function QRCodeModal({
  bookId, tableId, tableCode, branchName, storeName, bookName, onClose
}: {
  bookId: number; tableId: number; tableCode: string;
  branchName?: string; storeName?: string; bookName: string; onClose: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const url = `${window.location.origin}/feedback/${bookId}/${tableId}`;
  useState(() => {
    QRCode.toDataURL(url, { width: 300, margin: 2, color: { dark: '#1a1a1a', light: '#ffffff' } })
      .then(setQrDataUrl).catch(console.error);
  });
  const displayName = branchName
    ? `${storeName || bookName} · ${branchName}`
    : (storeName || bookName);
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-xs w-full" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-center text-gray-800 mb-1">{displayName}</h3>
        <p className="text-center text-gray-500 text-sm mb-4">桌号：{tableCode}</p>
        {qrDataUrl ? (
          <div className="flex flex-col items-center gap-4">
            <img src={qrDataUrl} alt="QR Code" className="w-48 h-48 rounded-lg border" />
            <p className="text-xs text-gray-400 text-center break-all">{url}</p>
            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1 text-sm" onClick={onClose}>关闭</Button>
              <Button className="flex-1 text-sm bg-[#D32F2F] hover:bg-red-700 text-white" onClick={() => {
                const a = document.createElement('a');
                a.href = qrDataUrl;
                a.download = `意见二维码-${displayName}-${tableCode}.png`;
                a.click();
              }}>下载二维码</Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}
      </div>
    </div>
  );
}

// ===== 意见列表视图 =====
function EntriesView({ bookId, bookName, onBack }: { bookId: number; bookName: string; onBack: () => void }) {
  const [selectedTableId, setSelectedTableId] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const { data: tables } = trpc.opinionBook.getTables.useQuery({ bookId });
  const { data: entriesData, isLoading, refetch } = trpc.opinionBook.getEntries.useQuery({
    bookId, tableId: selectedTableId, page, pageSize: 20
  });
  const renderStars = (rating?: number) => {
    if (!rating) return null;
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(s => (
          <Star key={s} className={`w-3 h-3 ${s <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
        ))}
      </div>
    );
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-gray-500 text-sm">
          <ArrowLeft className="w-4 h-4" /> 返回
        </button>
        <h3 className="font-bold text-gray-800">{bookName} · 意见列表</h3>
        <button onClick={() => refetch()} className="ml-auto text-gray-400">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      {tables && tables.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => { setSelectedTableId(undefined); setPage(1); }}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-all ${!selectedTableId ? 'bg-[#D32F2F] text-white border-[#D32F2F]' : 'bg-white text-gray-600 border-gray-200'}`}
          >全部</button>
          {tables.map((t: any) => (
            <button
              key={t.id}
              onClick={() => { setSelectedTableId(t.id); setPage(1); }}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-all ${selectedTableId === t.id ? 'bg-[#D32F2F] text-white border-[#D32F2F]' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              {t.branch_name ? `${t.branch_name}·` : ''}{t.table_code}
            </button>
          ))}
        </div>
      )}
      {isLoading ? (
        <div className="text-center py-6 text-gray-400 text-sm">加载中...</div>
      ) : !entriesData?.entries?.length ? (
        <Card className="p-6 text-center text-gray-400">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">暂无意见</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {entriesData.entries.map((e: any) => (
            <Card key={e.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <Badge variant="outline" className="text-xs px-1.5 py-0 h-5">{e.table_code}</Badge>
                    {e.branch_name && <span className="text-xs text-[#D32F2F]">{e.branch_name}</span>}
                    {e.location && <span className="text-xs text-gray-400">{e.location}</span>}
                    {e.guest_name && <span className="text-xs text-gray-500">· {e.guest_name}</span>}
                  </div>
                  <p className="text-sm text-gray-800">{e.content}</p>
                  {renderStars(e.rating)}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {new Date(e.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </Card>
          ))}
          {entriesData.total > 20 && (
            <div className="flex justify-center gap-2 pt-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
              <span className="text-xs text-gray-500 self-center">{page} / {Math.ceil(entriesData.total / 20)}</span>
              <Button variant="outline" size="sm" disabled={page >= Math.ceil(entriesData.total / 20)} onClick={() => setPage(p => p + 1)}>下一页</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ===== 分店下拉选择器（参考AA账本右上角样式）=====
function BranchSelector({
  branches, selectedBranch, onSelect
}: {
  branches: any[];
  selectedBranch: string | null;
  onSelect: (branch: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const label = selectedBranch === null ? '全部' : selectedBranch;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 bg-white border border-gray-200 rounded-full px-3 py-1 text-xs font-medium text-gray-700 shadow-sm"
      >
        <Building2 className="w-3 h-3 text-[#D32F2F]" />
        <span className="max-w-[60px] truncate">{label}</span>
        <ChevronDown className="w-3 h-3 text-gray-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-100 z-20 min-w-[110px] overflow-hidden">
          <button
            onClick={() => { onSelect(null); setOpen(false); }}
            className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors ${selectedBranch === null ? 'bg-[#D32F2F] text-white' : 'text-gray-700 hover:bg-gray-50'}`}
          >全部分店</button>
          {branches.map((b: any) => (
            <button
              key={b.branch_name}
              onClick={() => { onSelect(b.branch_name); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors ${selectedBranch === b.branch_name ? 'bg-[#D32F2F] text-white' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              {b.branch_name}
              <span className={`ml-1 text-xs ${selectedBranch === b.branch_name ? 'text-red-200' : 'text-gray-400'}`}>({b.table_count})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== 分店+桌号管理展开区 =====
function TableManager({ book, selectedBranch }: { book: any; selectedBranch: string | null }) {
  const [newBranchName, setNewBranchName] = useState("");
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [batchPrefix, setBatchPrefix] = useState("");
  const [batchCount, setBatchCount] = useState("10");
  const [batchLocation, setBatchLocation] = useState("");
  const [qrModal, setQrModal] = useState<any>(null);

  const utils = trpc.useUtils();
  const { data: tables } = trpc.opinionBook.getTables.useQuery({ bookId: book.id });

  const batchMutation = trpc.opinionBook.addTablesBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`成功添加 ${data.count} 个桌号`);
      setBatchPrefix(""); setBatchCount("10"); setBatchLocation("");
      utils.opinionBook.getTables.invalidate({ bookId: book.id });
      utils.opinionBook.getBranches.invalidate({ bookId: book.id });
    },
    onError: (e) => toast.error(e.message),
  });

  const filteredTables = tables ? tables.filter((t: any) => {
    if (selectedBranch === null) return true;
    return t.branch_name === selectedBranch;
  }) : [];

  return (
    <div className="border-t bg-gray-50 p-4 space-y-4">

      {/* ===== 一级：分店管理 ===== */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-[#D32F2F]" />
            <span className="text-xs font-semibold text-gray-700">添加分店</span>
          </div>
          <button
            onClick={() => setShowAddBranch(!showAddBranch)}
            className="flex items-center gap-1 text-xs text-[#D32F2F] font-medium"
          >
            <Plus className="w-3 h-3" />
            新增分店
          </button>
        </div>

        {showAddBranch && (
          <div className="bg-white rounded-lg p-3 border mb-2 flex gap-2">
            <Input
              value={newBranchName}
              onChange={e => setNewBranchName(e.target.value)}
              placeholder="分店名称，如：朝阳店"
              className="h-8 text-xs flex-1"
            />
            <Button
              size="sm"
              className="h-8 text-xs bg-[#D32F2F] hover:bg-red-700 text-white px-3"
              onClick={() => {
                if (!newBranchName.trim()) { toast.error("请输入分店名称"); return; }
                toast.success(`分店「${newBranchName.trim()}」已添加，请在下方为该分店生成桌号`);
                setShowAddBranch(false);
                setNewBranchName("");
              }}
            >确认</Button>
            <Button variant="outline" size="sm" className="h-8 text-xs px-3"
              onClick={() => { setShowAddBranch(false); setNewBranchName(""); }}>取消</Button>
          </div>
        )}
      </div>

      {/* ===== 二级：桌号管理 ===== */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Table2 className="w-3.5 h-3.5 text-[#D32F2F]" />
          <span className="text-xs font-semibold text-gray-700">
            批量生成桌号
            {selectedBranch && (
              <span className="text-[#D32F2F] ml-1">· {selectedBranch}</span>
            )}
          </span>
        </div>

        <div className="bg-white rounded-lg p-3 border mb-3">
          {selectedBranch && (
            <p className="text-xs text-[#D32F2F] mb-2 font-medium">归属分店：{selectedBranch}</p>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-gray-500">前缀</Label>
              <Input value={batchPrefix} onChange={e => setBatchPrefix(e.target.value)} placeholder="如 A" className="h-8 text-xs mt-1" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">数量</Label>
              <Input type="number" value={batchCount} onChange={e => setBatchCount(e.target.value)} placeholder="10" className="h-8 text-xs mt-1" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">位置</Label>
              <Input value={batchLocation} onChange={e => setBatchLocation(e.target.value)} placeholder="如 一楼" className="h-8 text-xs mt-1" />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            将生成：{batchPrefix || ''}01 ~ {batchPrefix || ''}{String(parseInt(batchCount) || 10).padStart(2, '0')}
          </p>
          <Button
            size="sm"
            className="mt-2 w-full bg-[#D32F2F] hover:bg-red-700 text-white text-xs h-8"
            disabled={batchMutation.isPending}
            onClick={() => {
              const count = parseInt(batchCount);
              if (!count || count < 1) { toast.error("请输入有效数量"); return; }
              const branchToUse = selectedBranch || undefined;
              batchMutation.mutate({ bookId: book.id, branchName: branchToUse, prefix: batchPrefix, count, location: batchLocation || undefined });
            }}
          >
            {batchMutation.isPending ? "生成中..." : `批量生成 ${batchCount || 10} 个桌号`}
          </Button>
        </div>

        {/* 桌号列表 */}
        {filteredTables.length > 0 ? (
          <div>
            <p className="text-xs text-gray-500 mb-2">已有桌号（{filteredTables.length} 个）</p>
            <div className="grid grid-cols-2 gap-2">
              {filteredTables.map((t: any) => (
                <div key={t.id} className="bg-white border rounded-lg p-2 flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{t.table_code}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {t.branch_name && <span className="text-[#D32F2F]">{t.branch_name} · </span>}
                      {t.location || '未设位置'} · {t.entry_count}条
                    </p>
                  </div>
                  <Button
                    variant="ghost" size="sm" className="h-7 w-7 p-0 flex-shrink-0"
                    onClick={() => setQrModal({ bookId: book.id, tableId: t.id, tableCode: t.table_code, branchName: t.branch_name, storeName: book.store_name, bookName: book.name })}
                  >
                    <QrCode className="w-4 h-4 text-[#D32F2F]" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center py-2">
            {selectedBranch ? `${selectedBranch}下暂无桌号` : '暂无桌号，请先批量生成'}
          </p>
        )}
      </div>

      {qrModal && <QRCodeModal {...qrModal} onClose={() => setQrModal(null)} />}
    </div>
  );
}

// ===== 意见本卡片 =====
function BookCard({
  book,
}: {
  book: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { data: branches } = trpc.opinionBook.getBranches.useQuery({ bookId: book.id });

  const hasBranches = branches && branches.length > 0;

  return (
    <Card className="overflow-hidden">
      {/* 卡片头部 */}
      <div className="p-4">
        {/* 第一行：图标+名称 / 分店切换 */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Gem className="w-4 h-4 text-[#CBA471] flex-shrink-0" strokeWidth={2} />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm leading-tight truncate">{book.name}</p>
              {book.store_name && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">{book.store_name}</p>
              )}
            </div>
          </div>
          {/* 右上角：分店切换（有分店时显示） */}
          {hasBranches && (
            <BranchSelector
              branches={branches}
              selectedBranch={selectedBranch}
              onSelect={setSelectedBranch}
            />
          )}
        </div>

        {/* 第二行：统计信息 */}
        <p className="text-xs text-gray-400 mb-3">
          共 <span className="text-gray-600 font-medium">{book.entry_count}</span> 条意见
          {selectedBranch && <span className="text-[#D32F2F] ml-1">· {selectedBranch}</span>}
          <span className="mx-1">·</span>
          {new Date(book.created_at).toLocaleDateString('zh-CN')}
        </p>

        {/* 第三行：操作按钮 */}
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            className="text-xs h-8 flex-1"
            onClick={() => setLocation(`/opinion/${book.id}`)}
          >
            <Eye className="w-3 h-3 mr-1" />
            查看意见
            {book.entry_count > 0 && (
              <span className="ml-1.5 bg-[#D32F2F] text-white text-xs rounded-full px-1.5 leading-4 inline-block">{book.entry_count}</span>
            )}
          </Button>
          <Button
            variant="outline" size="sm"
            className="text-xs h-8 flex-1"
            onClick={() => setExpanded(!expanded)}
          >
            <Building2 className="w-3 h-3 mr-1" />
            分店/桌号
            {expanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
          </Button>
        </div>
      </div>

      {expanded && <TableManager book={book} selectedBranch={selectedBranch} />}
    </Card>
  );
}

// ===== 主页面 =====
export default function CustomABManager() {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStoreName, setNewStoreName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [, setLocation] = useLocation();

  const utils = trpc.useUtils();
  const { data: books, isLoading } = trpc.opinionBook.list.useQuery();

  const createMutation = trpc.opinionBook.create.useMutation({
    onSuccess: () => {
      toast.success("意见本创建成功");
      setShowCreate(false);
      setNewName(""); setNewStoreName(""); setNewDesc("");
      utils.opinionBook.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {/* 标题卡片 */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <Gem className="w-5 h-5 text-[#CBA471] flex-shrink-0" strokeWidth={2} />
            <div className="min-w-0">
              <h2 className="font-bold text-sm leading-tight">定制账本 (AB)</h2>
              <p className="text-xs text-gray-400 leading-tight">客户想要 老板知道</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="flex items-center gap-0.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"
            >
              <Lightbulb className="w-3 h-3" />
              场景说明
              {showGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <Button
              size="sm"
              className="bg-[#D32F2F] hover:bg-red-700 text-white h-8"
              onClick={() => setShowCreate(!showCreate)}
            >
              <Plus className="w-4 h-4 mr-1" />
              新建
            </Button>
          </div>
        </div>

        <p className="text-xs text-gray-400">扫码免注册提意见，适用于餐厅、连锁门店等场景</p>

        {showGuide && (
          <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-100 text-xs text-amber-700 space-y-1.5">
            <p><span className="font-semibold">典型场景：</span>连锁餐厅老板创建一个意见本，添加多个分店，每个分店下批量生成桌号二维码，顾客扫码免注册即可留言。</p>
            <p><span className="font-semibold">操作流程：</span>创建意见本 → 展开「分店/桌号」→ 添加分店 → 各分店下批量生成桌号 → 下载二维码贴桌上 → 实时查看反馈</p>
            <p><span className="font-semibold">推广话术：</span><span className="italic">"客户想要，老板知道。扫码3秒留言，实时收到每一桌的心声。"</span></p>
          </div>
        )}

        {/* 新建表单 */}
        {showCreate && (
          <div className="mt-4 space-y-3 border-t pt-4">
            <div>
              <Label className="text-xs text-gray-600">意见本名称 *</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="如：红品会连锁餐厅" className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-gray-600">品牌名称（顾客扫码后看到）</Label>
              <Input value={newStoreName} onChange={e => setNewStoreName(e.target.value)} placeholder="如：红品会" className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-gray-600">描述（可选）</Label>
              <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="如：欢迎您的宝贵意见" className="mt-1 h-9 text-sm" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowCreate(false)}>取消</Button>
              <Button
                size="sm"
                className="flex-1 bg-[#D32F2F] hover:bg-red-700 text-white"
                disabled={createMutation.isPending || !newName.trim()}
                onClick={() => createMutation.mutate({ name: newName.trim(), storeName: newStoreName.trim() || undefined, description: newDesc.trim() || undefined })}
              >
                {createMutation.isPending ? "创建中..." : "创建"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 意见本列表 */}
      {isLoading ? (
        <div className="text-center py-6 text-gray-400 text-sm">加载中...</div>
      ) : !books?.length ? (
        <Card className="p-6 text-center text-gray-400">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">暂无意见本，点击上方「新建」开始</p>
        </Card>
      ) : (
        books.map((book: any) => (
          <BookCard
            key={book.id}
            book={book}
          />
        ))
      )}
    </div>
  );
}
