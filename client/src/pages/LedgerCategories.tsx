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
                      onClick={() => handleAddSubCategory(category.id, category.name)}
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

      {/* 底部添加按钮 */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t">
        <Button
          onClick={() => {
            setSelectedParentId(null);
            setIsAddDialogOpen(true);
          }}
          className="w-full bg-blue-500 hover:bg-blue-600"
        >
          添加账本支出条目
        </Button>
      </div>

      {/* 添加分类对话框 */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="top-[5%] translate-y-0">
          <DialogHeader>
            <DialogTitle>选择要添加的分类类型</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <button
              onClick={() => toast.info("增加一级分类功能待实现")}
              className="w-full px-4 py-4 text-center text-lg hover:bg-gray-50"
            >
              增加一级分类
            </button>
            <div className="border-t border-gray-200"></div>
            <button
              onClick={() => toast.info("增加二级分类功能待实现")}
              className="w-full px-4 py-4 text-center text-lg hover:bg-gray-50"
            >
              增加二级分类
            </button>
            <div className="border-t border-gray-200"></div>
            <button
              onClick={() => toast.info("增加三级分类功能待实现")}
              className="w-full px-4 py-4 text-center text-lg hover:bg-gray-50"
            >
              增加三级分类
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LedgerCategories;
