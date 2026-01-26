import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus } from "lucide-react";
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

  // 模拟分类数据（后续从API获取）
  const [categories] = useState<Category[]>([
    {
      id: 1,
      name: "贷款",
      type: "expense",
      parentId: null,
      icon: "💰",
      color: "#ef4444",
      sortOrder: 1,
      isDefault: false,
      children: [
        { id: 11, name: "胡上海建行按揭", type: "expense", parentId: 1, icon: "🏦", color: "#ef4444", sortOrder: 1, isDefault: false },
        { id: 12, name: "邮储", type: "expense", parentId: 1, icon: "📮", color: "#ef4444", sortOrder: 2, isDefault: false },
        { id: 13, name: "胡招行经营贷", type: "expense", parentId: 1, icon: "💼", color: "#ef4444", sortOrder: 3, isDefault: false },
        { id: 14, name: "蒋招行闪电贷", type: "expense", parentId: 1, icon: "⚡", color: "#ef4444", sortOrder: 4, isDefault: false },
      ],
    },
    {
      id: 2,
      name: "购物",
      type: "expense",
      parentId: null,
      icon: "🛍️",
      color: "#ef4444",
      sortOrder: 2,
      isDefault: true,
      children: [
        { id: 21, name: "外出吃饭", type: "expense", parentId: 2, icon: "🍽️", color: "#ef4444", sortOrder: 1, isDefault: false },
        { id: 22, name: "盒马", type: "expense", parentId: 2, icon: "🦞", color: "#ef4444", sortOrder: 2, isDefault: false },
        { id: 23, name: "抖音", type: "expense", parentId: 2, icon: "📱", color: "#ef4444", sortOrder: 3, isDefault: false },
        { id: 24, name: "拼多多", type: "expense", parentId: 2, icon: "🛒", color: "#ef4444", sortOrder: 4, isDefault: false },
        { id: 25, name: "淘宝", type: "expense", parentId: 2, icon: "🛍️", color: "#ef4444", sortOrder: 5, isDefault: false },
        { id: 26, name: "山姆", type: "expense", parentId: 2, icon: "🏪", color: "#ef4444", sortOrder: 6, isDefault: false },
        { id: 27, name: "康宝莱", type: "expense", parentId: 2, icon: "🌿", color: "#ef4444", sortOrder: 7, isDefault: false },
      ],
    },
    {
      id: 3,
      name: "交通",
      type: "expense",
      parentId: null,
      icon: "🚗",
      color: "#ef4444",
      sortOrder: 3,
      isDefault: true,
      children: [
        { id: 31, name: "停车费", type: "expense", parentId: 3, icon: "🅿️", color: "#ef4444", sortOrder: 1, isDefault: false },
        { id: 32, name: "打车", type: "expense", parentId: 3, icon: "🚕", color: "#ef4444", sortOrder: 2, isDefault: false },
        { id: 33, name: "地铁", type: "expense", parentId: 3, icon: "🚇", color: "#ef4444", sortOrder: 3, isDefault: false },
        { id: 34, name: "加油", type: "expense", parentId: 3, icon: "⛽", color: "#ef4444", sortOrder: 4, isDefault: false },
        { id: 35, name: "飞机票", type: "expense", parentId: 3, icon: "✈️", color: "#ef4444", sortOrder: 5, isDefault: false },
        { id: 36, name: "公交", type: "expense", parentId: 3, icon: "🚌", color: "#ef4444", sortOrder: 6, isDefault: false },
        { id: 37, name: "火车票", type: "expense", parentId: 3, icon: "🚄", color: "#ef4444", sortOrder: 7, isDefault: false },
        { id: 38, name: "保养", type: "expense", parentId: 3, icon: "🔧", color: "#ef4444", sortOrder: 8, isDefault: false },
      ],
    },
    {
      id: 4,
      name: "其他",
      type: "expense",
      parentId: null,
      icon: "📝",
      color: "#ef4444",
      sortOrder: 4,
      isDefault: true,
      children: [
        { id: 41, name: "话费", type: "expense", parentId: 4, icon: "📞", color: "#ef4444", sortOrder: 1, isDefault: false },
        { id: 42, name: "网费", type: "expense", parentId: 4, icon: "🌐", color: "#ef4444", sortOrder: 2, isDefault: false },
        { id: 43, name: "水费", type: "expense", parentId: 4, icon: "💧", color: "#ef4444", sortOrder: 3, isDefault: false },
        { id: 44, name: "电费", type: "expense", parentId: 4, icon: "💡", color: "#ef4444", sortOrder: 4, isDefault: false },
        { id: 45, name: "取暖费", type: "expense", parentId: 4, icon: "🔥", color: "#ef4444", sortOrder: 5, isDefault: false },
        { id: 46, name: "保洁阿姨", type: "expense", parentId: 4, icon: "🧹", color: "#ef4444", sortOrder: 6, isDefault: false },
        { id: 47, name: "燃气费", type: "expense", parentId: 4, icon: "🔥", color: "#ef4444", sortOrder: 7, isDefault: false },
        { id: 48, name: "快递费", type: "expense", parentId: 4, icon: "📦", color: "#ef4444", sortOrder: 8, isDefault: false },
        { id: 49, name: "喵喵", type: "expense", parentId: 4, icon: "🐱", color: "#ef4444", sortOrder: 9, isDefault: false },
        { id: 410, name: "旺旺", type: "expense", parentId: 4, icon: "🐶", color: "#ef4444", sortOrder: 10, isDefault: false },
        { id: 411, name: "喵喵+旺旺", type: "expense", parentId: 4, icon: "🐾", color: "#ef4444", sortOrder: 11, isDefault: false },
      ],
    },
    {
      id: 6,
      name: "保险医疗",
      type: "expense",
      parentId: null,
      icon: "💊",
      color: "#ef4444",
      sortOrder: 6,
      isDefault: true,
      children: [],
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
          <div key={category.id} className="bg-white rounded-lg overflow-hidden">
            {/* 一级分类 */}
            <div className="p-4 flex items-center justify-between border-b">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{category.icon}</span>
                <div>
                  <div className="font-medium">{category.name}</div>
                  <div className="text-xs text-gray-500">排序：{category.sortOrder}</div>
                </div>
              </div>
              <button
                onClick={() => handleAddSubCategory(category.id, category.name)}
                className="text-blue-500 text-sm flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                添加子分类
              </button>
            </div>

            {/* 二级分类 */}
            {category.children && category.children.length > 0 && (
              <div className="p-4 space-y-2 bg-gray-50">
                <div className="flex flex-wrap gap-2">
                  {category.children.map((child) => (
                    <div
                      key={child.id}
                      className="px-3 py-1.5 bg-white rounded-full text-sm border border-gray-200 flex items-center gap-1"
                    >
                      <span>{child.icon}</span>
                      <span>{child.name}</span>
                    </div>
                  ))}
                  <button
                    onClick={() => handleAddSubCategory(category.id, category.name)}
                    className="px-3 py-1.5 bg-white rounded-full text-sm border border-dashed border-blue-500 text-blue-500 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    添加子分类
                  </button>
                </div>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedParentId ? "添加子分类" : "添加账本支出条目"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="categoryName" className="text-gray-500 text-sm">
                条目名称
              </Label>
              <Input
                id="categoryName"
                placeholder="请输入条目名称"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="sortOrder" className="text-gray-500 text-sm">
                排序
              </Label>
              <Input
                id="sortOrder"
                type="number"
                placeholder="1"
                value={newCategorySortOrder}
                onChange={(e) => setNewCategorySortOrder(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleAddCategory}
              className="w-full bg-blue-500 hover:bg-blue-600"
            >
              确定
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LedgerCategories;
