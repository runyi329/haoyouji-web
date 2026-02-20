import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Pencil, Trash2, Check, X, Tag, User, GripVertical } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// 颜色选项
const colorOptions = [
  { name: "红色", value: "#ef4444" },
  { name: "橙色", value: "#f97316" },
  { name: "黄色", value: "#eab308" },
  { name: "绿色", value: "#22c55e" },
  { name: "青色", value: "#06b6d4" },
  { name: "蓝色", value: "#3b82f6" },
  { name: "紫色", value: "#8b5cf6" },
  { name: "粉色", value: "#ec4899" },
  { name: "灰色", value: "#6b7280" },
  { name: "棕色", value: "#92400e" },
];

// 可拖拽的标签项组件
function SortableTagItem({
  tag,
  onEdit,
  onDelete,
}: {
  tag: any;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tag.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-3 bg-white rounded-lg border hover:shadow-sm transition-shadow"
    >
      <div className="flex items-center gap-3">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
        >
          <GripVertical className="w-5 h-5" />
        </div>
        <span
          className="px-3 py-1 rounded-full text-white text-sm font-medium"
          style={{ backgroundColor: tag.color || "#3b82f6" }}
        >
          {tag.name}
        </span>
        <span className="text-sm text-muted-foreground">
          {tag.contactCount || 0} 位人脉
        </span>
      </div>
      <div className="flex gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={onEdit}
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="text-red-500 hover:text-red-600"
          onClick={onDelete}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default function TagsManagement() {
  const [, navigate] = useLocation();
  const [editingTag, setEditingTag] = useState<{ id: number; name: string; color: string } | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");
  const [isCreating, setIsCreating] = useState(false);
  const [localTags, setLocalTags] = useState<any[]>([]);

  // 获取标签列表
  const { data: tags, isLoading, refetch } = trpc.contacts.tags.list.useQuery(undefined, {
    onSuccess: (data) => {
      setLocalTags(data || []);
    },
  });

  // 获取个人标签使用统计
  const { data: personalTagsStats } = trpc.contacts.personalTags.stats.useQuery();

  // 创建标签
  const createTagMutation = trpc.contacts.tags.create.useMutation({
    onSuccess: () => {
      toast.success("标签创建成功");
      setNewTagName("");
      setNewTagColor("#3b82f6");
      setIsCreating(false);
      refetch();
    },
    onError: (error) => {
      toast.error("创建失败: " + error.message);
    },
  });

  // 更新标签
  const updateTagMutation = trpc.contacts.tags.update.useMutation({
    onSuccess: () => {
      toast.success("标签更新成功");
      setEditingTag(null);
      refetch();
    },
    onError: (error) => {
      toast.error("更新失败: " + error.message);
    },
  });

  // 删除标签
  const deleteTagMutation = trpc.contacts.tags.delete.useMutation({
    onSuccess: () => {
      toast.success("标签删除成功");
      refetch();
    },
    onError: (error) => {
      toast.error("删除失败: " + error.message);
    },
  });

  // 更新标签排序
  const updateOrderMutation = trpc.contacts.tags.updateOrder.useMutation({
    onSuccess: () => {
      toast.success("标签顺序已保存");
      refetch();
    },
    onError: (error) => {
      toast.error("保存失败: " + error.message);
    },
  });

  const handleCreate = () => {
    if (!newTagName.trim()) {
      toast.error("请输入标签名称");
      return;
    }
    createTagMutation.mutate({ name: newTagName.trim(), color: newTagColor });
  };

  const handleUpdate = () => {
    if (!editingTag || !editingTag.name.trim()) {
      toast.error("请输入标签名称");
      return;
    }
    updateTagMutation.mutate({
      id: editingTag.id,
      name: editingTag.name.trim(),
      color: editingTag.color,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("确定要删除这个标签吗？")) {
      deleteTagMutation.mutate({ id });
    }
  };

  // 配置拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 处理拖拽结束
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localTags.findIndex((tag) => tag.id === active.id);
      const newIndex = localTags.findIndex((tag) => tag.id === over.id);

      const newTags = arrayMove(localTags, oldIndex, newIndex);
      setLocalTags(newTags);

      // 生成新的排序数据
      const tagOrders = newTags.map((tag, index) => ({
        id: tag.id,
        sortOrder: index,
      }));

      // 保存到后端
      updateOrderMutation.mutate({ tagOrders });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white p-4">
      <div className="max-w-2xl mx-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回
          </Button>
          <Button onClick={() => setIsCreating(true)} disabled={isCreating}>
            <Plus className="w-4 h-4 mr-2" />
            新建标签
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5" />
              标签管理
            </CardTitle>
            <CardDescription>
              管理您的全局标签，可以修改名称、颜色或删除不需要的标签。拖动标签左侧的图标可以调整显示顺序。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 新建标签表单 */}
            {isCreating && (
              <div className="p-4 bg-cyan-50 rounded-lg space-y-3">
                <Input
                  placeholder="标签名称"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color.value}
                      className={`w-6 h-6 rounded-full border-2 ${
                        newTagColor === color.value ? "border-gray-800 ring-2 ring-offset-2 ring-gray-400" : "border-transparent"
                      }`}
                      style={{ backgroundColor: color.value }}
                      onClick={() => setNewTagColor(color.value)}
                      title={color.name}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleCreate} disabled={createTagMutation.isPending}>
                    <Check className="w-4 h-4 mr-1" />
                    保存
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIsCreating(false)}>
                    <X className="w-4 h-4 mr-1" />
                    取消
                  </Button>
                </div>
              </div>
            )}

            {/* 编辑标签表单 */}
            {editingTag && (
              <div className="p-4 bg-cyan-50 rounded-lg space-y-3">
                <Input
                  placeholder="标签名称"
                  value={editingTag.name}
                  onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && handleUpdate()}
                />
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color.value}
                      className={`w-6 h-6 rounded-full border-2 ${
                        editingTag.color === color.value ? "border-gray-800 ring-2 ring-offset-2 ring-gray-400" : "border-transparent"
                      }`}
                      style={{ backgroundColor: color.value }}
                      onClick={() => setEditingTag({ ...editingTag, color: color.value })}
                      title={color.name}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleUpdate} disabled={updateTagMutation.isPending}>
                    <Check className="w-4 h-4 mr-1" />
                    保存
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingTag(null)}>
                    <X className="w-4 h-4 mr-1" />
                    取消
                  </Button>
                </div>
              </div>
            )}

            {/* 标签列表（可拖拽排序） */}
            {!localTags || localTags.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                暂无标签，点击"新建标签"创建第一个标签
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={localTags.map((tag) => tag.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {localTags.map((tag) => (
                      <SortableTagItem
                        key={tag.id}
                        tag={tag}
                        onEdit={() => setEditingTag({ id: tag.id, name: tag.name, color: tag.color || "#3b82f6" })}
                        onDelete={() => handleDelete(tag.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </CardContent>
        </Card>

        {/* 个人标签使用统计 */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              个人标签统计
            </CardTitle>
            <CardDescription>
              您创建的个人标签使用情况，按使用次数排序
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!personalTagsStats || personalTagsStats.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                暂无个人标签，在人脉详情页可以为每个人脉添加个人标签
              </div>
            ) : (
              <div className="space-y-2">
                {personalTagsStats.map((stat, index) => (
                  <div
                    key={`${stat.name}-${index}`}
                    className="flex items-center justify-between p-3 bg-white rounded-lg border hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-white text-sm font-medium"
                        style={{ backgroundColor: stat.color || "#A80000" }}
                      >
                        <User className="w-3 h-3" />
                        {stat.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-brand-red">
                        × {stat.count}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        位人脉
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
