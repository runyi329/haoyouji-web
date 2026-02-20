import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Minus, ChevronRight, ChevronDown } from "lucide-react";
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

  // 构建分类树结构
  const buildCategoryTree = (flatCategories: Category[]): Category[] => {
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
              <div className="bg-gray-100 px-3 py-1 text-xs text-[#757575]">一级分类</div>
              
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
                    className="relative px-4 py-2 bg-gray-50 rounded text-sm border border-[#E0E0E0] hover:bg-gray-100"
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
                  <div className="bg-gray-100 px-3 py-1 text-xs text-[#757575]">二级分类</div>
                </div>
                
                {category.children.map((child) => (
                  <div key={child.id}>
                    {/* 二级分类容器 */}
                    <div className="bg-white p-1">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (isDeleteMode) {
                              setCategoryToDelete(child);
                              setShowDeleteConfirm(true);
                            } else {
                              toggleSubCategory(child.id);
                            }
                          }}
                          className="relative px-4 py-2 bg-gray-50 rounded text-sm border border-[#E0E0E0] hover:bg-gray-100"
                        >
                          {isDeleteMode && (
                            <span className="absolute -top-1 -left-1 w-5 h-5 bg-[#D32F2F] text-white rounded-full flex items-center justify-center text-xs">
                              -
                            </span>
                          )}
                          {child.name}
                        </button>
                      </div>
                    </div>
                    
                    {/* 三级分类 */}
                    {expandedSubCategories.has(child.id) && child.children && child.children.length > 0 && (
                      <div>
                        <div>
                          {/* 三级分类标题 */}
                          <div className="bg-gray-100 px-3 py-1 text-xs text-[#757575]">三级分类</div>
                          
                          {/* 三级分类容器 */}
                          <div className="bg-white p-1">
                          <div className="flex flex-wrap gap-2">
                            {child.children.map((subChild: any) => (
                              <button
                                key={subChild.id}
                                onClick={() => {
                                  if (isDeleteMode) {
                                    setCategoryToDelete(subChild);
                                    setShowDeleteConfirm(true);
                                  }
                                }}
                                className="relative px-4 py-2 bg-gray-50 rounded text-sm border border-[#E0E0E0] hover:bg-gray-100"
                              >
                                {isDeleteMode && (
                                  <span className="absolute -top-1 -left-1 w-5 h-5 bg-[#D32F2F] text-white rounded-full flex items-center justify-center text-xs">
                                    -
                                  </span>
                                )}
                                <span>{subChild.name}</span>
                              </button>
                            ))}
                          </div>
                          </div>
                        </div>
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
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="top-[5%] translate-y-0">
          <DialogHeader>
            <DialogTitle>
              {!selectedAction && "选择要添加的分类类型"}
              {selectedAction === 'level1' && "增加一级分类"}
              {selectedAction === 'level2' && "增加二级分类"}
              {selectedAction === 'level3' && !showSubCategorySelect && "选择二级分类"}
              {selectedAction === 'level3' && showSubCategorySelect && "增加三级分类"}
            </DialogTitle>
          </DialogHeader>
          
          {/* 选择操作类型 */}
          {!selectedAction && (
            <div className="py-4">
              <button
                onClick={() => setSelectedAction('level1')}
                className="w-full px-4 py-4 text-center text-lg hover:bg-gray-50"
              >
                增加一级分类
              </button>
              <div className="border-t border-[#E0E0E0]"></div>
              <button
                onClick={() => setSelectedAction('level2')}
                className="w-full px-4 py-4 text-center text-lg hover:bg-gray-50"
              >
                增加二级分类
              </button>
              <div className="border-t border-[#E0E0E0]"></div>
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
                  <div className="border-t border-[#E0E0E0]"></div>
                </div>
              )) || <div className="text-center text-[#757575] py-4">暂无二级分类</div>}
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
            <p className="text-[#424242]">
              确认要删除分类 "{categoryToDelete?.name}" 吗？
            </p>
            
            {/* 如果是一级或二级分类，显示级联删除提示 */}
            {categoryToDelete && (
              (categoryToDelete.parentId === null || 
               (categoryToDelete.children && categoryToDelete.children.length > 0))
            ) && (
              <div className="bg-[#FAF3ED] border border-yellow-200 rounded p-3">
                <p className="text-sm text-[#FFA726]">
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
    </div>
  );
};

export default LedgerCategories;
