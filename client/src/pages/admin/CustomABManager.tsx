import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Plus, MessageSquare, QrCode, Star, ChevronDown, ChevronUp,
  Store, Table2, Eye, RefreshCw, Lightbulb, ArrowLeft
} from "lucide-react";
import QRCode from "qrcode";

// ScenarioGuide 已内联到主卡片标题行

// ===== 二维码生成弹窗 =====
function QRCodeModal({
  bookId, tableId, tableCode, storeName, bookName, onClose
}: {
  bookId: number; tableId: number; tableCode: string;
  storeName?: string; bookName: string; onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const url = `${window.location.origin}/feedback/${bookId}/${tableId}`;

  useState(() => {
    QRCode.toDataURL(url, { width: 300, margin: 2, color: { dark: '#1a1a1a', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(console.error);
  });

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `意见二维码-${storeName || bookName}-${tableCode}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-xs w-full" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-center text-gray-800 mb-1">{storeName || bookName}</h3>
        <p className="text-center text-gray-500 text-sm mb-4">桌号：{tableCode}</p>
        {qrDataUrl ? (
          <div className="flex flex-col items-center gap-4">
            <img src={qrDataUrl} alt="QR Code" className="w-48 h-48 rounded-lg border" />
            <p className="text-xs text-gray-400 text-center break-all">{url}</p>
            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1 text-sm" onClick={onClose}>关闭</Button>
              <Button className="flex-1 text-sm bg-[#D32F2F] hover:bg-red-700 text-white" onClick={handleDownload}>
                下载二维码
              </Button>
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

      {/* 桌号筛选 */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => { setSelectedTableId(undefined); setPage(1); }}
          className={`px-3 py-1 rounded-full text-xs border transition-colors ${!selectedTableId ? 'bg-[#D32F2F] text-white border-[#D32F2F]' : 'bg-white text-gray-600 border-gray-200'}`}
        >
          全部
        </button>
        {tables?.map((t: any) => (
          <button
            key={t.id}
            onClick={() => { setSelectedTableId(t.id); setPage(1); }}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${selectedTableId === t.id ? 'bg-[#D32F2F] text-white border-[#D32F2F]' : 'bg-white text-gray-600 border-gray-200'}`}
          >
            {t.table_code} ({t.entry_count})
          </button>
        ))}
      </div>

      {/* 意见列表 */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-400">加载中...</div>
      ) : !entriesData?.entries.length ? (
        <div className="text-center py-8 text-gray-400">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">暂无意见</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entriesData.entries.map((e: any) => (
            <Card key={e.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs px-1.5 py-0">{e.table_code}</Badge>
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
          {/* 分页 */}
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

// ===== 主页面 =====
export default function CustomABManager() {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStoreName, setNewStoreName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [expandedBookId, setExpandedBookId] = useState<number | null>(null);
  const [viewingEntriesBook, setViewingEntriesBook] = useState<{ id: number; name: string } | null>(null);
  const [qrModal, setQrModal] = useState<{ bookId: number; tableId: number; tableCode: string; storeName?: string; bookName: string } | null>(null);
  // 批量添加桌号
  const [batchPrefix, setBatchPrefix] = useState("");
  const [batchCount, setBatchCount] = useState("10");
  const [batchLocation, setBatchLocation] = useState("");

  const utils = trpc.useUtils();
  const { data: books, isLoading } = trpc.opinionBook.list.useQuery();
  const { data: tables } = trpc.opinionBook.getTables.useQuery(
    { bookId: expandedBookId! },
    { enabled: !!expandedBookId }
  );

  const createMutation = trpc.opinionBook.create.useMutation({
    onSuccess: () => {
      toast.success("意见本创建成功");
      setShowCreate(false);
      setNewName(""); setNewStoreName(""); setNewDesc("");
      utils.opinionBook.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const batchMutation = trpc.opinionBook.addTablesBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`成功添加 ${data.count} 个桌号`);
      setBatchPrefix(""); setBatchCount("10"); setBatchLocation("");
      utils.opinionBook.getTables.invalidate({ bookId: expandedBookId! });
    },
    onError: (e) => toast.error(e.message),
  });

  if (viewingEntriesBook) {
    return (
      <EntriesView
        bookId={viewingEntriesBook.id}
        bookName={viewingEntriesBook.name}
        onBack={() => setViewingEntriesBook(null)}
      />
    );
  }

  const [showGuide, setShowGuide] = useState(false);

  return (
    <div className="space-y-4">
      {/* 标题 + 新建按钮 */}
      <Card className="p-4">
        {/* 第一行：标题 + 新建按钮 */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="w-5 h-5 text-[#D32F2F] flex-shrink-0" />
            <h2 className="font-bold text-sm">定制账本 (AB) · 客户想要 老板知道</h2>
          </div>
          <Button
            size="sm"
            className="bg-[#D32F2F] hover:bg-red-700 text-white flex-shrink-0 ml-2"
            onClick={() => setShowCreate(!showCreate)}
          >
            <Plus className="w-4 h-4 mr-1" />
            新建
          </Button>
        </div>
        {/* 第二行：描述 + 场景说明按钮 */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-500">扫码免注册提意见，适用于餐厅、门店等场景</p>
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="flex items-center gap-0.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 flex-shrink-0 ml-2"
          >
            <Lightbulb className="w-3 h-3" />
            场景说明
            {showGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
        {/* 场景说明下拉（仅后台可见）*/}
        {showGuide && (
          <div className="mt-2 mb-3 p-3 bg-amber-50 rounded-lg border border-amber-100 text-xs text-amber-700 space-y-2">
            <p><span className="font-semibold">典型场景：</span>连锁餐厅老板在每张桌子上放置专属二维码，顾客用餐后扫码即可留下意见和评分。老板可实时查看所有门店、所有桌号的顾客反馈，无需顾客注册账号。</p>
            <p><span className="font-semibold">操作流程：</span>创建意见本 → 批量生成桌号 → 下载二维码贴桌上 → 顾客扫码免注册直接提意见 → 老板实时查看反馈</p>
            <p><span className="font-semibold">推广话术：</span><span className="italic">"客户想要，老板知道。扫码3秒留言，实时收到每一桌的心声。"</span></p>
          </div>
        )}
        <p className="text-xs text-gray-500">
          为每个门店/品牌创建意见本，生成桌号二维码，顾客扫码免注册即可留言。
        </p>

        {/* 新建表单 */}
        {showCreate && (
          <div className="mt-4 space-y-3 border-t pt-4">
            <div>
              <Label className="text-xs text-gray-600">意见本名称 *</Label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="如：红品会连锁餐厅"
                className="mt-1 h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600">门店/品牌名称（顾客扫码后看到）</Label>
              <Input
                value={newStoreName}
                onChange={e => setNewStoreName(e.target.value)}
                placeholder="如：红品会 · 朝阳店"
                className="mt-1 h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600">描述（可选）</Label>
              <Input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="如：欢迎您的宝贵意见"
                className="mt-1 h-9 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowCreate(false)}>取消</Button>
              <Button
                size="sm"
                className="flex-1 bg-[#D32F2F] hover:bg-red-700 text-white"
                disabled={createMutation.isPending}
                onClick={() => {
                  if (!newName.trim()) { toast.error("请填写意见本名称"); return; }
                  createMutation.mutate({ name: newName.trim(), storeName: newStoreName.trim() || undefined, description: newDesc.trim() || undefined });
                }}
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
          <p className="text-sm">暂无意见本，点击上方「新建意见本」开始</p>
        </Card>
      ) : (
        books.map((book: any) => (
          <Card key={book.id} className="overflow-hidden">
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-[#D32F2F]" />
                    <span className="font-semibold text-sm">{book.name}</span>
                    {book.store_name && <span className="text-xs text-gray-400">· {book.store_name}</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    ID: {book.id} · 共 {book.entry_count} 条意见 · 创建于 {new Date(book.created_at).toLocaleDateString('zh-CN')}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => setViewingEntriesBook({ id: book.id, name: book.name })}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    查看意见
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => setExpandedBookId(expandedBookId === book.id ? null : book.id)}
                  >
                    <Table2 className="w-3 h-3 mr-1" />
                    桌号管理
                    {expandedBookId === book.id ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                  </Button>
                </div>
              </div>
            </div>

            {/* 桌号管理展开区 */}
            {expandedBookId === book.id && (
              <div className="border-t bg-gray-50 p-4 space-y-3">
                {/* 批量添加桌号 */}
                <div className="bg-white rounded-lg p-3 border">
                  <p className="text-xs font-semibold text-gray-700 mb-2">批量生成桌号</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs text-gray-500">前缀</Label>
                      <Input
                        value={batchPrefix}
                        onChange={e => setBatchPrefix(e.target.value)}
                        placeholder="如 A"
                        className="h-8 text-xs mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">数量</Label>
                      <Input
                        type="number"
                        value={batchCount}
                        onChange={e => setBatchCount(e.target.value)}
                        placeholder="10"
                        className="h-8 text-xs mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">位置描述</Label>
                      <Input
                        value={batchLocation}
                        onChange={e => setBatchLocation(e.target.value)}
                        placeholder="如 一楼大厅"
                        className="h-8 text-xs mt-1"
                      />
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
                      batchMutation.mutate({ bookId: book.id, prefix: batchPrefix, count, location: batchLocation || undefined });
                    }}
                  >
                    {batchMutation.isPending ? "生成中..." : `批量生成 ${batchCount || 10} 个桌号二维码`}
                  </Button>
                </div>

                {/* 桌号列表 */}
                {tables && tables.length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-2">已有桌号（{tables.length} 个）</p>
                    <div className="grid grid-cols-2 gap-2">
                      {tables.map((t: any) => (
                        <div key={t.id} className="bg-white border rounded-lg p-2 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{t.table_code}</p>
                            <p className="text-xs text-gray-400">{t.location || '未设位置'} · {t.entry_count}条</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => setQrModal({ bookId: book.id, tableId: t.id, tableCode: t.table_code, storeName: book.store_name, bookName: book.name })}
                          >
                            <QrCode className="w-4 h-4 text-[#D32F2F]" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-2">暂无桌号，请先批量生成</p>
                )}
              </div>
            )}
          </Card>
        ))
      )}

      {/* 二维码弹窗 */}
      {qrModal && (
        <QRCodeModal
          {...qrModal}
          onClose={() => setQrModal(null)}
        />
      )}
    </div>
  );
}
