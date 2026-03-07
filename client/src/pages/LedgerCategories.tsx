import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Minus, ChevronRight, ChevronDown, Trash2, Store } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CategoryType = "expense" | "income";

interface Category {
  id: number;
  name: string;
  type: CategoryType;
  parentId: number | null;
  icon: string;
  color: string;
  sortOrder: number;
  isDefault: boolean;
  children?: Category[];
}

const LedgerCategories = () => {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategorySortOrder, setNewCategorySortOrder] = useState("1");
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<CategoryType>("expense");
  
  // 记录当前操作的一级分类ID和选择的操作类型
  const [currentCategoryId, setCurrentCategoryId] = useState<number | null>(null);
  const [selectedAction, setSelectedAction] = useState<'level1' | 'level2' | 'level3' | null>(null);
  const [showSubCategorySelect, setShowSubCategorySelect] = useState(false);
  
  // 展开/收起状态
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [expandedSubCategories, setExpandedSubCategories] = useState<Set<number>>(new Set());
  
  // 删除模式状态
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // 批量替换状态
  const [showReplaceDialog, setShowReplaceDialog] = useState(false);
  const [categoryToReplace, setCategoryToReplace] = useState<Category | null>(null);
  const [targetCategoryId, setTargetCategoryId] = useState<number | null>(null);
  const [affectedCount, setAffectedCount] = useState<number>(0);
  
  const toggleCategory = (categoryId: number) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };
  
  const toggleSubCategory = (subCategoryId: number) => {
    setExpandedSubCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(subCategoryId)) {
        newSet.delete(subCategoryId);
      } else {
        newSet.add(subCategoryId);
      }
      return newSet;
    });
  };

  // ─── 获取账本信息，判断是否是 opinion_book ─────────────────────────────────
  const { data: ledgerInfo } = trpc.ledger.getLedger.useQuery(
    { id: Number(id) },
    { enabled: Number(id) > 0 }
  );
  const isOpinionBook = (ledgerInfo as any)?.type === 'opinion_book';

  // 从后端API获取分类数据（收入和支出共享同一套分类）
  const { data: categoriesData, refetch: refetchCategories } = trpc.ledger.getCategories.useQuery({
    ledgerId: Number(id),
  });

  // 添加分类的mutation
  const addCategoryMutation = trpc.ledger.addCategory.useMutation({
    onSuccess: () => {
      toast.success("分类添加成功");
      refetchCategories();
    },
    onError: (error) => {
      toast.error(`添加失败: ${error.message}`);
    },
  });

  // 删除分类的mutation
  const deleteCategoryMutation = trpc.ledger.deleteCategory.useMutation({
    onSuccess: (data) => {
      toast.success(`删除成功，共删除${data.deletedCount}个分类`);
      refetchCategories();
      setShowDeleteConfirm(false);
      setCategoryToDelete(null);
    },
    onError: (error) => {
      toast.error(`删除失败: ${error.message}`);
    },
  });

  // 批量替换分类的mutation
  const replaceCategoryMutation = trpc.ledger.replaceCategory.useMutation({
    onSuccess: (data) => {
      toast.success(`替换成功，共修改${data.affectedCount}条记录`);
      refetchCategories();
      setShowReplaceDialog(false);
      setCategoryToReplace(null);
      setTargetCategoryId(null);
      setAffectedCount(0);
    },
    onError: (error) => {
      toast.error(`替换失败: ${error.message}`);
    },
  });

  // 获取分类使用数量
  const { data: usageCountData } = trpc.ledger.getCategoryUsageCount.useQuery(
    {
      ledgerId: Number(id),
      categoryId: categoryToReplace?.id || 0,
    },
    {
      enabled: !!categoryToReplace?.id,
    }
  );

  // 当使用数量数据返回时更新affectedCount
  useEffect(() => {
    if (usageCountData) {
      setAffectedCount(usageCountData.count);
    }
  }, [usageCountData]);

  // 构建分类树结构
  const buildCategoryTree = (flatCategories: any[]): Category[] => {
    const categoryMap = new Map<number, Category>();
    const rootCategories: Category[] = [];

    // 初始化所有分类
    flatCategories.forEach(cat => {
      categoryMap.set(cat.id, { ...cat, children: [] });
    });

    // 构建树结构
    flatCategories.forEach(cat => {
      const category = categoryMap.get(cat.id)!;
      if (cat.parentId === null) {
        rootCategories.push(category);
      } else {
        const parent = categoryMap.get(cat.parentId);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(category);
        }
      }
    });

    return rootCategories;
  };

  const categories = categoriesData ? buildCategoryTree(categoriesData) : [];

  // 构建分类ID到完整路径的映射，用于替换对话框中显示层级
  const getCategoryFullPath = (categoryId: number): string => {
    if (!categoriesData) return '';
    const catMap = new Map<number, any>();
    categoriesData.forEach((cat: any) => catMap.set(cat.id, cat));
    
    const parts: string[] = [];
    let current = catMap.get(categoryId);
    while (current) {
      parts.unshift(current.name);
      current = current.parentId ? catMap.get(current.parentId) : null;
    }
    return parts.join(' > ');
  };

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) {
      toast.error("请输入分类名称");
      return;
    }

    // TODO: 调用API添加分类
    toast.success("分类添加成功");
    setIsAddDialogOpen(false);
    setNewCategoryName("");
    setNewCategorySortOrder("1");
    setSelectedParentId(null);
  };

  const handleAddSubCategory = (parentId: number, parentName: string) => {
    setSelectedParentId(parentId);
    setSelectedType("expense"); // 子分类继承父分类的类型
    setIsAddDialogOpen(true);
  };

  // ─── opinion_book 类型：渲染分店管理界面 ────────────────────────────────────
  // 分店管理状态（仅 opinion_book 使用）
  const [showAddBranchDialog, setShowAddBranchDialog] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [branchToDelete, setBranchToDelete] = useState<{ id: number; name: string; entry_count: number } | null>(null);
  const [showDeleteBranchConfirm, setShowDeleteBranchConfirm] = useState(false);

  const { data: branchesData = [], refetch: refetchBranches } = trpc.opinionBook.getBranches.useQuery(
    { ledgerId: Number(id) },
    { enabled: isOpinionBook && Number(id) > 0 }
  );

  const addBranchMutation = trpc.opinionBook.addBranch.useMutation({
    onSuccess: () => {
      toast.success("分店添加成功");
      refetchBranches();
      setShowAddBranchDialog(false);
      setNewBranchName("");
    },
    onError: (error) => toast.error(`添加失败: ${error.message}`),
  });

  const deleteBranchMutation = trpc.opinionBook.deleteBranch.useMutation({
    onSuccess: () => {
      toast.success("分店删除成功");
      refetchBranches();
      setShowDeleteBranchConfirm(false);
      setBranchToDelete(null);
    },
    onError: (error) => toast.error(`删除失败: ${error.message}`),
  });

  if (isOpinionBook) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* 顶部导航 */}
        <div className="bg-white p-4 flex items-center justify-between border-b sticky top-0 z-10">
          <button onClick={() => setLocation(`/ledger/${id}/settings`)}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">分店管理</h1>
          <button
            onClick={() => setShowAddBranchDialog(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#D32F2F] text-white"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* 分店列表 */}
        <div className="p-4 space-y-2">
          {(branchesData as any[]).length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Store className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">暂无分店，点击右上角 + 添加</p>
            </div>
          ) : (
            (branchesData as any[]).map((branch: any) => (
              <div
                key={branch.id}
                className="bg-white rounded-xl px-4 py-3 flex items-center justify-between shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <Store className="w-4 h-4 text-[#D32F2F]" />
                  <span className="font-medium text-gray-800">{branch.name}</span>
                  <span className="text-xs text-gray-400">{branch.entry_count || 0} 条意见</span>
                </div>
                <button
                  onClick={() => { setBranchToDelete(branch); setShowDeleteBranchConfirm(true); }}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-[#D32F2F] transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* 添加分店对话框 */}
        <Dialog open={showAddBranchDialog} onOpenChange={setShowAddBranchDialog}>
          <DialogContent className="top-[20%] translate-y-0">
            <DialogHeader>
              <DialogTitle>添加分店</DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-4">
              <div>
                <Label htmlFor="branchName">分店名称</Label>
                <Input
                  id="branchName"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="请输入分店名称"
                  className="mt-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newBranchName.trim()) {
                      addBranchMutation.mutate({ ledgerId: Number(id), name: newBranchName.trim() });
                    }
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setShowAddBranchDialog(false); setNewBranchName(""); }}
                >
                  取消
                </Button>
                <Button
                  className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C]"
                  disabled={!newBranchName.trim() || addBranchMutation.isPending}
                  onClick={() => addBranchMutation.mutate({ ledgerId: Number(id), name: newBranchName.trim() })}
                >
                  {addBranchMutation.isPending ? "添加中..." : "确定"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 删除分店确认对话框 */}
        <Dialog open={showDeleteBranchConfirm} onOpenChange={setShowDeleteBranchConfirm}>
          <DialogContent className="top-[20%] translate-y-0">
            <DialogHeader>
              <DialogTitle>确认删除</DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-4">
              <p className="text-gray-700">
                确认删除分店 <strong>"{branchToDelete?.name}"</strong> 吗？
              </p>
              <p className="text-sm text-gray-400">该分店下的意见记录不会被删除，仅解除分店关联。</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setShowDeleteBranchConfirm(false); setBranchToDelete(null); }}
                >
                  取消
                </Button>
                <Button
                  className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C]"
                  disabled={deleteBranchMutation.isPending}
                  onClick={() => branchToDelete && deleteBranchMutation.mutate({ categoryId: branchToDelete.id })}
                >
                  {deleteBranchMutation.isPending ? "删除中..." : "确认删除"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-white p-4 flex items-center justify-between border-b sticky top-0 z-10">
        <button onClick={() => setLocation(`/ledger/${id}`)}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold">账本分类管理</h1>
        <div className="w-5" />
      </div>

      {/* 分类列表 */}
      <div className="p-4 space-y-4">
        {categories.map((category) => (
          <div key={category.id}>
            <div>
              {/* 一级分类标题 */}
              <div className="bg-gray-100 px-3 py-1 text-xs text-gray-600">一级分类</div>
              
              {/* 一级分类 */}
              <div className="bg-white p-1">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => {
                      if (isDeleteMode) {
                        setCategoryToDelete(category);
                        setShowDeleteConfirm(true);
                      } else {
                        toggleCategory(category.id);
                      }
                    }}
                    className="relative px-4 py-2 bg-gray-50 rounded text-sm border border-gray-200 hover:bg-gray-100"
                  >
                    {isDeleteMode && (
                      <span className="absolute -top-1 -left-1 w-5 h-5 bg-[#D32F2F] text-white rounded-full flex items-center justify-center text-xs">
                        -
                      </span>
                    )}
                    {category.name}
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setCategoryToReplace(category);
                        setShowReplaceDialog(true);
                      }}
                      className="px-2 py-1 text-xs border border-[#FF9800] text-[#FF9800] rounded hover:bg-[#FFF3E0]"
                    >
                      替换
                    </button>
                    <button
                      onClick={() => {
                        setCurrentCategoryId(category.id);
                        setSelectedAction(null);
                        setIsAddDialogOpen(true);
                      }}
                      className="w-8 h-8 flex items-center justify-center border border-[#1976D2] text-[#1976D2] rounded hover:bg-[#F5F5F5]"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setIsDeleteMode(!isDeleteMode)}
                      className={`w-8 h-8 flex items-center justify-center border rounded hover:bg-[#F5F5F5] ${
                        isDeleteMode 
                          ? 'border-[#D32F2F] text-[#D32F2F] bg-[#FFEBEE]' 
                          : 'border-[#1976D2] text-[#1976D2]'
                      }`}
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 二级分类 */}
            {expandedCategories.has(category.id) && category.children && category.children.length > 0 && (
              <div>
                <div>
                  {/* 二级分类标题 */}
                  <div className="bg-gray-100 px-3 py-1 text-xs text-gray-600">二级分类</div>
                </div>
                
                {category.children.map((child) => (
                  <div key={child.id}>
                    {/* 二级分类容器 */}
                    <div className="bg-white p-1">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => {
                            if (isDeleteMode) {
                              setCategoryToDelete(child);
                              setShowDeleteConfirm(true);
                            } else {
                              toggleSubCategory(child.id);
                            }
                          }}
                          className="relative px-4 py-2 bg-gray-50 rounded text-sm border border-gray-200 hover:bg-gray-100"
                        >
                          {isDeleteMode && (
                            <span className="absolute -top-1 -left-1 w-5 h-5 bg-[#D32F2F] text-white rounded-full flex items-center justify-center text-xs">
                              -
                            </span>
                          )}
                          {child.name}
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setCategoryToReplace(child);
                              setShowReplaceDialog(true);
                            }}
                            className="px-2 py-1 text-xs border border-[#FF9800] text-[#FF9800] rounded hover:bg-[#FFF3E0]"
                          >
                            替换
                          </button>
                          <button
                            onClick={() => {
                              setCurrentCategoryId(category.id);
                              setSelectedParentId(child.id);
                              setSelectedAction('level3');
                              setShowSubCategorySelect(true);
                              setIsAddDialogOpen(true);
                            }}
                            className="w-8 h-8 flex items-center justify-center border border-[#1976D2] text-[#1976D2] rounded hover:bg-[#F5F5F5]"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 三级分类 */}
                    {expandedSubCategories.has(child.id) && child.children && child.children.length > 0 && (
                      <div>
                        <div className="bg-gray-100 px-3 py-1 text-xs text-gray-600">三级分类</div>
                        {child.children.map((grandchild) => (
                          <div key={grandchild.id} className="bg-white p-1">
                            <div className="flex items-center justify-between">
                              <button
                                onClick={() => {
                                  if (isDeleteMode) {
                                    setCategoryToDelete(grandchild);
                                    setShowDeleteConfirm(true);
                                  }
                                }}
                                className="relative px-4 py-2 bg-gray-50 rounded text-sm border border-gray-200 hover:bg-gray-100"
                              >
                                {isDeleteMode && (
                                  <span className="absolute -top-1 -left-1 w-5 h-5 bg-[#D32F2F] text-white rounded-full flex items-center justify-center text-xs">
                                    -
                                  </span>
                                )}
                                {grandchild.name}
                              </button>
                              <button
                                onClick={() => {
                                  setCategoryToReplace(grandchild);
                                  setShowReplaceDialog(true);
                                }}
                                className="px-2 py-1 text-xs border border-[#FF9800] text-[#FF9800] rounded hover:bg-[#FFF3E0]"
                              >
                                替换
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 添加分类对话框 */}
      <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsAddDialogOpen(false);
          setSelectedAction(null);
          setNewCategoryName("");
          setShowSubCategorySelect(false);
          setSelectedParentId(null);
        }
      }}>
        <DialogContent className="top-[5%] translate-y-0">
          <DialogHeader>
            <DialogTitle>添加分类</DialogTitle>
          </DialogHeader>
          
          {/* 选择分类级别 */}
          {!selectedAction && (
            <div className="py-2">
              <button
                onClick={() => setSelectedAction('level1')}
                className="w-full px-4 py-4 text-center text-lg hover:bg-gray-50"
              >
                增加一级分类
              </button>
              <div className="border-t border-gray-200"></div>
              <button
                onClick={() => setSelectedAction('level2')}
                className="w-full px-4 py-4 text-center text-lg hover:bg-gray-50"
              >
                增加二级分类
              </button>
              <div className="border-t border-gray-200"></div>
              <button
                onClick={() => setSelectedAction('level3')}
                className="w-full px-4 py-4 text-center text-lg hover:bg-gray-50"
              >
                增加三级分类
              </button>
            </div>
          )}
          
          {/* 输入分类名称 (一级和二级) */}
          {(selectedAction === 'level1' || selectedAction === 'level2') && (
            <div className="py-4 space-y-4">
              <div>
                <Label htmlFor="categoryName">分类名称</Label>
                <Input
                  id="categoryName"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="请输入分类名称"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setIsAddDialogOpen(false);
                    setSelectedAction(null);
                    setNewCategoryName("");
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  取消
                </Button>
                <Button
                  onClick={async () => {
                    if (!newCategoryName.trim()) {
                      toast.error("请输入分类名称");
                      return;
                    }
                    
                    // 添加新分类
                    if (selectedAction === 'level1') {
                      // 添加一级分类
                      await addCategoryMutation.mutateAsync({
                        ledgerId: Number(id),
                        name: newCategoryName.trim(),
                        type: "expense",
                        icon: "📝",
                        color: "#ef4444",
                      });
                    } else if (selectedAction === 'level2') {
                      // 添加二级分类
                      await addCategoryMutation.mutateAsync({
                        ledgerId: Number(id),
                        name: newCategoryName.trim(),
                        type: "expense",
                        parentId: currentCategoryId!,
                        icon: "📝",
                        color: "#ef4444",
                      });
                    } else if (selectedAction === 'level3') {
                      // 添加三级分类
                      await addCategoryMutation.mutateAsync({
                        ledgerId: Number(id),
                        name: newCategoryName.trim(),
                        type: "expense",
                        parentId: selectedParentId!,
                        icon: "📝",
                        color: "#ef4444",
                      });
                    }
                    
                    setIsAddDialogOpen(false);
                    setSelectedAction(null);
                    setNewCategoryName("");
                    setShowSubCategorySelect(false);
                    setSelectedParentId(null);
                  }}
                  className="flex-1"
                  disabled={addCategoryMutation.isPending}
                >
                  {addCategoryMutation.isPending ? "正在添加..." : "确定"}
                </Button>
              </div>
            </div>
          )}
          
          {/* 选择二级分类 (三级) */}
          {selectedAction === 'level3' && !showSubCategorySelect && (
            <div className="py-4">
              {categories.find(c => c.id === currentCategoryId)?.children?.map((subCat) => (
                <div key={subCat.id}>
                  <button
                    onClick={() => {
                      setSelectedParentId(subCat.id);
                      setShowSubCategorySelect(true);
                    }}
                    className="w-full px-4 py-4 text-center text-lg hover:bg-gray-50"
                  >
                    {subCat.name}
                  </button>
                  <div className="border-t border-gray-200"></div>
                </div>
              )) || <div className="text-center text-gray-400 py-4">暂无二级分类</div>}
            </div>
          )}
          
          {/* 输入三级分类名称 */}
          {selectedAction === 'level3' && showSubCategorySelect && (
            <div className="py-4 space-y-4">
              <div>
                <Label htmlFor="categoryName">分类名称</Label>
                <Input
                  id="categoryName"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="请输入分类名称"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setIsAddDialogOpen(false);
                    setSelectedAction(null);
                    setShowSubCategorySelect(false);
                    setNewCategoryName("");
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  取消
                </Button>
                <Button
                  onClick={async () => {
                    if (!newCategoryName.trim()) {
                      toast.error("请输入分类名称");
                      return;
                    }
                    
                    // 调用API添加三级分类
                    await addCategoryMutation.mutateAsync({
                      ledgerId: Number(id),
                      name: newCategoryName.trim(),
                      type: selectedType,
                      parentId: selectedParentId!,
                      sortOrder: Number(newCategorySortOrder),
                    });
                    
                    setIsAddDialogOpen(false);
                    setSelectedAction(null);
                    setShowSubCategorySelect(false);
                    setNewCategoryName("");
                    setSelectedParentId(null);
                  }}
                  className="flex-1"
                  disabled={addCategoryMutation.isPending}
                >
                  {addCategoryMutation.isPending ? "正在添加..." : "确定"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="top-[5%] translate-y-0">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <p className="text-gray-700">
              确认要删除分类 "{categoryToDelete?.name}" 吗？
            </p>
            
            {/* 如果是一级或二级分类，显示级联删除提示 */}
            {categoryToDelete && (
              (categoryToDelete.parentId === null || 
               (categoryToDelete.children && categoryToDelete.children.length > 0))
            ) && (
              <div className="bg-[#FAF3ED] border border-yellow-200 rounded p-3">
                <p className="text-sm text-yellow-800">
                  ⚠️ 一旦删除，下面的子分类将全部被删除
                </p>
              </div>
            )}
            
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setCategoryToDelete(null);
                }}
                variant="outline"
                className="flex-1"
              >
                取消
              </Button>
              <Button
                onClick={async () => {
                  if (!categoryToDelete) return;
                  
                  // 判断是否需要级联删除
                  const needsCascade = categoryToDelete.parentId === null || 
                                      (categoryToDelete.children && categoryToDelete.children.length > 0);
                  
                  await deleteCategoryMutation.mutateAsync({
                    categoryId: categoryToDelete.id,
                    cascade: needsCascade,
                  });
                  
                  setIsDeleteMode(false);
                }}
                className="flex-1 bg-[#D32F2F] hover:bg-[#D32F2F]"
                disabled={deleteCategoryMutation.isPending}
              >
                {deleteCategoryMutation.isPending ? "正在删除..." : "确认删除"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 批量替换对话框 */}
      <Dialog open={showReplaceDialog} onOpenChange={setShowReplaceDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>批量替换分类</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-[#FFF3E0] border border-[#FF9800] rounded p-3">
              <p className="text-sm text-[#E65100]">
                将所有使用 <strong>"{categoryToReplace ? getCategoryFullPath(categoryToReplace.id) : ''}"</strong> 分类的记账记录替换为其他分类
              </p>
            </div>
            
            <div>
              <Label>选择目标分类</Label>
              <select
                value={targetCategoryId || ""}
                onChange={(e) => setTargetCategoryId(Number(e.target.value))}
                className="w-full mt-1 p-2 border border-gray-300 rounded"
              >
                <option value="">请选择...</option>
                {categoriesData
                  ?.filter((cat: any) => cat.id !== categoryToReplace?.id)
                  .map((cat: any) => (
                    <option key={cat.id} value={cat.id}>
                      {getCategoryFullPath(cat.id)}
                    </option>
                  ))}
              </select>
            </div>
            
            {affectedCount > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <p className="text-sm text-blue-800">
                  将影响 <strong>{affectedCount}</strong> 条记账记录
                </p>
              </div>
            )}
            
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setShowReplaceDialog(false);
                  setCategoryToReplace(null);
                  setTargetCategoryId(null);
                  setAffectedCount(0);
                }}
                variant="outline"
                className="flex-1"
              >
                取消
              </Button>
              <Button
                onClick={async () => {
                  if (!categoryToReplace || !targetCategoryId) return;
                  replaceCategoryMutation.mutate({
                    ledgerId: Number(id),
                    sourceCategoryId: categoryToReplace.id,
                    targetCategoryId: targetCategoryId,
                  });
                }}
                className="flex-1 bg-[#FF9800] hover:bg-[#F57C00]"
                disabled={!targetCategoryId || replaceCategoryMutation.isPending}
              >
                {replaceCategoryMutation.isPending ? "替换中..." : "确认替换"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LedgerCategories;
