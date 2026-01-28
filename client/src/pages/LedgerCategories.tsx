import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Minus, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
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

  // 模拟分类数据（后续从API获取）
  const [categories] = useState<Category[]>([
    {
      id: 2,
      name: "购物",
      type: "expense",
      parentId: null,
      icon: "🛍️",
      color: "#ef4444",
      sortOrder: 1,
      isDefault: true,
      children: [
        { 
          id: 25, 
          name: "淘宝", 
          type: "expense", 
          parentId: 2, 
          icon: "🛍️", 
          color: "#ef4444", 
          sortOrder: 1, 
          isDefault: false,
          children: [
            { id: 251, name: "服饰", type: "expense", parentId: 25, icon: "👔", color: "#ef4444", sortOrder: 1, isDefault: false },
            { id: 252, name: "数码", type: "expense", parentId: 25, icon: "📱", color: "#ef4444", sortOrder: 2, isDefault: false },
            { id: 253, name: "食品", type: "expense", parentId: 25, icon: "🍞", color: "#ef4444", sortOrder: 3, isDefault: false },
          ]
        },
      ],
    },
  ]);

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
        <h1 className="text-lg font-semibold">账本支出条目</h1>
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
                    onClick={() => toggleCategory(category.id)}
                    className="px-4 py-2 bg-gray-50 rounded text-sm border border-gray-200 hover:bg-gray-100"
                  >
                    {category.name}
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setCurrentCategoryId(category.id);
                        setSelectedAction(null);
                        setIsAddDialogOpen(true);
                      }}
                      className="w-8 h-8 flex items-center justify-center border border-blue-500 text-blue-500 rounded hover:bg-blue-50"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toast.info("删除功能待实现")}
                      className="w-8 h-8 flex items-center justify-center border border-blue-500 text-blue-500 rounded hover:bg-blue-50"
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
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleSubCategory(child.id)}
                          className="px-4 py-2 bg-gray-50 rounded text-sm border border-gray-200 hover:bg-gray-100"
                        >
                          {child.name}
                        </button>
                      </div>
                    </div>
                    
                    {/* 三级分类 */}
                    {expandedSubCategories.has(child.id) && child.children && child.children.length > 0 && (
                      <div>
                        <div>
                          {/* 三级分类标题 */}
                          <div className="bg-gray-100 px-3 py-1 text-xs text-gray-600">三级分类</div>
                          
                          {/* 三级分类容器 */}
                          <div className="bg-white p-1">
                          <div className="flex flex-wrap gap-2">
                            {child.children.map((subChild: any) => (
                              <div
                                key={subChild.id}
                                className="px-4 py-2 bg-gray-50 rounded text-sm border border-gray-200"
                              >
                                <span>{subChild.name}</span>
                              </div>
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
                  onClick={() => {
                    if (!newCategoryName.trim()) {
                      toast.error("请输入分类名称");
                      return;
                    }
                    
                    // 添加新分类
                    if (selectedAction === 'level1') {
                      // 添加一级分类
                      const newCategory = {
                        id: Date.now(),
                        name: newCategoryName.trim(),
                        children: []
                      };
                      setCategories([...categories, newCategory]);
                      toast.success(`已添加一级分类: ${newCategoryName}`);
                    } else if (selectedAction === 'level2') {
                      // 添加二级分类
                      const newCategories = categories.map(cat => {
                        if (cat.id === currentCategoryId) {
                          return {
                            ...cat,
                            children: [
                              ...(cat.children || []),
                              {
                                id: Date.now(),
                                name: newCategoryName.trim(),
                                children: []
                              }
                            ]
                          };
                        }
                        return cat;
                      });
                      setCategories(newCategories);
                      toast.success(`已添加二级分类: ${newCategoryName}`);
                    }
                    
                    setIsAddDialogOpen(false);
                    setSelectedAction(null);
                    setNewCategoryName("");
                  }}
                  className="flex-1"
                >
                  确定
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
                  onClick={() => {
                    if (!newCategoryName.trim()) {
                      toast.error("请输入分类名称");
                      return;
                    }
                    
                    // 添加三级分类
                    const newCategories = categories.map(cat => {
                      if (cat.id === currentCategoryId) {
                        return {
                          ...cat,
                          children: cat.children?.map(subCat => {
                            if (subCat.id === selectedParentId) {
                              return {
                                ...subCat,
                                children: [
                                  ...(subCat.children || []),
                                  {
                                    id: Date.now(),
                                    name: newCategoryName.trim()
                                  }
                                ]
                              };
                            }
                            return subCat;
                          })
                        };
                      }
                      return cat;
                    });
                    setCategories(newCategories);
                    toast.success(`已添加三级分类: ${newCategoryName}`);
                    
                    setIsAddDialogOpen(false);
                    setSelectedAction(null);
                    setShowSubCategorySelect(false);
                    setNewCategoryName("");
                  }}
                  className="flex-1"
                >
                  确定
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LedgerCategories;
