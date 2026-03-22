import { useState, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import { ChevronLeft, Plus, X, Check, ClipboardCopy, Pencil } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';

export default function PptPromptLibrary() {
  const [, setLocation] = useLocation();
  const params = useParams() as { id?: string };
  const ledgerId = params.id;
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  // 分类数据
  const categoriesQuery = trpc.beauty.aiPrompts.categories.list.useQuery();
  const promptsQuery = trpc.beauty.aiPrompts.list.useQuery();
  const addCategoryMutation = trpc.beauty.aiPrompts.categories.add.useMutation({
    onSuccess: () => utils.beauty.aiPrompts.categories.list.invalidate(),
  });
  const renameCategoryMutation = trpc.beauty.aiPrompts.categories.rename.useMutation({
    onSuccess: () => utils.beauty.aiPrompts.categories.list.invalidate(),
  });
  const deleteCategoryMutation = trpc.beauty.aiPrompts.categories.delete.useMutation({
    onSuccess: () => {
      utils.beauty.aiPrompts.categories.list.invalidate();
      utils.beauty.aiPrompts.list.invalidate();
    },
  });
  const addPromptMutation = trpc.beauty.aiPrompts.add.useMutation({
    onSuccess: () => utils.beauty.aiPrompts.list.invalidate(),
  });
  const deletePromptMutation = trpc.beauty.aiPrompts.delete.useMutation({
    onSuccess: () => utils.beauty.aiPrompts.list.invalidate(),
  });

  const categories = categoriesQuery.data || [];
  const allPrompts = promptsQuery.data || [];

  // 当前选中的分类（null = 全部，0 = 未分类）
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  // 编辑模式
  const [editMode, setEditMode] = useState(false);
  // 多选
  const [selected, setSelected] = useState<number[]>([]);
  // 复制状态
  const [copied, setCopied] = useState(false);

  // 新增分类
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  // 重命名分类
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // 新增提示词
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [newPromptContent, setNewPromptContent] = useState('');

  // 当前分类下的提示词
  const filteredPrompts = activeCategoryId === null
    ? allPrompts
    : activeCategoryId === 0
      ? allPrompts.filter(p => !p.categoryId || p.categoryId === 0)
      : allPrompts.filter(p => p.categoryId === activeCategoryId);

  // 合并文本
  const mergedText = allPrompts
    .filter(p => selected.includes(p.id))
    .map(p => p.content)
    .join('\n\n');

  const handleToggle = (id: number) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleCopy = () => {
    if (!mergedText) return;
    navigator.clipboard.writeText(mergedText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    await addCategoryMutation.mutateAsync({ name });
    setNewCategoryName('');
    setShowAddCategory(false);
  };

  const handleRename = async (id: number) => {
    const name = renameValue.trim();
    if (!name) return;
    await renameCategoryMutation.mutateAsync({ id, name });
    setRenamingId(null);
    setRenameValue('');
  };

  const handleDeleteCategory = async (id: number) => {
    await deleteCategoryMutation.mutateAsync({ id });
    if (activeCategoryId === id) setActiveCategoryId(null);
  };

  const handleAddPrompt = async () => {
    const content = newPromptContent.trim();
    if (!content) return;
    const categoryId = activeCategoryId === null || activeCategoryId === 0 ? 0 : activeCategoryId;
    await addPromptMutation.mutateAsync({ content, categoryId });
    setNewPromptContent('');
    setShowAddPrompt(false);
  };

  const handleDeletePrompt = async (id: number) => {
    await deletePromptMutation.mutateAsync({ id });
    setSelected(prev => prev.filter(x => x !== id));
  };

  // 分类标签列表（全部 + 各分类 + 未分类）
  const tabList = [
    { id: null, name: '全部' },
    ...categories.map(c => ({ id: c.id, name: c.name })),
    { id: 0, name: '未分类' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-3 py-2.5 flex items-center gap-2">
        <button
          onClick={() => setLocation(ledgerId ? `/ledger/${ledgerId}/ppt-guide` : -1 as any)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 shrink-0"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-sm font-semibold text-gray-900">提示词库</h1>
          <p className="text-xs text-gray-400">已选 {selected.length} 条</p>
        </div>
        <div className="flex items-center gap-2">
          {isAuthenticated && (
            <button
              onClick={() => setEditMode(v => !v)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                editMode
                  ? 'bg-red-50 border-red-200 text-red-500'
                  : 'bg-gray-50 border-gray-200 text-gray-500'
              }`}
            >
              {editMode ? '完成' : '编辑'}
            </button>
          )}
          {selected.length > 0 && (
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ background: 'linear-gradient(135deg, #FCE4EC 0%, #F8BBD0 100%)', color: '#E91E63' }}
            >
              {copied ? <Check className="w-3 h-3" /> : <ClipboardCopy className="w-3 h-3" />}
              {copied ? '已复制' : '复制'}
            </button>
          )}
        </div>
      </div>

      {/* 分类标签栏 */}
      <div className="sticky top-[52px] z-10 bg-white border-b border-gray-100">
        <div className="flex items-center gap-0 overflow-x-auto scrollbar-none px-3 py-2">
          {tabList.map(tab => (
            <button
              key={String(tab.id)}
              onClick={() => setActiveCategoryId(tab.id)}
              className={`shrink-0 flex items-center gap-1 px-3 py-1 mr-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                activeCategoryId === tab.id
                  ? 'text-white'
                  : 'bg-gray-100 text-gray-500'
              }`}
              style={activeCategoryId === tab.id ? { background: 'linear-gradient(135deg, #E91E63 0%, #F06292 100%)' } : {}}
            >
              {tab.name}
              {editMode && tab.id !== null && tab.id !== 0 && (
                <span
                  onClick={e => { e.stopPropagation(); handleDeleteCategory(tab.id as number); }}
                  className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-white/30 hover:bg-white/50"
                >
                  <X className="w-2.5 h-2.5" />
                </span>
              )}
              {editMode && tab.id !== null && tab.id !== 0 && (
                <span
                  onClick={e => {
                    e.stopPropagation();
                    setRenamingId(tab.id as number);
                    setRenameValue(tab.name);
                  }}
                  className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-white/30 hover:bg-white/50"
                >
                  <Pencil className="w-2 h-2" />
                </span>
              )}
            </button>
          ))}
          {/* 新增分类按钮 */}
          {isAuthenticated && editMode && (
            <button
              onClick={() => setShowAddCategory(true)}
              className="shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-pink-50 text-pink-400 border border-dashed border-pink-200 whitespace-nowrap"
            >
              <Plus className="w-3 h-3" />
              新增分类
            </button>
          )}
        </div>

        {/* 重命名输入框 */}
        {renamingId !== null && (
          <div className="px-3 pb-2 flex gap-2">
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRename(renamingId)}
              className="flex-1 text-xs border border-pink-200 rounded-lg px-2 py-1 outline-none focus:border-pink-400"
              placeholder="输入新名称"
            />
            <button onClick={() => handleRename(renamingId)} className="px-3 py-1 rounded-lg text-xs text-white" style={{ background: '#E91E63' }}>确定</button>
            <button onClick={() => setRenamingId(null)} className="px-3 py-1 rounded-lg text-xs bg-gray-100 text-gray-500">取消</button>
          </div>
        )}

        {/* 新增分类输入框 */}
        {showAddCategory && (
          <div className="px-3 pb-2 flex gap-2">
            <input
              autoFocus
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
              className="flex-1 text-xs border border-pink-200 rounded-lg px-2 py-1 outline-none focus:border-pink-400"
              placeholder="输入分类名称，如：字体类"
            />
            <button onClick={handleAddCategory} className="px-3 py-1 rounded-lg text-xs text-white" style={{ background: '#E91E63' }}>添加</button>
            <button onClick={() => setShowAddCategory(false)} className="px-3 py-1 rounded-lg text-xs bg-gray-100 text-gray-500">取消</button>
          </div>
        )}
      </div>

      {/* 提示词标签区域 */}
      <div className="flex-1 px-3 pt-3 pb-4">
        {/* 新增提示词按钮 */}
        {isAuthenticated && (
          <div className="mb-2">
            {!showAddPrompt ? (
              <button
                onClick={() => setShowAddPrompt(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-pink-50 text-pink-400 border border-dashed border-pink-200"
              >
                <Plus className="w-3 h-3" />
                添加提示词{activeCategoryId !== null && activeCategoryId !== 0 ? `（到当前分类）` : ''}
              </button>
            ) : (
              <div className="bg-white rounded-xl border border-pink-100 p-3 mb-2">
                <textarea
                  autoFocus
                  value={newPromptContent}
                  onChange={e => setNewPromptContent(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 outline-none focus:border-pink-300 resize-none"
                  placeholder="输入提示词内容（纯文字）..."
                  rows={3}
                />
                <div className="flex gap-2 mt-2">
                  <button onClick={handleAddPrompt} className="px-4 py-1.5 rounded-lg text-xs text-white" style={{ background: '#E91E63' }}>添加</button>
                  <button onClick={() => { setShowAddPrompt(false); setNewPromptContent(''); }} className="px-4 py-1.5 rounded-lg text-xs bg-gray-100 text-gray-500">取消</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 提示词标签列表 */}
        {filteredPrompts.length === 0 ? (
          <div className="text-center py-12 text-gray-300 text-xs">暂无提示词</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {filteredPrompts.map(prompt => {
              const isSelected = selected.includes(prompt.id);
              return (
                <div
                  key={prompt.id}
                  onClick={() => !editMode && handleToggle(prompt.id)}
                  className={`relative flex items-start gap-1 px-2.5 py-1.5 rounded-lg text-xs leading-relaxed cursor-pointer transition-all select-none ${
                    isSelected
                      ? 'text-white shadow-sm'
                      : 'bg-white text-gray-600 border border-gray-200'
                  }`}
                  style={isSelected ? { background: 'linear-gradient(135deg, #E91E63 0%, #F06292 100%)' } : {}}
                >
                  <span className="break-all">{prompt.content}</span>
                  {/* 编辑模式删除按钮 */}
                  {editMode && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDeletePrompt(prompt.id); }}
                      className="shrink-0 -mt-0.5 -mr-1 w-4 h-4 flex items-center justify-center rounded-full bg-red-400 text-white"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                  {/* 选中勾 */}
                  {isSelected && !editMode && (
                    <span className="shrink-0 -mt-0.5 -mr-1 w-4 h-4 flex items-center justify-center rounded-full bg-white/30">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 底部合并预览框（有选中时显示） */}
      {selected.length > 0 && (
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-3 pt-2 pb-4 shadow-lg">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-700">已选 {selected.length} 条 · 合并预览</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelected([])}
                className="text-xs text-gray-400"
              >
                清空
              </button>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-white"
                style={{ background: 'linear-gradient(135deg, #E91E63 0%, #F06292 100%)' }}
              >
                {copied ? <Check className="w-3 h-3" /> : <ClipboardCopy className="w-3 h-3" />}
                {copied ? '已复制！' : '一键复制'}
              </button>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl px-3 py-2 max-h-32 overflow-y-auto">
            <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{mergedText}</p>
          </div>
        </div>
      )}
    </div>
  );
}
