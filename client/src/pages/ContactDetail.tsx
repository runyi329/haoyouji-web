import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Phone, MessageCircle, MapPin, Briefcase, Calendar, Tag, Clock, Plus, Settings, Bell, Trash2, Check, X, Search, UserCheck, UserX, Network, User, Pencil, MoreVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
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
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// 高亮搜索关键字组件
function HighlightText({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword.trim()) return <>{text}</>;
  
  const parts = text.split(new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  
  return (
    <>
      {parts.map((part, index) => 
        part.toLowerCase() === keyword.toLowerCase() ? (
          <span key={index} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}

// 定义统计卡片类型
type StatCard = {
  id: string;
  title: string;
  value: string | number;
  color: string;
  getValue: (stats: any) => string | number;
  getColor?: (stats: any) => string; // 可选：动态获取颜色
};

// 可排序的统计卡片组件
function SortableStatCard({ card }: { card: StatCard }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative bg-background border rounded-lg p-4 cursor-move hover:shadow-md transition-shadow"
      {...attributes}
      {...listeners}
    >
      <div className="text-center">
        <div className="text-xs text-muted-foreground mb-1">{card.title}</div>
        <div className={`text-lg font-bold ${card.color}`}>{card.value}</div>
      </div>
    </div>
  );
}

// 提醒管理卡片组件
function ReminderCard({ contactId, contactName }: { contactId: number; contactName: string }) {
  const utils = trpc.useUtils();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderType, setReminderType] = useState<"normal" | "birthday">("normal");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");

  // 获取提醒列表
  const { data: reminders } = trpc.contacts.reminders.list.useQuery({ contactId });

  // 创建提醒
  const createReminder = trpc.contacts.reminders.create.useMutation({
    onSuccess: () => {
      toast.success("提醒已添加");
      setShowAddDialog(false);
      setReminderTitle("");
      setReminderDate("");
      setReminderType("normal");
      setBirthMonth("");
      setBirthDay("");
      utils.contacts.reminders.list.invalidate({ contactId });
      utils.contacts.reminders.todayCount.invalidate();
      utils.contacts.reminders.weekCount.invalidate();
      utils.contacts.reminders.monthCount.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // 更新提醒（标记完成/未完成）
  const updateReminder = trpc.contacts.reminders.update.useMutation({
    onSuccess: () => {
      toast.success("提醒状态已更新");
      utils.contacts.reminders.list.invalidate({ contactId });
      utils.contacts.reminders.todayCount.invalidate();
      utils.contacts.reminders.weekCount.invalidate();
      utils.contacts.reminders.monthCount.invalidate();
    },
  });

  // 删除提醒
  const deleteReminder = trpc.contacts.reminders.delete.useMutation({
    onSuccess: () => {
      toast.success("提醒已删除");
      utils.contacts.reminders.list.invalidate({ contactId });
      utils.contacts.reminders.todayCount.invalidate();
      utils.contacts.reminders.weekCount.invalidate();
      utils.contacts.reminders.monthCount.invalidate();
    },
  });

  const handleAddReminder = () => {
    if (!reminderTitle.trim()) {
      toast.error("请输入提醒事项");
      return;
    }

    if (reminderType === "birthday") {
      // 生日提醒验证
      if (!birthMonth || !birthDay) {
        toast.error("请选择生日月份和日期");
        return;
      }
      createReminder.mutate({
        contactId,
        title: reminderTitle,
        reminderType: "birthday",
        birthMonth: parseInt(birthMonth),
        birthDay: parseInt(birthDay),
      });
    } else {
      // 普通提醒验证
      if (!reminderDate) {
        toast.error("请选择提醒时间");
        return;
      }
      const timestamp = new Date(reminderDate).getTime();
      createReminder.mutate({
        contactId,
        title: reminderTitle,
        reminderDate: timestamp,
        reminderType: "normal",
      });
    }
  };

  const handleToggleComplete = (id: number, isCompleted: boolean) => {
    updateReminder.mutate({ id, isCompleted: !isCompleted });
  };

  const handleDelete = (id: number) => {
    if (confirm("确定要删除这个提醒吗？")) {
      deleteReminder.mutate({ id });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center">
              <Bell className="h-5 w-5 mr-2" />
              提醒事项
            </CardTitle>
            <Button
              size="sm"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              添加提醒
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {reminders && reminders.length > 0 ? (
            <div className="space-y-3">
              {reminders.map((reminder) => (
                <div
                  key={reminder.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    reminder.isCompleted ? "bg-muted/30 opacity-60" : "bg-background"
                  }`}
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 mt-0.5"
                    onClick={() => handleToggleComplete(reminder.id, reminder.isCompleted)}
                  >
                    {reminder.isCompleted ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <div className="h-4 w-4 border-2 border-muted-foreground rounded" />
                    )}
                  </Button>
                  <div className="flex-1">
                    <div className={`text-sm font-medium flex items-center gap-2 ${
                      reminder.isCompleted ? "line-through text-muted-foreground" : ""
                    }`}>
                      {reminder.reminderType === "birthday" && <span>🎂</span>}
                      {reminder.title}
                      {reminder.reminderType === "birthday" && (
                        <Badge variant="secondary" className="text-xs">每年循环</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {reminder.reminderType === "birthday" ? (
                        `${reminder.birthMonth}月${reminder.birthDay}日`
                      ) : (
                        format(new Date(reminder.reminderDate), "yyyy年MM月dd日", { locale: zhCN })
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(reminder.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              还没有提醒事项，点击上方按钮添加吧！
            </div>
          )}
        </CardContent>
      </Card>

      {/* 添加提醒对话框 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加提醒</DialogTitle>
            <DialogDescription>
              为 {contactName} 添加一个提醒事项
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>提醒类型</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="reminderType"
                    value="normal"
                    checked={reminderType === "normal"}
                    onChange={(e) => setReminderType(e.target.value as "normal" | "birthday")}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">普通提醒</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="reminderType"
                    value="birthday"
                    checked={reminderType === "birthday"}
                    onChange={(e) => setReminderType(e.target.value as "normal" | "birthday")}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">🎂 生日提醒</span>
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminder-title">提醒事项</Label>
              <Textarea
                id="reminder-title"
                placeholder={reminderType === "birthday" ? "例如：生日快乐、生日祝福..." : "例如：项目跟进、定期联络..."}
                value={reminderTitle}
                onChange={(e) => setReminderTitle(e.target.value)}
                rows={3}
              />
            </div>
            {reminderType === "birthday" ? (
              <div className="space-y-2">
                <Label>生日日期</Label>
                <div className="flex gap-2">
                  <select
                    className="flex-1 px-3 py-2 border rounded-md"
                    value={birthMonth}
                    onChange={(e) => setBirthMonth(e.target.value)}
                  >
                    <option value="">选择月份</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                      <option key={month} value={month}>
                        {month}月
                      </option>
                    ))}
                  </select>
                  <select
                    className="flex-1 px-3 py-2 border rounded-md"
                    value={birthDay}
                    onChange={(e) => setBirthDay(e.target.value)}
                  >
                    <option value="">选择日期</option>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>
                        {day}日
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-muted-foreground">生日提醒将每年自动循环</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="reminder-date">提醒时间</Label>
                <input
                  id="reminder-date"
                  type="date"
                  className="w-full px-3 py-2 border rounded-md"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
            >
              取消
            </Button>
            <Button
              onClick={handleAddReminder}
              disabled={createReminder.isPending}
            >
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ContactDetail() {
  const [, params] = useRoute("/parent/contacts/:id");
  const [, setLocation] = useLocation();
  const contactId = params?.id ? parseInt(params.id) : 0;

  const utils = trpc.useUtils();

  const [showInteractionDialog, setShowInteractionDialog] = useState(false);
  const [interactionNote, setInteractionNote] = useState("");
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showReferrerDialog, setShowReferrerDialog] = useState(false);
  const [showQuickContactDialog, setShowQuickContactDialog] = useState(false);
  const [quickContactNote, setQuickContactNote] = useState("");
  const [showDeleteInteractionDialog, setShowDeleteInteractionDialog] = useState(false);
  const [interactionToDelete, setInteractionToDelete] = useState<any>(null);
  const [showEditInteractionDialog, setShowEditInteractionDialog] = useState(false);
  const [showEditNoteDialog, setShowEditNoteDialog] = useState(false);
  const [showEditDateDialog, setShowEditDateDialog] = useState(false);
  const [interactionToEdit, setInteractionToEdit] = useState<any>(null);
  const [editInteractionNote, setEditInteractionNote] = useState("");
  const [editInteractionDate, setEditInteractionDate] = useState("");
  const [selectedReferrerId, setSelectedReferrerId] = useState<number | null>(null);
  const [referrerSearchKeyword, setReferrerSearchKeyword] = useState("");
  const [showCreateTagDialog, setShowCreateTagDialog] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");
  
  // 个人标签相关state
  const [showCreatePersonalTagDialog, setShowCreatePersonalTagDialog] = useState(false);
  const [newPersonalTagName, setNewPersonalTagName] = useState("");
  const [newPersonalTagColor, setNewPersonalTagColor] = useState("#8b5cf6");
  const [isPersonalTagEditMode, setIsPersonalTagEditMode] = useState(false); // 编辑模式
  const [editingPersonalTag, setEditingPersonalTag] = useState<{ id: number; name: string; color: string } | null>(null);

  // 从localStorage加载可见性配置
  const [visibleStats, setVisibleStats] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem(`contact-stats-visibility-${contactId}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {
          daysSinceLastInteraction: true,
          totalInteractions: true,
          averageInteractionInterval: true,
          daysSinceAdded: true,
          maxInteractionInterval: true,
          monthlyInteractions: true,
        };
      }
    }
    return {
      daysSinceLastInteraction: true,
      totalInteractions: true,
      averageInteractionInterval: true,
      daysSinceAdded: true,
      maxInteractionInterval: true,
      monthlyInteractions: true,
    };
  });

  // 获取人脉详情
  const { data: contact, isLoading } = trpc.contacts.get.useQuery({ id: contactId });

  // 获取扩展信息字段值
  const { data: extendedFieldValues } = trpc.contacts.fieldValues.list.useQuery({ contactId });

  // 获取所有标签
  const { data: allTags } = trpc.contacts.tags.list.useQuery();
  
  // 获取个人标签
  const { data: personalTags } = trpc.contacts.personalTags.list.useQuery({ contactId });

  // 获取联络统计信息
  const { data: stats } = trpc.contacts.interactions.stats.useQuery({ contactId });

  // 获取可选择的介绍人列表（排除当前人脉）
  const { data: referrerOptions, isLoading: isLoadingReferrers } = trpc.contacts.listForReferrer.useQuery(
    { excludeContactId: contactId },
    { enabled: showReferrerDialog } // 只有当对话框打开时才加载
  );

  // 设置介绍人的mutation
  const setReferrerMutation = trpc.contacts.setReferrer.useMutation({
    onSuccess: () => {
      toast.success("介绍人设置成功");
      setShowReferrerDialog(false);
      setSelectedReferrerId(null);
      utils.contacts.get.invalidate({ id: contactId });
    },
    onError: (error) => {
      toast.error(error.message || "设置失败");
    },
  });

  // 定义默认的统计卡片顺序
  const defaultStatCards: StatCard[] = [
    {
      id: "daysSinceLastInteraction",
      title: "上次联络",
      value: "",
      color: "",
      getValue: (stats) => {
        if (stats.daysSinceLastInteraction !== null) {
          return `${stats.daysSinceLastInteraction}天`;
        }
        return "未联络";
      },
    },
    {
      id: "totalInteractions",
      title: "联络次数",
      value: "",
      color: "text-primary",
      getValue: (stats) => `${stats.totalInteractions}次`,
    },
    {
      id: "averageInteractionInterval",
      title: "平均间隔",
      value: "",
      color: "text-blue-600",
      getValue: (stats) => `${stats.averageInteractionInterval}天/次`,
    },
    {
      id: "daysSinceAdded",
      title: "添加至今",
      value: "",
      color: "text-green-600",
      getValue: (stats) => `${stats.daysSinceAdded}天`,
    },
    {
      id: "maxInteractionInterval",
      title: "最长间隔",
      value: "",
      color: "",
      getValue: (stats) => `${stats.maxInteractionInterval}天`,
      getColor: (stats) => 
        stats.maxInteractionInterval > 30 
          ? "text-red-700 font-bold" 
          : "text-red-600",
    },
    {
      id: "monthlyInteractions",
      title: "本月联络",
      value: "",
      color: "text-purple-600",
      getValue: (stats) => `${stats.monthlyInteractions}次`,
    },
  ];

  // 从localStorage加载排序设置
  const [statCards, setStatCards] = useState<StatCard[]>(() => {
    const saved = localStorage.getItem(`contact-stats-order-${contactId}`);
    if (saved) {
      try {
        const savedIds = JSON.parse(saved);
        return savedIds
          .map((id: string) => defaultStatCards.find((card) => card.id === id))
          .filter(Boolean);
      } catch {
        return defaultStatCards;
      }
    }
    return defaultStatCards;
  });

  // 更新统计卡片的值
  useEffect(() => {
    if (stats) {
      setStatCards((prev) =>
        prev.map((card) => ({
          ...card,
          value: card.getValue(stats),
          color:
            card.id === "daysSinceLastInteraction" &&
            stats.daysSinceLastInteraction !== null &&
            stats.daysSinceLastInteraction > 30
              ? "text-orange-600"
              : card.color,
        }))
      );
    }
  }, [stats]);

  // 拖拽传感器
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
      setStatCards((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);

        // 保存到localStorage
        localStorage.setItem(
          `contact-stats-order-${contactId}`,
          JSON.stringify(newItems.map((item) => item.id))
        );

        return newItems;
      });
    }
  };

  // 记录联络
  const createInteraction = trpc.contacts.interactions.create.useMutation({
    onSuccess: () => {
      toast.success("联络记录已保存");
      setShowInteractionDialog(false);
      setInteractionNote("");
      utils.contacts.get.invalidate({ id: contactId });
      utils.contacts.list.invalidate();
      utils.contacts.interactions.stats.invalidate({ contactId });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // 快速记录联络（支持可选备注）
  const quickRecordInteraction = () => {
    const note = quickContactNote.trim() || "快捷联络";
    createInteraction.mutate({ contactId, note });
    setShowQuickContactDialog(false);
    setQuickContactNote("");
  };

  // 删除联络记录
  const deleteInteraction = trpc.contacts.interactions.delete.useMutation({
    onSuccess: () => {
      toast.success("联络记录已删除");
      setShowDeleteInteractionDialog(false);
      setInteractionToDelete(null);
      utils.contacts.get.invalidate({ id: contactId });
      utils.contacts.list.invalidate();
      utils.contacts.interactions.stats.invalidate({ contactId });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const confirmDeleteInteraction = () => {
    if (interactionToDelete) {
      deleteInteraction.mutate({ interactionId: interactionToDelete.id });
    }
  };

  // 更新联络记录
  const updateInteraction = trpc.contacts.interactions.update.useMutation({
    onSuccess: () => {
      toast.success("联络记录已更新");
      setShowEditInteractionDialog(false);
      setShowEditNoteDialog(false);
      setShowEditDateDialog(false);
      setInteractionToEdit(null);
      setEditInteractionNote("");
      setEditInteractionDate("");
      utils.contacts.get.invalidate({ id: contactId });
      utils.contacts.list.invalidate();
      utils.contacts.interactions.stats.invalidate({ contactId });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const confirmEditInteraction = () => {
    if (interactionToEdit) {
      updateInteraction.mutate({
        interactionId: interactionToEdit.id,
        note: editInteractionNote,
        interactionDate: editInteractionDate ? new Date(editInteractionDate) : undefined,
      });
    }
  };

  const confirmEditNote = () => {
    if (interactionToEdit) {
      updateInteraction.mutate({
        interactionId: interactionToEdit.id,
        note: editInteractionNote,
      });
      setShowEditNoteDialog(false);
    }
  };

  const confirmEditDate = () => {
    if (interactionToEdit && editInteractionDate) {
      updateInteraction.mutate({
        interactionId: interactionToEdit.id,
        interactionDate: new Date(editInteractionDate),
      });
      setShowEditDateDialog(false);
    }
  };

  // 添加标签
  const addTag = trpc.contacts.tags.addToContact.useMutation({
    onSuccess: () => {
      toast.success("标签已添加");
      utils.contacts.get.invalidate({ id: contactId });
    },
  });

  // 移除标签
  const removeTag = trpc.contacts.tags.removeFromContact.useMutation({
    onSuccess: () => {
      toast.success("标签已移除");
      utils.contacts.get.invalidate({ id: contactId });
    },
  });

  // 创建标签
  const createTagMutation = trpc.contacts.tags.create.useMutation({
    onSuccess: () => {
      toast.success("标签创建成功");
      setShowCreateTagDialog(false);
      setNewTagName("");
      setNewTagColor("#3b82f6");
      // 刷新标签列表
      utils.contacts.tags.list.invalidate();
      utils.contacts.get.invalidate({ id: contactId });
    },
    onError: (error) => {
      toast.error("创建失败：" + error.message);
    },
  });

  const handleCreateTag = () => {
    if (!newTagName.trim()) {
      toast.error("请输入标签名称");
      return;
    }
    createTagMutation.mutate({
      name: newTagName.trim(),
      color: newTagColor,
    });
  };

  // 个人标签的mutation
  const createPersonalTagMutation = trpc.contacts.personalTags.create.useMutation({
    onSuccess: () => {
      toast.success("个人标签创建成功");
      setShowCreatePersonalTagDialog(false);
      setNewPersonalTagName("");
      setNewPersonalTagColor("#8b5cf6");
      utils.contacts.personalTags.list.invalidate({ contactId });
    },
    onError: (error) => {
      toast.error("创建失败：" + error.message);
    },
  });

  const updatePersonalTagMutation = trpc.contacts.personalTags.update.useMutation({
    onSuccess: () => {
      toast.success("个人标签更新成功");
      setEditingPersonalTag(null);
      utils.contacts.personalTags.list.invalidate({ contactId });
    },
    onError: (error) => {
      toast.error("更新失败：" + error.message);
    },
  });

  const deletePersonalTagMutation = trpc.contacts.personalTags.delete.useMutation({
    onSuccess: () => {
      toast.success("个人标签已删除");
      utils.contacts.personalTags.list.invalidate({ contactId });
    },
    onError: (error) => {
      toast.error("删除失败：" + error.message);
    },
  });

  const handleCreatePersonalTag = () => {
    if (!newPersonalTagName.trim()) {
      toast.error("请输入标签名称");
      return;
    }
    createPersonalTagMutation.mutate({
      contactId,
      name: newPersonalTagName.trim(),
      color: newPersonalTagColor,
    });
  };

  const handleUpdatePersonalTag = () => {
    if (!editingPersonalTag) return;
    if (!editingPersonalTag.name.trim()) {
      toast.error("请输入标签名称");
      return;
    }
    updatePersonalTagMutation.mutate({
      id: editingPersonalTag.id,
      name: editingPersonalTag.name.trim(),
      color: editingPersonalTag.color,
    });
  };

  const handleDeletePersonalTag = (tagId: number) => {
    if (confirm("确定要删除这个个人标签吗？")) {
      deletePersonalTagMutation.mutate({ id: tagId });
    }
  };

  const handleRecordInteraction = () => {
    createInteraction.mutate({
      contactId,
      note: interactionNote || undefined,
    });
  };

  const handleToggleTag = (tagId: number) => {
    const hasTag = contact?.tags.some(t => t.id === tagId);
    if (hasTag) {
      removeTag.mutate({ contactId, tagId });
    } else {
      addTag.mutate({ contactId, tagId });
    }
  };

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="text-center py-12 text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="container py-8">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">人脉不存在</p>
            <Button onClick={() => setLocation("/parent/contacts")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回好友记
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8">


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：基本信息 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 基本信息卡片 */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-2xl">{contact.name}</CardTitle>
                  {contact.hasReferrer !== undefined && (
                    contact.hasReferrer ? (
                      <UserCheck className="h-5 w-5 text-blue-500 flex-shrink-0" title="有推荐人" />
                    ) : (
                      <UserX className="h-5 w-5 text-gray-400 flex-shrink-0" title="无推荐人" />
                    )
                  )}
                </div>
                <div>
                  {contact.occupation && (
                    <CardDescription className="text-base mt-1">
                      <Briefcase className="inline h-4 w-4 mr-1" />
                      {contact.occupation}
                    </CardDescription>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    size="icon"
                    variant="ghost"
                    onClick={() => setShowQuickContactDialog(true)}
                    disabled={createInteraction.isPending}
                    title="记录联络"
                  >
                    <MessageCircle 
                      className={`h-5 w-5 ${
                        contact.hasTodayInteraction 
                          ? 'text-gray-400' 
                          : 'text-blue-500'
                      }`} 
                    />
                  </Button>
                  <Button 
                    size="icon"
                    variant="ghost"
                    onClick={() => setLocation("/parent/contacts")}
                    title="返回"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 基本信息：称谓、性别、地区 */}
              {contact.title && (
                <div className="flex items-center text-sm">
                  <User className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span>称谓：{contact.title}</span>
                </div>
              )}
              
              {contact.gender && (
                <div className="flex items-center text-sm">
                  <User className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span>性别：{contact.gender}</span>
                </div>
              )}
              
              {/* 显示地区 */}
              {contact.region && (
                <div className="flex items-center text-sm">
                  <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span>所在地区：{contact.region}</span>
                </div>
              )}
              
              {/* 显示扩展信息字段值 */}
              {extendedFieldValues && extendedFieldValues.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="text-xs font-medium text-muted-foreground mb-2">扩展信息</div>
                  {extendedFieldValues.map((fv: any) => (
                    <div key={fv.id} className="flex items-start text-sm">
                      <Tag className="h-4 w-4 mr-2 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <div>
                        <span className="font-medium text-muted-foreground">{fv.categoryName}：</span>
                        <span>{fv.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {contact.phone && (
                <div className="flex items-center text-sm">
                  <Phone className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span>{contact.phone}</span>
                </div>
              )}
              
              {contact.wechat && (
                <div className="flex items-center text-sm">
                  <MessageCircle className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span>{contact.wechat}</span>
                </div>
              )}
              
              {contact.address && (
                <div className="flex items-start text-sm">
                  <MapPin className="h-4 w-4 mr-2 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <span>{contact.address}</span>
                </div>
              )}

              {/* 联络统计信息 - 可拖拽排序 */}
              {stats && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-muted-foreground">联络统计</h3>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation(`/parent/contacts/add?id=${contactId}&mode=edit`)}
                      >
                        编辑信息
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowConfigDialog(true)}
                      >
                        <Settings className="h-4 w-4 mr-1" />
                        配置
                      </Button>

                    </div>
                  </div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={statCards.filter(card => visibleStats[card.id]).map((card) => card.id)}
                      strategy={rectSortingStrategy}
                    >
                      <div className="grid grid-cols-3 gap-2">
                        {statCards.filter(card => visibleStats[card.id]).map((card) => {
                          // 计算显示的值和颜色
                          const displayCard = {
                            ...card,
                            value: card.getValue(stats),
                            color: card.getColor ? card.getColor(stats) : card.color,
                          };
                          return <SortableStatCard key={card.id} card={displayCard} />;
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              )}
            </CardContent>
          </Card>



          {/* 标签管理 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center">
                    <Tag className="h-5 w-5 mr-2" />
                    标签
                  </CardTitle>
                  <CardDescription>点击标签可以添加或移除</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowCreateTagDialog(true)}
                  >
                    +
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setLocation("/parent/contacts/tags")}
                  >
                    编辑
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {allTags?.map((tag) => {
                  const isActive = contact.tags.some(t => t.id === tag.id);
                  return (
                    <Badge
                      key={tag.id}
                      variant={isActive ? "default" : "outline"}
                      className="cursor-pointer transition-all hover:scale-105"
                      style={{
                        backgroundColor: isActive ? tag.color : '#ffffff',
                        borderColor: isActive ? tag.color : '#d1d5db',
                        color: isActive ? '#fff' : '#9ca3af',
                      }}
                      onClick={() => handleToggleTag(tag.id)}
                    >
                      {tag.name}
                    </Badge>
                  );
                })}
                {allTags && allTags.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    暂无标签，请先在<Button variant="link" className="p-0 h-auto" onClick={() => setLocation("/parent/contacts/tags")}>标签管理</Button>中创建标签
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 个人标签 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center">
                    <User className="h-5 w-5 mr-2" />
                    个人标签
                  </CardTitle>
                  <CardDescription>仅针对这个人脉的自定义标签</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowCreatePersonalTagDialog(true)}
                  >
                    + 添加
                  </Button>
                  {personalTags && personalTags.length > 0 && (
                    <Button 
                      variant={isPersonalTagEditMode ? "default" : "outline"}
                      size="sm"
                      onClick={() => setIsPersonalTagEditMode(!isPersonalTagEditMode)}
                    >
                      {isPersonalTagEditMode ? "完成" : "编辑"}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {personalTags && personalTags.length > 0 ? (
                  personalTags.map((tag) => (
                    <div key={tag.id} className="inline-flex items-center">
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs text-white cursor-pointer transition-all hover:scale-105"
                        style={{
                          backgroundColor: tag.color || '#8b5cf6',
                        }}
                        onClick={() => setEditingPersonalTag({ id: tag.id, name: tag.name, color: tag.color })}
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                        </svg>
                        {tag.name}
                      </span>
                      {isPersonalTagEditMode && (
                        <button
                          className="ml-1 p-0.5 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePersonalTag(tag.id);
                          }}
                          title="删除标签"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">
                    暂无个人标签，点击"+ 添加"创建第一个
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 提醒管理 */}
          <ReminderCard contactId={contactId} contactName={contact.name} />

          {/* 联络历史 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="h-5 w-5 mr-2" />
                联络历史
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* 联络历史列表 */}
              {contact.interactions && contact.interactions.length > 0 ? (
                <div className="space-y-4">
                  {contact.interactions.map((interaction) => (
                    <div
                      key={interaction.id}
                      className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg group"
                    >
                      <Clock className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {format(new Date(interaction.interactionDate), "yyyy年MM月dd日 HH:mm", { locale: zhCN })}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {interaction.note || "快捷联络"}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setInteractionToEdit(interaction);
                              setEditInteractionNote(interaction.note || "");
                              setEditInteractionDate(format(new Date(interaction.interactionDate), "yyyy-MM-dd'T'HH:mm"));
                              setShowEditNoteDialog(true);
                            }}
                          >
                            修改备注
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setInteractionToEdit(interaction);
                              setEditInteractionNote(interaction.note || "");
                              setEditInteractionDate(format(new Date(interaction.interactionDate), "yyyy-MM-dd'T'HH:mm"));
                              setShowEditDateDialog(true);
                            }}
                          >
                            修改时间
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              setInteractionToDelete(interaction);
                              setShowDeleteInteractionDialog(true);
                            }}
                          >
                            删除记录
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  还没有联络记录，点击上方按钮记录第一次联络吧！
                </div>
              )}
            </CardContent>
          </Card>

          {/* 介绍人贡献 */}
          {contact.referrerContribution && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <span className="text-2xl mr-2">🏆</span>
                  介绍人贡献
                </CardTitle>
                <CardDescription>该人脉作为介绍人的贡献统计</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                    <div className="text-sm text-muted-foreground mb-1">直接推荐</div>
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {contact.referrerContribution.directReferrals}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">人</div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
                    <div className="text-sm text-muted-foreground mb-1">间接推荐</div>
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {contact.referrerContribution.indirectReferrals}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">人</div>
                  </div>
                  <div className="text-center p-4 bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-950/30 dark:to-orange-950/30 rounded-lg">
                    <div className="text-sm text-muted-foreground mb-1">贡献值</div>
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {contact.referrerContribution.totalScore}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">分</div>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">
                    <strong>计算规则：</strong>第1层权重1.0，第2层权重0.5，第N层权重0.5^(N-1)
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 引荐人 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <UserCheck className="h-5 w-5 mr-2" />
                引荐人
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* 介绍人 - 使用独立的设置功能 */}
                <div className="flex items-center gap-2">
                  {contact.referrer ? (
                    <>
                      <span className="text-sm">
                        {contact.referrer.name} {contact.referrer.title ? `(${contact.referrer.title})` : ""}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setShowReferrerDialog(true)}
                      >
                        修改
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setShowReferrerDialog(true)}
                    >
                      + 设置引荐人
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>


      </div>

      {/* 配置对话框 */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>统计项配置</DialogTitle>
            <DialogDescription>
              选择您想要显示的统计项
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {defaultStatCards.map((card) => (
              <div key={card.id} className="flex items-center space-x-2">
                <Checkbox
                  id={card.id}
                  checked={visibleStats[card.id]}
                  onCheckedChange={(checked) => {
                    const newVisibleStats = {
                      ...visibleStats,
                      [card.id]: checked as boolean,
                    };
                    setVisibleStats(newVisibleStats);
                    localStorage.setItem(
                      `contact-stats-visibility-${contactId}`,
                      JSON.stringify(newVisibleStats)
                    );
                  }}
                />
                <label
                  htmlFor={card.id}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {card.title}
                </label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowConfigDialog(false)}>
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 记录联络对话框 */}
      <Dialog open={showInteractionDialog} onOpenChange={setShowInteractionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>记录联络</DialogTitle>
            <DialogDescription>
              记录与 {contact.name} 的联络情况
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="note">备注（可选）</Label>
              <Textarea
                id="note"
                placeholder="记录本次联络的内容..."
                value={interactionNote}
                onChange={(e) => setInteractionNote(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowInteractionDialog(false)}
            >
              取消
            </Button>
            <Button
              onClick={handleRecordInteraction}
              disabled={createInteraction.isPending}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 设置介绍人对话框 - 模糊搜索方式 */}
      <Dialog open={showReferrerDialog} onOpenChange={(open) => {
        setShowReferrerDialog(open);
        if (!open) {
          setSelectedReferrerId(null);
          setReferrerSearchKeyword("");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>设置介绍人</DialogTitle>
            <DialogDescription>
              输入姓名或称谓搜索介绍人
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* 搜索输入框 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索人脉姓名或称谓..."
                value={referrerSearchKeyword}
                onChange={(e) => setReferrerSearchKeyword(e.target.value)}
                className="pl-9"
              />
            </div>
            
            {isLoadingReferrers ? (
              <div className="text-center py-4 text-muted-foreground">加载中...</div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {/* 无介绍人选项 - 始终显示 */}
                <div
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedReferrerId === null && !contact.referrer
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                  onClick={() => {
                    setSelectedReferrerId(null);
                    setReferrerSearchKeyword("");
                  }}
                >
                  <div className="text-sm text-muted-foreground">无介绍人</div>
                </div>
                
                {/* 模糊搜索结果 */}
                {referrerOptions && referrerOptions.length > 0 ? (
                  referrerOptions
                    .filter((c) => {
                      if (!referrerSearchKeyword.trim()) return true;
                      const keyword = referrerSearchKeyword.toLowerCase();
                      return (
                        c.name.toLowerCase().includes(keyword) ||
                        (c.title && c.title.toLowerCase().includes(keyword))
                      );
                    })
                    .map((c) => (
                      <div
                        key={c.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedReferrerId === c.id || (selectedReferrerId === null && contact.referrer?.id === c.id)
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted/50"
                        }`}
                        onClick={() => {
                          setSelectedReferrerId(c.id);
                          setReferrerSearchKeyword("");
                        }}
                      >
                        <div className="font-medium">
                          {/* 高亮匹配的关键字 */}
                          {referrerSearchKeyword.trim() ? (
                            <HighlightText text={c.name} keyword={referrerSearchKeyword} />
                          ) : (
                            c.name
                          )}
                        </div>
                        {c.title && (
                          <div className="text-sm text-muted-foreground">
                            {referrerSearchKeyword.trim() ? (
                              <HighlightText text={c.title} keyword={referrerSearchKeyword} />
                            ) : (
                              c.title
                            )}
                          </div>
                        )}
                      </div>
                    ))
                ) : (
                  <div className="text-center py-4 text-muted-foreground">暂无其他人脉可选择</div>
                )}
                
                {/* 搜索无结果提示 */}
                {referrerSearchKeyword.trim() && referrerOptions && 
                  referrerOptions.filter((c) => {
                    const keyword = referrerSearchKeyword.toLowerCase();
                    return (
                      c.name.toLowerCase().includes(keyword) ||
                      (c.title && c.title.toLowerCase().includes(keyword))
                    );
                  }).length === 0 && (
                  <div className="text-center py-4 text-muted-foreground">
                    未找到匹配“{referrerSearchKeyword}”的人脉
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowReferrerDialog(false);
                setSelectedReferrerId(null);
                setReferrerSearchKeyword("");
              }}
            >
              取消
            </Button>
            <Button
              onClick={() => {
                setReferrerMutation.mutate({
                  contactId,
                  referrerId: selectedReferrerId,
                });
              }}
              disabled={setReferrerMutation.isPending}
            >
              {setReferrerMutation.isPending ? "保存中..." : "确定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 快捷联络确认对话框 */}
      <Dialog open={showQuickContactDialog} onOpenChange={(open) => {
        setShowQuickContactDialog(open);
        if (!open) {
          setQuickContactNote("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>记录联络</DialogTitle>
            <DialogDescription>
              {contact?.hasTodayInteraction 
                ? `今天已经记录过与 "${contact?.name}" 的联络，单日确认上限1次`
                : `记录与 "${contact?.name}" 的本次联络`
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-3">
            <Button 
              onClick={quickRecordInteraction}
              disabled={createInteraction.isPending || contact?.hasTodayInteraction}
              className="w-full"
            >
              {createInteraction.isPending ? "记录中..." : "确认记录"}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setShowQuickContactDialog(false)}
              className="w-full"
            >
              取消
            </Button>
            {!contact?.hasTodayInteraction && (
              <div className="w-full">
                <Input
                  placeholder="输入备注（可选）"
                  value={quickContactNote}
                  onChange={(e) => setQuickContactNote(e.target.value)}
                />
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除联络记录确认对话框 */}
      <Dialog open={showDeleteInteractionDialog} onOpenChange={(open) => {
        setShowDeleteInteractionDialog(open);
        if (!open) {
          setInteractionToDelete(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除这条联络记录吗？此操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowDeleteInteractionDialog(false);
                setInteractionToDelete(null);
              }}
            >
              取消
            </Button>
            <Button 
              variant="destructive"
              onClick={confirmDeleteInteraction}
              disabled={deleteInteraction.isPending}
            >
              {deleteInteraction.isPending ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 修改备注对话框 */}
      <Dialog open={showEditNoteDialog} onOpenChange={(open) => {
        setShowEditNoteDialog(open);
        if (!open) {
          setInteractionToEdit(null);
          setEditInteractionNote("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改备注</DialogTitle>
            <DialogDescription>
              修改联络记录的备注内容
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              placeholder="输入备注（可选）"
              value={editInteractionNote}
              onChange={(e) => setEditInteractionNote(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowEditNoteDialog(false);
                setInteractionToEdit(null);
                setEditInteractionNote("");
              }}
            >
              取消
            </Button>
            <Button 
              onClick={confirmEditNote}
              disabled={updateInteraction.isPending}
            >
              {updateInteraction.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 修改时间对话框 */}
      <Dialog open={showEditDateDialog} onOpenChange={(open) => {
        setShowEditDateDialog(open);
        if (!open) {
          setInteractionToEdit(null);
          setEditInteractionDate("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改时间</DialogTitle>
            <DialogDescription>
              修改联络记录的时间
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              type="datetime-local"
              value={editInteractionDate}
              onChange={(e) => setEditInteractionDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowEditDateDialog(false);
                setInteractionToEdit(null);
                setEditInteractionDate("");
              }}
            >
              取消
            </Button>
            <Button 
              onClick={confirmEditDate}
              disabled={updateInteraction.isPending}
            >
              {updateInteraction.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 创建标签对话框 */}
      <Dialog open={showCreateTagDialog} onOpenChange={(open) => {
        setShowCreateTagDialog(open);
        if (!open) {
          setNewTagName("");
          setNewTagColor("#3b82f6");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建新标签</DialogTitle>
            <DialogDescription>
              为人脉创建一个新的标签分类
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tag-name">标签名称</Label>
              <Input
                id="tag-name"
                placeholder="输入标签名称"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag-color">标签颜色</Label>
              <div className="flex items-center gap-2">
                <input
                  id="tag-color"
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="h-10 w-20 rounded border cursor-pointer"
                />
                <div 
                  className="flex-1 h-10 rounded border"
                  style={{ backgroundColor: newTagColor }}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateTagDialog(false);
                setNewTagName("");
                setNewTagColor("#3b82f6");
              }}
            >
              取消
            </Button>
            <Button
              onClick={handleCreateTag}
              disabled={!newTagName.trim() || createTagMutation.isPending}
            >
              {createTagMutation.isPending ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 创建个人标签对话框 */}
      <Dialog open={showCreatePersonalTagDialog} onOpenChange={(open) => {
        setShowCreatePersonalTagDialog(open);
        if (!open) {
          setNewPersonalTagName("");
          setNewPersonalTagColor("#8b5cf6");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建个人标签</DialogTitle>
            <DialogDescription>
              为这个人脉创建一个专属的个人标签
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="personal-tag-name">标签名称</Label>
              <Input
                id="personal-tag-name"
                placeholder="输入标签名称"
                value={newPersonalTagName}
                onChange={(e) => setNewPersonalTagName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="personal-tag-color">标签颜色</Label>
              <div className="grid grid-cols-8 gap-2">
                {[
                  '#8b5cf6', // 紫色
                  '#3b82f6', // 蓝色
                  '#06b6d4', // 青色
                  '#10b981', // 绿色
                  '#22c55e', // 浅绿
                  '#84cc16', // 青绿
                  '#eab308', // 黄色
                  '#f97316', // 橙色
                  '#ef4444', // 红色
                  '#ec4899', // 粉色
                  '#f43f5e', // 玫红
                  '#a855f7', // 深紫
                  '#6366f1', // 靖蓝
                  '#0ea5e9', // 天蓝
                  '#14b8a6', // 鸦绿
                  '#64748b', // 灰色
                ].map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${newPersonalTagColor === color ? 'border-gray-900 ring-2 ring-offset-2 ring-gray-400' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewPersonalTagColor(color)}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-sm text-muted-foreground">自定义:</span>
                <input
                  id="personal-tag-color"
                  type="color"
                  value={newPersonalTagColor}
                  onChange={(e) => setNewPersonalTagColor(e.target.value)}
                  className="h-8 w-12 rounded border cursor-pointer"
                />
                <div 
                  className="flex-1 h-8 rounded-full"
                  style={{ backgroundColor: newPersonalTagColor }}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreatePersonalTagDialog(false);
                setNewPersonalTagName("");
                setNewPersonalTagColor("#8b5cf6");
              }}
            >
              取消
            </Button>
            <Button
              onClick={handleCreatePersonalTag}
              disabled={!newPersonalTagName.trim() || createPersonalTagMutation.isPending}
            >
              {createPersonalTagMutation.isPending ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑个人标签对话框 */}
      <Dialog open={!!editingPersonalTag} onOpenChange={(open) => {
        if (!open) setEditingPersonalTag(null);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑个人标签</DialogTitle>
            <DialogDescription>
              修改标签名称或颜色
            </DialogDescription>
          </DialogHeader>
          {editingPersonalTag && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-personal-tag-name">标签名称</Label>
                <Input
                  id="edit-personal-tag-name"
                  placeholder="输入标签名称"
                  value={editingPersonalTag.name}
                  onChange={(e) => setEditingPersonalTag({ ...editingPersonalTag, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-personal-tag-color">标签颜色</Label>
                <div className="grid grid-cols-8 gap-2">
                  {[
                    '#8b5cf6', // 紫色
                    '#3b82f6', // 蓝色
                    '#06b6d4', // 青色
                    '#10b981', // 绿色
                    '#22c55e', // 浅绿
                    '#84cc16', // 青绿
                    '#eab308', // 黄色
                    '#f97316', // 橙色
                    '#ef4444', // 红色
                    '#ec4899', // 粉色
                    '#f43f5e', // 玫红
                    '#a855f7', // 深紫
                    '#6366f1', // 靖蓝
                    '#0ea5e9', // 天蓝
                    '#14b8a6', // 鸦绿
                    '#64748b', // 灰色
                  ].map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${editingPersonalTag.color === color ? 'border-gray-900 ring-2 ring-offset-2 ring-gray-400' : 'border-transparent'}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setEditingPersonalTag({ ...editingPersonalTag, color })}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-sm text-muted-foreground">自定义:</span>
                  <input
                    id="edit-personal-tag-color"
                    type="color"
                    value={editingPersonalTag.color}
                    onChange={(e) => setEditingPersonalTag({ ...editingPersonalTag, color: e.target.value })}
                    className="h-8 w-12 rounded border cursor-pointer"
                  />
                  <div 
                    className="flex-1 h-8 rounded-full"
                    style={{ backgroundColor: editingPersonalTag.color }}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingPersonalTag(null)}
            >
              取消
            </Button>
            <Button
              onClick={handleUpdatePersonalTag}
              disabled={!editingPersonalTag?.name.trim() || updatePersonalTagMutation.isPending}
            >
              {updatePersonalTagMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
