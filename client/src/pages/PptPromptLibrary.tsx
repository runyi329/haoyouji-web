import { useState, useMemo } from 'react';
import { useLocation, useParams } from 'wouter';
import { ChevronLeft, Plus, X, Check, ClipboardCopy, Pencil, FolderPlus, ShoppingCart, Trash2, FileText } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';

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
  const updatePromptMutation = trpc.beauty.aiPrompts.update.useMutation({
    onSuccess: () => utils.beauty.aiPrompts.list.invalidate(),
  });

  const categories = categoriesQuery.data || [];
  const allPrompts = promptsQuery.data || [];

  // 当前选中的分类tab（默认选中第一个分类）
  const firstCatId = categories.length > 0 ? categories[0].id : null;
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  // 如果还没选过分类且分类已加载，默认选第一个
  const effectiveCategoryId = activeCategoryId !== null ? activeCategoryId : firstCatId;
  // 编辑模式
  const [editMode, setEditMode] = useState(false);
  // 全局多选（购物车）- 跨分类保留
  const [selected, setSelected] = useState<number[]>([]);
  // 复制状态
  const [copied, setCopied] = useState(false);

  // 新增分类弹窗
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  // 重命名分类
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // 新增提示词
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [newPromptContent, setNewPromptContent] = useState('');
  const [newPromptRemark, setNewPromptRemark] = useState('');
  // 编辑提示词弹窗
  const [editingPrompt, setEditingPrompt] = useState<{ id: number; content: string; remark: string | null } | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editRemark, setEditRemark] = useState('');

  // 当前分类下的提示词
  const filteredPrompts = effectiveCategoryId === null
    ? allPrompts
    : allPrompts.filter(p => p.categoryId === effectiveCategoryId);

  // 购物车：按固定顺序归组（角色→全局→逻辑→禁忌→任务）
  const CART_ORDER = ['角色', '全局', '逻辑', '禁忌', '任务'];
  const cartGroups = useMemo(() => {
    const selectedPrompts = allPrompts.filter(p => selected.includes(p.id));
    if (selectedPrompts.length === 0) return [];

    // 先按categoryId分组
    const groupMap = new Map<number, { name: string; items: typeof selectedPrompts }>();
    for (const p of selectedPrompts) {
      const catId = p.categoryId || 0;
      if (!groupMap.has(catId)) {
        const cat = categories.find(c => c.id === catId);
        groupMap.set(catId, { name: cat ? cat.name : '未分类', items: [] });
      }
      groupMap.get(catId)!.items.push(p);
    }

    // 按固定顺序排列
    const result: { catId: number; name: string; items: typeof selectedPrompts }[] = [];
    for (const orderName of CART_ORDER) {
      const cat = categories.find(c => c.name === orderName);
      if (cat) {
        const group = groupMap.get(cat.id);
        if (group) {
          result.push({ catId: cat.id, name: group.name, items: group.items });
          groupMap.delete(cat.id);
        }
      }
    }
    // 剩余不在固定顺序中的分类追加到末尾
    for (const [catId, group] of groupMap) {
      result.push({ catId, name: group.name, items: group.items });
    }

    return result;
  }, [selected, allPrompts, categories]);

  // 获取显示文本：有备注显示备注，无备注显示标签内容
  const getDisplayText = (prompt: { content: string; remark?: string | null }) => {
    return prompt.remark?.trim() ? prompt.remark.trim() : prompt.content;
  };

  // 按分类智能拼接文本
  const joinByCategory = (name: string, texts: string[]) => {
    if (texts.length === 0) return '';
    if (texts.length === 1) return `【${name}】\n${texts[0]}`;
    switch (name) {
      case '角色':
        // 角色类：用“同时也是”融合多重身份
        return `【${name}】\n${texts[0]}，同时也是${texts.slice(1).join('，并且是')}。`;
      case '全局':
        // 全局类：逐条序号，保持独立约束
        return `【${name}】\n${texts.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
      case '逻辑':
        // 逻辑类：用分号连接
        return `【${name}】\n在逻辑上需要注意：${texts.join('；')}。`;
      case '禁忌':
        // 禁忌类：用否定词串联
        return `【${name}】\n严禁${texts.join('；不得')}。`;
      case '任务':
        // 任务类：逐条换行，保持任务独立性
        return `【${name}】\n${texts.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
      default:
        return `【${name}】\n${texts.join('\n')}`;
    }
  };

  // 购物车合并文本（按分类智能拼接）
  const mergedText = useMemo(() => {
    if (cartGroups.length === 0) return '';
    return cartGroups
      .map(g => joinByCategory(g.name, g.items.map(p => getDisplayText(p))))
      .join('\n\n');
  }, [cartGroups]);

  const handleToggle = (id: number) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleCartRemove = (id: number) => {
    setSelected(prev => prev.filter(x => x !== id));
  };

  const handleCopy = () => {
    if (!mergedText) return;
    navigator.clipboard.writeText(mergedText).then(() => {
      setCopied(true);
      toast.success('已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      await addCategoryMutation.mutateAsync({ name });
      setNewCategoryName('');
      setShowAddCategoryModal(false);
      toast.success('分类已添加');
    } catch (e: any) {
      console.error('添加分类失败', e);
      toast.error(e?.message || '添加分类失败，请重试');
    }
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
    const categoryId = effectiveCategoryId || 0;
    const remark = newPromptRemark.trim() || undefined;
    await addPromptMutation.mutateAsync({ content, categoryId, remark });
    setNewPromptContent('');
    setNewPromptRemark('');
    setShowAddPrompt(false);
  };

  const handleDeletePrompt = async (id: number) => {
    await deletePromptMutation.mutateAsync({ id });
    setSelected(prev => prev.filter(x => x !== id));
  };

  const handleOpenEdit = (prompt: { id: number; content: string; remark?: string | null }) => {
    setEditingPrompt({ id: prompt.id, content: prompt.content, remark: prompt.remark || null });
    setEditContent(prompt.content);
    setEditRemark(prompt.remark || '');
  };

  const handleSaveEdit = async () => {
    if (!editingPrompt) return;
    const content = editContent.trim();
    if (!content) return;
    try {
      await updatePromptMutation.mutateAsync({
        id: editingPrompt.id,
        content,
        remark: editRemark.trim() || null,
      });
      setEditingPrompt(null);
      toast.success('已保存');
    } catch (e: any) {
      toast.error(e?.message || '保存失败');
    }
  };

  // 分类标签列表（只显示用户自建的分类）
  const tabList = categories.map(c => ({ id: c.id, name: c.name }));

  const getTabSelectedCount = (tabId: number | null) => {
    if (tabId === null) return selected.length;
    const prompts = allPrompts.filter(p => p.categoryId === tabId);
    return prompts.filter(p => selected.includes(p.id)).length;
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* 顶部导航 */}
      <div className="shrink-0 bg-white border-b border-gray-100 px-3 py-2.5 flex items-center gap-2 z-20">
        <button
          onClick={() => setLocation(ledgerId ? `/ledger/${ledgerId}/ppt-guide` : '/ppt-guide')}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 shrink-0"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-sm font-semibold text-gray-900">提示词库</h1>
          <p className="text-xs text-gray-400">
            共 {allPrompts.length} 条提示词{selected.length > 0 ? ` · 已选 ${selected.length} 条` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAuthenticated && (
            <button
              onClick={() => setShowAddCategoryModal(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 border border-blue-200 text-blue-500"
            >
              <FolderPlus className="w-3 h-3" />
              新增分类
            </button>
          )}
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
        </div>
      </div>

      {/* 分类标签栏 */}
      <div className="shrink-0 bg-white border-b border-gray-100 z-10">
        <div className="flex items-center gap-0 overflow-x-auto scrollbar-none px-3 py-2">
          {tabList.map(tab => {
            const count = getTabSelectedCount(tab.id);
            return (
              <button
                key={String(tab.id)}
                onClick={() => !editMode && setActiveCategoryId(tab.id)}
                className={`shrink-0 relative flex items-center gap-1 px-3 py-1 mr-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                  effectiveCategoryId === tab.id
                    ? 'text-white'
                    : 'bg-gray-100 text-gray-500'
                }`}
                style={effectiveCategoryId === tab.id ? { background: 'linear-gradient(135deg, #E91E63 0%, #F06292 100%)' } : {}}
              >
                {editMode && renamingId === tab.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename(tab.id as number);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onBlur={() => handleRename(tab.id as number)}
                    className="w-16 text-xs border-b border-pink-300 bg-transparent outline-none text-gray-800"
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span>{tab.name}</span>
                )}
                {count > 0 && !editMode && tab.id !== null && (
                  <span className="ml-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-[10px] font-bold bg-pink-500 text-white">
                    {count}
                  </span>
                )}
                {editMode && tab.id !== null && renamingId !== tab.id && (
                  <>
                    <span
                      onClick={e => {
                        e.stopPropagation();
                        setRenamingId(tab.id as number);
                        setRenameValue(tab.name);
                      }}
                      className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-black/10 hover:bg-blue-400 hover:text-white cursor-pointer"
                    >
                      <Pencil className="w-2 h-2" />
                    </span>
                    <span
                      onClick={e => { e.stopPropagation(); handleDeleteCategory(tab.id as number); }}
                      className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-black/10 hover:bg-red-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-2.5 h-2.5" />
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 上半部分：提示词标签区（可滚动） */}
      <div className="overflow-y-auto px-3 pt-3 pb-3" style={{ flex: selected.length > 0 ? '2 1 0%' : '1 1 0%' }}>
        {/* 新增提示词按钮 */}
        {isAuthenticated && (
          <div className="mb-2">
            {!showAddPrompt ? (
              <button
                onClick={() => setShowAddPrompt(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-pink-50 text-pink-400 border border-dashed border-pink-200"
              >
                <Plus className="w-3 h-3" />
                添加提示词{effectiveCategoryId ? '（到当前分类）' : ''}
              </button>
            ) : (
              <div className="bg-white rounded-xl border border-pink-100 p-3 mb-2">
                <p className="text-xs text-gray-400 mb-1.5">
                  添加到：
                  <span className="text-pink-500 font-medium ml-1">
                    {effectiveCategoryId ? (categories.find(c => c.id === effectiveCategoryId)?.name || '未知分类') : '未分类'}
                  </span>
                </p>
                <input
                  autoFocus
                  value={newPromptContent}
                  onChange={e => setNewPromptContent(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 outline-none focus:border-pink-300 mb-2"
                  placeholder="标签名称（简短，如：专业摄影师）"
                />
                <textarea
                  value={newPromptRemark}
                  onChange={e => setNewPromptRemark(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 outline-none focus:border-pink-300 resize-none"
                  placeholder="备注（可选，详细描述文本。留空则使用标签名称作为输出内容）"
                  rows={3}
                />
                <div className="flex gap-2 mt-2">
                  <button onClick={handleAddPrompt} className="px-4 py-1.5 rounded-lg text-xs text-white" style={{ background: '#E91E63' }}>添加</button>
                  <button onClick={() => { setShowAddPrompt(false); setNewPromptContent(''); setNewPromptRemark(''); }} className="px-4 py-1.5 rounded-lg text-xs bg-gray-100 text-gray-500">取消</button>
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
              const hasRemark = !!prompt.remark?.trim();
              return (
                <div
                  key={prompt.id}
                  onClick={() => !editMode && handleToggle(prompt.id)}
                  className={`relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs leading-relaxed cursor-pointer transition-all select-none max-w-full ${
                    isSelected
                      ? 'text-white shadow-sm'
                      : 'bg-white text-gray-600 border border-gray-200'
                  }`}
                  style={isSelected ? { background: 'linear-gradient(135deg, #E91E63 0%, #F06292 100%)' } : {}}
                >
                  <span className="break-all">{prompt.content}</span>
                  {/* 有备注的标识小图标 */}
                  {hasRemark && !editMode && (
                    <FileText className={`w-3 h-3 shrink-0 ${isSelected ? 'text-white/70' : 'text-pink-300'}`} />
                  )}
                  {editMode && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); handleOpenEdit(prompt); }}
                        className="w-4 h-4 flex items-center justify-center rounded-full bg-blue-400 text-white"
                      >
                        <Pencil className="w-2 h-2" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeletePrompt(prompt.id); }}
                        className="w-4 h-4 flex items-center justify-center rounded-full bg-red-400 text-white"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
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

      {/* 下半部分：购物车汇总框（纯文本显示，固定底部） */}
      {selected.length > 0 && (
        <div className="shrink-0 bg-white border-t-2 border-pink-100 flex flex-col" style={{ height: '35vh' }}>
          {/* 购物车标题栏 */}
          <div className="shrink-0 flex items-center justify-between px-3 pt-2.5 pb-1.5">
            <div className="flex items-center gap-1.5">
              <ShoppingCart className="w-3.5 h-3.5 text-pink-500" />
              <span className="text-xs font-semibold text-gray-800">
                已选 {selected.length} 条
              </span>
              {cartGroups.length > 1 && (
                <span className="text-[10px] text-gray-400">
                  ({cartGroups.length} 个分类)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelected([])}
                className="text-[11px] text-gray-400 px-2 py-0.5 rounded-full hover:bg-gray-100"
              >
                清空
              </button>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-white"
                style={{ background: 'linear-gradient(135deg, #E91E63 0%, #F06292 100%)' }}
              >
                {copied ? <Check className="w-3 h-3" /> : <ClipboardCopy className="w-3 h-3" />}
                {copied ? '已复制' : '一键复制'}
              </button>
            </div>
          </div>

          {/* 购物车内容（纯文本，可滚动） */}
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {cartGroups.map(group => (
              <div key={group.catId} className="mb-2.5 last:mb-0">
                {/* 分类标题（始终显示） */}
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-white"
                    style={{ background: 'linear-gradient(135deg, #E91E63 0%, #F06292 100%)' }}
                  >
                    {group.name}
                  </span>
                  <span className="text-[10px] text-gray-300">{group.items.length} 条</span>
                </div>
                {/* 纯文本显示 */}
                <div className="space-y-1">
                  {group.items.map(item => (
                    <div
                      key={item.id}
                      className="flex items-start gap-1.5 group"
                    >
                      <div className="flex-1 text-xs text-gray-700 leading-relaxed">
                        {getDisplayText(item)}
                      </div>
                      <button
                        onClick={() => handleCartRemove(item.id)}
                        className="shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center rounded-full text-gray-300 hover:text-red-400 hover:bg-red-50"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 新增分类弹窗 */}
      {showAddCategoryModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setShowAddCategoryModal(false)}
        >
          <div
            className="w-full bg-white rounded-t-2xl px-4 pt-5 pb-8"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-900 mb-3">新增分类</h3>
            <p className="text-xs text-gray-400 mb-3">分类名称将显示在顶部标签栏，如：字体类、背景类、色调类</p>
            <input
              autoFocus
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-pink-300 mb-4"
              placeholder="输入分类名称，如：字体类"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowAddCategoryModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm bg-gray-100 text-gray-500"
              >
                取消
              </button>
              <button
                onClick={handleAddCategory}
                disabled={!newCategoryName.trim() || addCategoryMutation.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm text-white font-medium disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #E91E63 0%, #F06292 100%)' }}
              >
                {addCategoryMutation.isPending ? '添加中...' : '确认添加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑提示词弹窗 */}
      {editingPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setEditingPrompt(null)}
        >
          <div
            className="w-full bg-white rounded-t-2xl px-4 pt-5 pb-8"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-900 mb-3">编辑提示词</h3>

            <label className="text-xs text-gray-500 mb-1 block">标签名称</label>
            <input
              autoFocus
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-pink-300 mb-3"
              placeholder="标签名称（简短）"
            />

            <label className="text-xs text-gray-500 mb-1 block">
              备注
              <span className="text-gray-300 ml-1">（可选，有备注时购物车显示备注内容）</span>
            </label>
            <textarea
              value={editRemark}
              onChange={e => setEditRemark(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-pink-300 resize-none mb-4"
              placeholder="详细描述文本，留空则使用标签名称"
              rows={4}
            />

            <div className="flex gap-3">
              <button
                onClick={() => setEditingPrompt(null)}
                className="flex-1 py-2.5 rounded-xl text-sm bg-gray-100 text-gray-500"
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editContent.trim() || updatePromptMutation.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm text-white font-medium disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #E91E63 0%, #F06292 100%)' }}
              >
                {updatePromptMutation.isPending ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
