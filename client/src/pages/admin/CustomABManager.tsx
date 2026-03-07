/**
 * CustomABManager.tsx - AB 型定制账本（意见本）管理页面
 * 数据架构统一后：
 *   - 分店 → ledger_categories (type='branch')，用 id 标识
 *   - 意见记录 → ledger_records
 *   - 不再有 opinion_books/opinion_tables/opinion_entries 三张独立表
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Plus, MessageSquare, QrCode, Star, ChevronDown, ChevronUp,
  Store, Eye, RefreshCw, Lightbulb, ArrowLeft, Building2, Gem, Trash2
} from "lucide-react";
import QRCode from "qrcode";

// ===== 二维码生成弹窗 =====
// 新路由：/feedback/:ledgerId/:categoryId?
function QRCodeModal({
  ledgerId, categoryId, branchName, bookName, onClose
}: {
  ledgerId: number; categoryId?: number;
  branchName?: string; bookName: string; onClose: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const url = categoryId
    ? `${window.location.origin}/feedback/${ledgerId}/${categoryId}`
    : `${window.location.origin}/feedback/${ledgerId}`;
  useState(() => {
    QRCode.toDataURL(url, { width: 300, margin: 2, color: { dark: '#1a1a1a', light: '#ffffff' } })
      .then(setQrDataUrl).catch(console.error);
  });
  const displayName = branchName ? `${bookName} · ${branchName}` : bookName;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-xs w-full" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-center text-gray-800 mb-1">{displayName}</h3>
        <p className="text-center text-gray-500 text-sm mb-4">扫码提交意见</p>
        {qrDataUrl ? (
          <div className="flex flex-col items-center gap-4">
            <img src={qrDataUrl} alt="QR Code" className="w-48 h-48 rounded-lg border" />
            <p className="text-xs text-gray-400 text-center break-all">{url}</p>
            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1 text-sm" onClick={onClose}>关闭</Button>
              <Button className="flex-1 text-sm bg-[#D32F2F] hover:bg-red-700 text-white" onClick={() => {
                const a = document.createElement('a');
                a.href = qrDataUrl;
                a.download = `意见二维码-${displayName}.png`;
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
function EntriesView({ ledgerId, bookName, onBack }: { ledgerId: number; bookName: string; onBack: () => void }) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>();
  const [page, setPage] = useState(1);

  // 从通用分类接口读取分店列表（一级分类 = 分店）
  const { data: allCategories = [] } = trpc.ledger.getCategories.useQuery({ ledgerId });
  const branches = (allCategories as any[]).filter(
    (c: any) => c.parentId === null && !c.isDefault
  ).map((c: any) => ({ id: c.id, name: c.name, entry_count: 0 }));
  // 从 ledger_records 读取意见列表
  const { data: entriesData, isLoading, refetch } = trpc.opinionBook.getEntries.useQuery({
    ledgerId, categoryId: selectedCategoryId, page, pageSize: 20
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

      {/* 分店筛选标签（基于 ledger_categories.id） */}
      {branches.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => { setSelectedCategoryId(undefined); setPage(1); }}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-all ${!selectedCategoryId ? 'bg-[#D32F2F] text-white border-[#D32F2F]' : 'bg-white text-gray-600 border-gray-200'}`}
          >全部</button>
          {branches.map((b: any) => (
            <button
              key={b.id}
              onClick={() => { setSelectedCategoryId(b.id); setPage(1); }}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-all ${selectedCategoryId === b.id ? 'bg-[#D32F2F] text-white border-[#D32F2F]' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              {b.name}
              <span className={`ml-1 ${selectedCategoryId === b.id ? 'text-red-200' : 'text-gray-400'}`}>({b.entry_count})</span>
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
                    {e.branch_name && <span className="text-xs text-[#D32F2F] font-medium">{e.branch_name}</span>}
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

// ===== 分店管理展开区 =====
// 现在分店存储在 ledger_categories (type='branch')，用 id 标识
function BranchManager({ book }: { book: any }) {
  const [newBranchName, setNewBranchName] = useState("");
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [qrModal, setQrModal] = useState<any>(null);

  const utils = trpc.useUtils();

  // 从通用分类接口读取分店列表（一级分类 = 分店）
  const { data: allCategories = [] } = trpc.ledger.getCategories.useQuery({ ledgerId: book.id });
  const branches = (allCategories as any[]).filter(
    (c: any) => c.parentId === null && !c.isDefault
  ).map((c: any) => ({ id: c.id, name: c.name, entry_count: 0 }));

  // 添加分店（用通用 addCategory 接口）
  const addBranchMutation = trpc.ledger.addCategory.useMutation({
    onSuccess: () => {
      toast.success(`分店已添加`);
      setShowAddBranch(false);
      setNewBranchName("");
      utils.ledger.getCategories.invalidate({ ledgerId: book.id });
    },
    onError: (e) => toast.error(e.message),
  });

  // 删除分店（用通用 deleteCategory 接口）
  const deleteBranchMutation = trpc.ledger.deleteCategory.useMutation({
    onSuccess: () => {
      toast.success("分店已删除");
      utils.ledger.getCategories.invalidate({ ledgerId: book.id });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="border-t bg-gray-50 p-4 space-y-4">
      {/* 分店管理 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-[#D32F2F]" />
            <span className="text-xs font-semibold text-gray-700">分店管理</span>
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
              onKeyDown={e => {
                if (e.key === 'Enter' && newBranchName.trim()) {
                  addBranchMutation.mutate({ ledgerId: book.id, name: newBranchName.trim(), type: 'expense' as const, icon: '📝', color: '#ef4444' });
                }
              }}
            />
            <Button
              size="sm"
              className="h-8 text-xs bg-[#D32F2F] hover:bg-red-700 text-white px-3"
              disabled={addBranchMutation.isPending}
              onClick={() => {
                if (!newBranchName.trim()) { toast.error("请输入分店名称"); return; }
                addBranchMutation.mutate({ ledgerId: book.id, name: newBranchName.trim(), type: 'expense' as const, icon: '📝', color: '#ef4444' });
              }}
            >确认</Button>
            <Button variant="outline" size="sm" className="h-8 text-xs px-3"
              onClick={() => { setShowAddBranch(false); setNewBranchName(""); }}>取消</Button>
          </div>
        )}

        {/* 分店列表 */}
        {branches.length > 0 ? (
          <div className="space-y-2">
            {branches.map((b: any) => (
              <div key={b.id} className="bg-white border rounded-lg p-3 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{b.name}</p>
                  <p className="text-xs text-gray-400">{b.entry_count} 条意见</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* 生成分店二维码 */}
                  <Button
                    variant="ghost" size="sm" className="h-7 w-7 p-0"
                    onClick={() => setQrModal({ ledgerId: book.id, categoryId: b.id, branchName: b.name, bookName: book.name })}
                    title="生成分店二维码"
                  >
                    <QrCode className="w-4 h-4 text-[#D32F2F]" />
                  </Button>
                  {/* 删除分店 */}
                  <Button
                    variant="ghost" size="sm" className="h-7 w-7 p-0"
                    onClick={() => {
                      if (b.entry_count > 0) {
                        toast.error(`该分店有 ${b.entry_count} 条意见，无法删除`);
                        return;
                      }
                      if (confirm(`确定删除分店「${b.name}」？`)) {
                        deleteBranchMutation.mutate({ categoryId: b.id, cascade: true });
                      }
                    }}
                    title="删除分店"
                  >
                    <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center py-2">暂无分店，点击「新增分店」添加</p>
        )}

        {/* 整个意见本的二维码（不区分分店） */}
        <div className="mt-3 pt-3 border-t">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">整店通用二维码（不区分分店）</span>
            <Button
              variant="outline" size="sm" className="h-7 text-xs"
              onClick={() => setQrModal({ ledgerId: book.id, bookName: book.name })}
            >
              <QrCode className="w-3 h-3 mr-1" />
              生成
            </Button>
          </div>
        </div>
      </div>

      {qrModal && <QRCodeModal {...qrModal} onClose={() => setQrModal(null)} />}
    </div>
  );
}

// ===== 意见本卡片 =====
function BookCard({ book }: { book: any }) {
  const [expanded, setExpanded] = useState(false);
  const [showEntries, setShowEntries] = useState(false);
  const [, setLocation] = useLocation();

  if (showEntries) {
    return (
      <Card className="overflow-hidden p-4">
        <EntriesView
          ledgerId={book.id}
          bookName={book.name}
          onBack={() => setShowEntries(false)}
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* 卡片头部 */}
      <div className="p-4">
        {/* 第一行：图标+名称 */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Gem className="w-4 h-4 text-[#CBA471] flex-shrink-0" strokeWidth={2} />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm leading-tight truncate">{book.name}</p>
            </div>
          </div>
        </div>

        {/* 第二行：统计信息 */}
        <p className="text-xs text-gray-400 mb-3">
          共 <span className="text-gray-600 font-medium">{book.entry_count}</span> 条意见
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
            分店管理
            {expanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
          </Button>
        </div>
      </div>

      {expanded && <BranchManager book={book} />}
    </Card>
  );
}

// ===== 主页面 =====
export default function CustomABManager() {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [showGuide, setShowGuide] = useState(false);

  const utils = trpc.useUtils();
  const { data: books, isLoading } = trpc.opinionBook.list.useQuery();

  const createMutation = trpc.opinionBook.create.useMutation({
    onSuccess: () => {
      toast.success("意见本创建成功");
      setShowCreate(false);
      setNewName(""); setNewDesc("");
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
          <div className="mt-3 pt-3 border-t text-xs text-gray-600 space-y-1.5 leading-relaxed">
            <p><span className="font-semibold">典型场景：</span>连锁餐厅老板创建一个意见本，添加多个分店，每个分店生成二维码，顾客扫码免注册即可留言。</p>
            <p><span className="font-semibold">操作流程：</span>创建意见本 → 展开「分店管理」→ 添加分店 → 为各分店生成二维码 → 下载二维码贴门口 → 实时查看反馈</p>
            <p><span className="font-semibold">推广话术：</span><span className="italic">"客户想要，老板知道。扫码3秒留言，实时收到每一家店的心声。"</span></p>
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
              <Label className="text-xs text-gray-600">描述（可选）</Label>
              <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="如：欢迎您的宝贵意见" className="mt-1 h-9 text-sm" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowCreate(false)}>取消</Button>
              <Button
                size="sm"
                className="flex-1 bg-[#D32F2F] hover:bg-red-700 text-white"
                disabled={createMutation.isPending || !newName.trim()}
                onClick={() => createMutation.mutate({ name: newName.trim(), description: newDesc.trim() || undefined })}
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
