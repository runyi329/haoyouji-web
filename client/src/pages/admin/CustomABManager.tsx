/**
 * CustomABManager.tsx - AB 型定制账本（意见本）管理页面
 * 样式参照 CustomAAManager，简洁列表展示
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, MessageSquare } from "lucide-react";

export default function CustomABManager() {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const utils = trpc.useUtils();

  const { data: books, isLoading } = trpc.opinionBook.list.useQuery();

  const createMutation = trpc.opinionBook.create.useMutation({
    onSuccess: () => {
      toast.success("意见本创建成功");
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      utils.opinionBook.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!newName.trim()) {
      toast.error("请填写账本名称");
      return;
    }
    createMutation.mutate({ name: newName.trim(), description: newDesc.trim() || undefined });
  };

  return (
    <div className="space-y-4">
      {/* 标题 + 新建按钮 */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#D32F2F]" />
            <h2 className="font-bold text-base">定制账本 (AB) 管理</h2>
          </div>
          <Button
            size="sm"
            className="bg-[#D32F2F] hover:bg-red-700 text-white"
            onClick={() => setShowCreate(!showCreate)}
          >
            <Plus className="w-4 h-4 mr-1" />
            新建意见本
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          扫码免注册提意见，适用于餐厅、门店等场景。仅管理员可创建，客户通过二维码直接提交意见。
        </p>

        {/* 创建表单 */}
        {showCreate && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-3 border border-gray-200">
            <div className="space-y-1">
              <Label className="text-sm">账本名称 *</Label>
              <Input
                placeholder="如：肯德基建议簿"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">备注说明（选填）</Label>
              <Input
                placeholder="账本用途说明..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                className="bg-[#D32F2F] hover:bg-red-700 text-white"
                onClick={handleCreate}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "创建中..." : "确认创建"}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                取消
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 账本列表 */}
      {isLoading ? (
        <Card className="p-6 text-center text-gray-400 text-sm">加载中...</Card>
      ) : !books || books.length === 0 ? (
        <Card className="p-6 text-center text-gray-400 text-sm">
          暂无意见本，点击上方「新建意见本」创建第一个
        </Card>
      ) : (
        <div className="space-y-3">
          {books.map((book: any) => (
            <Card
              key={book.id}
              className="p-4 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => {
                if (book.type === 'opinion_book_demo') {
                  window.location.href = `/demo/opinion/${book.id}`;
                } else {
                  window.location.href = `/opinion/${book.id}`;
                }
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[#D32F2F]" />
                    <span className="font-medium">{book.name}</span>
                    {book.type === 'opinion_book_demo' ? (
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                        演示账本
                      </span>
                    ) : (
                      <span className="text-xs bg-red-50 text-[#D32F2F] px-2 py-0.5 rounded-full">
                        定制AB
                      </span>
                    )}
                  </div>
                  {book.description && (
                    <p className="text-xs text-gray-500 mt-1 ml-6">{book.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1 ml-6">
                    ID: {book.id} · 创建于{" "}
                    {book.createdAt
                      ? new Date(book.createdAt).toLocaleDateString("zh-CN")
                      : "未知"}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
