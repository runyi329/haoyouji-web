import React, { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, ArrowLeft, X, Tag, Settings, Pencil, Trash2, MoreVertical, MessageCircle, UserCheck, UserX, Smile, Layers2, Layers3, Undo, Handshake, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { InteractionHistoryDialog } from "@/components/InteractionHistoryDialog";
import { ReferralRelationshipDialog } from "@/components/ReferralRelationshipDialog";
import { CompanyReportIcon } from "@/components/CompanyReportIcon";
import { CompanyReportDialog } from "@/components/CompanyReportDialog";
import { CompanyListDialog } from "@/components/CompanyListDialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { LogIn, LogOut } from "lucide-react";
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
    <Card ref={setNodeRef} style={style} className="p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </div>
          <div
            className="w-4 h-4 rounded-full flex-shrink-0"
            style={{ backgroundColor: mapColorToTheme(tag.color || "#3b82f6") }}
          />
          <span className="font-medium truncate">{tag.name}</span>
          <span className="text-xs text-muted-foreground">({tag.contactCount || 0}人)</span>
          {tag.isPreset && (
            <span className="text-xs text-muted-foreground">(预设)</span>
          )}
        </div>
        {!tag.isPreset && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// 将任意颜色映射到最接近的主题色
function mapColorToTheme(color: string): string {
  const root = document.documentElement;
  const primary = getComputedStyle(root).getPropertyValue('--color-primary').trim() || '#9333EA';
  const secondary = getComputedStyle(root).getPropertyValue('--color-secondary').trim() || '#A78BFA';
  const text = getComputedStyle(root).getPropertyValue('--color-text').trim() || '#3F3852';
  const accent2 = getComputedStyle(root).getPropertyValue('--color-accent2').trim() || '#8B7FA0';
  
  // 如果颜色已经是主题色，直接返回
  if ([primary, secondary, text, accent2].includes(color)) {
    return color;
  }
  
  // 生成主题色变化
  const themeColors = [
    primary,
    `color-mix(in srgb, ${primary} 50%, white)`,
    `color-mix(in srgb, ${primary} 80%, black)`,
    secondary,
    `color-mix(in srgb, ${secondary} 50%, white)`,
    `color-mix(in srgb, ${secondary} 80%, black)`,
    text,
    `color-mix(in srgb, ${text} 50%, white)`,
    `color-mix(in srgb, ${text} 80%, black)`,
    accent2,
    `color-mix(in srgb, ${accent2} 50%, white)`,
    `color-mix(in srgb, ${accent2} 80%, black)`,
  ];
  
  // 根据颜色的哈希值选择一个主题色（保持一致性）
  const hash = color.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return themeColors[hash % themeColors.length];
}

// 基于主题色生成标签颜色选项
function getThemeBasedColorOptions(): string[] {
  const root = document.documentElement;
  const primary = getComputedStyle(root).getPropertyValue('--color-primary').trim() || '#9333EA';
  const secondary = getComputedStyle(root).getPropertyValue('--color-secondary').trim() || '#A78BFA';
  const text = getComputedStyle(root).getPropertyValue('--color-text').trim() || '#3F3852';
  const accent1 = getComputedStyle(root).getPropertyValue('--color-accent1').trim() || '#FFFFFF';
  const accent2 = getComputedStyle(root).getPropertyValue('--color-accent2').trim() || '#8B7FA0';
  
  // 为每种主题色生成深浅变化
  const colors = [primary, secondary, text, accent2];
  const variations: string[] = [];
  
  colors.forEach(color => {
    // 添加原色
    variations.push(color);
    // 添加浅色版本（混合50%白色）
    variations.push(`color-mix(in srgb, ${color} 50%, white)`);
    // 添加深色版本（混合20%黑色）
    variations.push(`color-mix(in srgb, ${color} 80%, black)`);
  });
  
  return variations;
}

// 预定义的颜色选项（作为默认值）
const COLOR_OPTIONS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#eab308", "#14b8a6", "#f97316",
  "#a855f7", "#22c55e", "#f43f5e", "#0ea5e9", "#d946ef",
  "#84cc16", "#fb923c", "#6366f1", "#a3e635", "#fb7185",
];

const SEARCH_HISTORY_KEY = "contactsSearchHistory";
const MAX_HISTORY_ITEMS = 5;

// 根据距离上次联络的天数返回颜色（使用主题色）
function getInteractionStatusColor(days: number | null): string {
  const primary = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#9333EA';
  const secondary = getComputedStyle(document.documentElement).getPropertyValue('--color-secondary').trim() || '#A78BFA';
  const accent2 = getComputedStyle(document.documentElement).getPropertyValue('--color-accent2').trim() || '#8B7FA0';
  
  if (days === null) return accent2; // 从未联络：使用强调色2
  if (days <= 30) return primary; // 0-30天：使用主色
  if (days <= 90) return secondary; // 31-90天：使用辅色
  return accent2; // 91天以上：使用强调色2
}

// 格式化日期为"2025年1月10日"
function formatDate(timestamp: number | null): string {
  if (!timestamp) return '从未联络';
  const date = new Date(timestamp);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export default function ContactsList() {
  const { user, isAuthenticated, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const searchParams = useSearch();
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  
  // 标签管理相关状态
  const [showTagManagement, setShowTagManagement] = useState(false);
  const [showCreateTagDialog, setShowCreateTagDialog] = useState(false);
  const [showEditTagDialog, setShowEditTagDialog] = useState(false);
  const [showDeleteTagDialog, setShowDeleteTagDialog] = useState(false);
  const [selectedTag, setSelectedTag] = useState<any>(null);
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState(COLOR_OPTIONS[0]);
  
  // 使用主题色生成的颜色选项
  const [themeColorOptions, setThemeColorOptions] = useState<string[]>([]);
  
  // 初始化主题颜色选项
  useEffect(() => {
    const updateColorOptions = () => {
      const options = getThemeBasedColorOptions();
      setThemeColorOptions(options);
      // 如果当前标签颜色是默认值，更新为主题色
      if (tagColor === COLOR_OPTIONS[0]) {
        setTagColor(options[0]);
      }
    };
    updateColorOptions();
    // 监听主题变化
    const observer = new MutationObserver(updateColorOptions);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style']
    });
    return () => observer.disconnect();
  }, []);
  
  // 多选模式状态
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  
  // 标签区域展开/收起状态
  const [isTagAreaExpanded, setIsTagAreaExpanded] = useState(false);
  
  // 共享人脉筛选状态：'all' = 全部、'mine' = 我的、'shared' = 共享
  const [shareFilter, setShareFilter] = useState<'all' | 'mine' | 'shared'>('all');
  
  // 排序状态（从 localStorage 读取）
  const SORT_BY_KEY = 'contacts_list_sort_by';
  const [sortBy, setSortBy] = useState<'tagCount_desc' | 'tagCount_asc' | 'interactionCount_desc' | 'interactionCount_asc' | undefined>(() => {
    const saved = localStorage.getItem(SORT_BY_KEY);
    return saved ? (saved as any) : undefined;
  });
  
  // 当 sortBy 变化时保存到 localStorage
  React.useEffect(() => {
    if (sortBy) {
      localStorage.setItem(SORT_BY_KEY, sortBy);
    } else {
      localStorage.removeItem(SORT_BY_KEY);
    }
  }, [sortBy]);
  
  // 批量选择人脉状态
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [isBatchOperating, setIsBatchOperating] = useState(false);
  
  // 批量操作确认对话框状态
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: 'add' | 'remove' | 'cycle';
    tagId?: number;
    tagName?: string;
    onConfirm?: () => void;
  }>({ open: false, type: 'add' });
  
  // 批量操作历史记录
  type OperationHistory = {
    type: 'add' | 'remove';
    contactIds: number[];
    tagId: number;
    tagName: string;
    timestamp: number;
  };
  const [operationHistory, setOperationHistory] = useState<OperationHistory[]>([]);
  
  // 删除对话框状态
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<any>(null);
  
  // 快捷联络对话框状态
  const [showQuickContactDialog, setShowQuickContactDialog] = useState(false);
  const [contactToRecord, setContactToRecord] = useState<any>(null);
  const [quickContactNote, setQuickContactNote] = useState("");
  
  // 互动记录对话框状态
  const [showInteractionDialog, setShowInteractionDialog] = useState(false);
  const [selectedContactForInteraction, setSelectedContactForInteraction] = useState<any>(null);
  
  // 推荐关系对话框状态
  const [showReferralDialog, setShowReferralDialog] = useState(false);
  const [selectedContactForReferral, setSelectedContactForReferral] = useState<any>(null);
  const [referralType, setReferralType] = useState<'direct' | 'indirect'>('direct');
  
  // 企业报告对话框状态
  const [showCompanyReportDialog, setShowCompanyReportDialog] = useState(false);
  const [selectedCompanyForReport, setSelectedCompanyForReport] = useState<string>('');
  
  // 公司列表弹窗状态
  const [showCompanyListDialog, setShowCompanyListDialog] = useState(false);
  const [selectedContactForCompanyList, setSelectedContactForCompanyList] = useState<any>(null);
  
  // 获取URL参数中的筛选条件
  const urlParams = new URLSearchParams(searchParams);
  const filterType = urlParams.get('filter'); // thisWeek, thisMonth, thisYear
  const tagIdParam = urlParams.get('tag'); // 标签ID筛选（支持多个，用逗号分隔）
  const viewMode = urlParams.get('view'); // 视图模式：company显示公司信息
  
  // 调试日志
  console.log('[ContactsList] searchParams:', searchParams);
  console.log('[ContactsList] viewMode:', viewMode);
  console.log('[ContactsList] viewMode === "company":', viewMode === 'company');
  
  // 解析选中的标签ID列表
  const selectedTagIds = React.useMemo(() => {
    if (!tagIdParam) return [];
    return tagIdParam.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
  }, [tagIdParam]);
  
  // 兼容旧的单选逻辑
  const selectedTagId = selectedTagIds.length === 1 ? selectedTagIds[0] : null;
  
  // 从 localStorage 读取搜索历史
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem(SEARCH_HISTORY_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  
  // 获取人脉列表（支持搜索）
  const { data: allContacts, isLoading } = trpc.contacts.list.useQuery({
    searchQuery: searchQuery || undefined,
    sortBy: sortBy,
  }, {
    enabled: viewMode !== 'company', // 公司视图不使用这个 API
  });

  // 获取公司列表（当 viewMode 为 company 时）
  const { data: companyList, isLoading: isLoadingCompanyList } = trpc.contacts.companyList.useQuery(undefined, {
    enabled: viewMode === 'company', // 只在公司视图时启用
  });
  
  // 调试日志
  console.log('[ContactsList] viewMode:', viewMode);
  console.log('[ContactsList] companyList:', companyList);
  console.log('[ContactsList] isLoadingCompanyList:', isLoadingCompanyList);
  
  // 获取共享给我的人脉列表
  const { data: sharedContacts } = trpc.sharing.getSharedContacts.useQuery();
  
  // 获取所有标签
  const { data: allTags, refetch: refetchTags } = trpc.contacts.tags.list.useQuery();
  
  // 获取用户的共享权限状态（从users表的sharingEnabled字段读取）
  const { data: permissionData } = trpc.features.checkPermission.useQuery(
    { path: "社交/好友记/好友记 - 共享权限" }
  );
  const hasSharingPermission = permissionData?.enabled || false;
  
  // 本地标签列表（用于拖拽排序）
  const [localTags, setLocalTags] = useState<any[]>([]);
  
  // 当allTags变化时更新localTags
  React.useEffect(() => {
    if (allTags) {
      setLocalTags(allTags);
    }
  }, [allTags]);
  
  // 标签管理mutations
  const createTagMutation = trpc.contacts.tags.create.useMutation();
  const updateTagMutation = trpc.contacts.tags.update.useMutation();
  const deleteTagMutation = trpc.contacts.tags.delete.useMutation();
  const updateOrderMutation = trpc.contacts.tags.updateOrder.useMutation({
    onSuccess: () => {
      toast.success("标签顺序已保存");
      refetchTags();
    },
    onError: (error) => {
      toast.error("保存失败: " + error.message);
    },
  });
  
  // 批量设置标签mutation
  const batchAddTagMutation = trpc.contacts.tags.batchAddToContacts.useMutation({
    onSuccess: () => {
      utils.contacts.list.invalidate();
      refetchTags();
    },
  });
  
  // 批量移除标签mutation
  const batchRemoveTagMutation = trpc.contacts.tags.batchRemoveFromContacts.useMutation({
    onSuccess: () => {
      utils.contacts.list.invalidate();
      refetchTags();
    },
  });
  
  // 配置拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // 删除人脉mutation
  const utils = trpc.useUtils();
  const deleteContactMutation = trpc.contacts.delete.useMutation({
    onSuccess: () => {
      toast.success("人脉已删除");
      utils.contacts.list.invalidate();
      setShowDeleteDialog(false);
      setContactToDelete(null);
    },
    onError: (error) => {
      toast.error(error.message || "删除失败");
    },
  });
    // 记录联络 mutation
  const recordInteractionMutation = trpc.contacts.interactions.create.useMutation({
    onSuccess: async () => {
      toast.success("已记录本次联络");
      // 强制刷新列表数据，确保hasTodayInteraction状态更新
      await utils.contacts.list.refetch();
      setShowQuickContactDialog(false);
      setContactToRecord(null);
    },
    onError: (error) => {
      toast.error(error.message || "记录失败");
    },
  });
  
  // 根据筛选条件合并自己的人脉和共享的人脉
  const mergedContacts = React.useMemo(() => {
    if (!allContacts) return [];
    
    // 为共享的人脉添加标记
    const markedSharedContacts = sharedContacts?.map((contact: any) => ({
      ...contact,
      _isShared: true,
      // 确保共享人脉有唯一ID（避免与自己的人脉ID冲突）
      id: `shared_${contact.id}`,
    })) || [];
    
    // 根据shareFilter返回对应的人脉列表
    if (shareFilter === 'mine') {
      // 只显示自己的人脉
      return allContacts;
    } else if (shareFilter === 'shared') {
      // 只显示共享的人脉
      return markedSharedContacts;
    } else {
      // 显示全部人脉（自己的 + 共享的）
      return [...allContacts, ...markedSharedContacts];
    }
  }, [allContacts, sharedContacts, shareFilter]);
  
  // 根据筛选条件过滤人脉
  const contacts = React.useMemo(() => {
    if (!mergedContacts || !filterType) return mergedContacts;
    
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    
    return mergedContacts.filter(contact => {
      const createdAt = new Date(contact.createdAt);
      
      switch (filterType) {
        case 'thisWeek':
          return createdAt >= startOfWeek;
        case 'thisMonth':
          return createdAt >= startOfMonth;
        case 'thisYear':
          return createdAt >= startOfYear;
        case 'needsAttention': {
          // 需要关注：基于标签的分级关注机制
          // 周关注：7天，月关注：30天，季关注：90天，无标签：180天
          const tagNames = contact.tags?.map((t: any) => t.name) || [];
          let thresholdDays: number;
          if (tagNames.includes('周关注')) {
            thresholdDays = 7;
          } else if (tagNames.includes('月关注')) {
            thresholdDays = 30;
          } else if (tagNames.includes('季关注')) {
            thresholdDays = 90;
          } else {
            thresholdDays = 180;
          }
          
          if (!contact.lastInteractionDate) return true; // 没有联络记录的也需要关注
          const lastInteraction = new Date(contact.lastInteractionDate);
          const daysSinceInteraction = Math.floor((now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24));
          return daysSinceInteraction > thresholdDays;
        }
        case 'monthlyActive': {
          // 本月活跃：本月有联络记录
          if (!contact.lastInteractionDate) return false;
          const lastContact = new Date(contact.lastInteractionDate);
          return lastContact >= startOfMonth;
        }
        case 'weeklyActive': {
          // 本周活跃：本周有联络记录
          if (!contact.lastInteractionDate) return false;
          const lastContact = new Date(contact.lastInteractionDate);
          return lastContact >= startOfWeek;
        }
        case 'todayActive': {
          // 今日活跃：今天有联络记录
          if (!contact.lastInteractionDate) return false;
          
          // 使用北京时间（UTC+8）来计算"今天"的范围
          const beijingOffset = 8 * 60 * 60 * 1000;
          const nowTimestamp = Date.now();
          const oneDayMs = 24 * 60 * 60 * 1000;
          
          // 计算北京时间的今天开始时刻
          const beijingTimestamp = nowTimestamp + beijingOffset;
          const beijingStartOfDay = Math.floor(beijingTimestamp / oneDayMs) * oneDayMs;
          const startOfTodayUTC = beijingStartOfDay - beijingOffset;
          
          // lastInteractionDate是时间戳（毫秒），直接比较
          return contact.lastInteractionDate >= startOfTodayUTC;
        }
        case 'yearlyActive': {
          // 今年活跃：今年有联络记录
          if (!contact.lastInteractionDate) return false;
          const lastContact = new Date(contact.lastInteractionDate);
          return lastContact >= startOfYear;
        }
        case 'blacklist': {
          // 拉黑名单
          return contact.isBlacklisted === true;
        }
        case 'todayReminders': {
          // 今日提醒：有今天的提醒事项
          // 这里需要后端返回提醒信息，暂时返回true显示所有
          return true;
        }
        case 'weekReminders': {
          // 本周提醒：有本周的提醒事项
          return true;
        }
        case 'monthReminders': {
          // 本月提醒：有本月的提醒事项
          return true;
        }
        default:
          return true;
      }
    });
  }, [mergedContacts, filterType]);
  
  // 获取人脉的全局字段分类（公司、职位等）- 移到这里以便在filteredContacts中使用
  const { data: fieldCategories } = trpc.contacts.fieldCategories.list.useQuery();
  
  // 按标签筛选（支持单选和多选）
  // 获取公司字段的categoryId
  const companyCategoryId = React.useMemo(() => {
    if (!fieldCategories) return null;
    const category = fieldCategories.find(c => c.name === '公司');
    return category?.id || null;
  }, [fieldCategories]);
  
  const filteredContacts = React.useMemo(() => {
    let result = contacts;
    
    // 如果是公司视图模式，只显示有公司信息的人脉
    if (viewMode === 'company' && result && companyCategoryId) {
      result = result.filter(contact => {
        if (!contact.fieldValues) return false;
        const companyValue = contact.fieldValues.find((fv: any) => fv.categoryId === companyCategoryId);
        return companyValue && companyValue.value && companyValue.value.trim() !== '';
      });
    }
    
    // 标签筛选
    if (!result || selectedTagIds.length === 0) return result;
    
    return result.filter(contact => {
      if (!contact.tags || contact.tags.length === 0) return false;
      
      // 多选模式：AND逻辑（必须同时拥有所有选中的标签）
      if (selectedTagIds.length > 1) {
        return selectedTagIds.every(tagId => 
          contact.tags.some((tag: any) => tag.id === tagId)
        );
      }
      
      // 单选模式：拥有该标签即可
      return contact.tags.some((tag: any) => tag.id === selectedTagIds[0]);
    });
  }, [contacts, selectedTagIds, viewMode, companyCategoryId]);
  
  // 获取人脉的全局字段值（公司、职位等）- 已移到上方
  
  const getFieldValue = (contact: any, fieldName: string) => {
    if (!contact.fieldValues || !fieldCategories) return "";
    const category = fieldCategories.find(c => c.name === fieldName);
    if (!category) return "";
    const fieldValue = contact.fieldValues.find((fv: any) => fv.categoryId === category.id);
    return fieldValue?.value || "";
  };
  
  // 点击外部关闭下拉列表和历史记录
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
        setShowHistory(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // 搜索框输入时显示下拉列表
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setShowDropdown(e.target.value.trim().length > 0);
    setShowHistory(false);
  };
  
  // 搜索框获得焦点时显示历史记录
  const handleSearchFocus = () => {
    if (!searchQuery && searchHistory.length > 0) {
      setShowHistory(true);
    }
  };
  
  const handleDeleteClick = (e: React.MouseEvent, contact: any) => {
    e.stopPropagation();
    setContactToDelete(contact);
    setShowDeleteDialog(true);
  };
  
  const confirmDelete = () => {
    if (contactToDelete) {
      deleteContactMutation.mutate({ id: contactToDelete.id });
    }
  };
  
  const handleQuickContactClick = (e: React.MouseEvent, contact: any) => {
    e.stopPropagation();
    setContactToRecord(contact);
    setShowQuickContactDialog(true);
  };
  
  const confirmRecordInteraction = () => {
    if (contactToRecord) {
      const note = quickContactNote.trim() || "快捷联络";
      recordInteractionMutation.mutate({ 
        contactId: contactToRecord.id,
        note
      }, {
        onSuccess: () => {
          // 立即更新本地状态，让按钮颜色变暗
          setContactToRecord(prev => prev ? { ...prev, hasTodayInteraction: true } : null);
        }
      });
      setQuickContactNote("");
    }
  };
  
  // 保存搜索历史
  const saveSearchHistory = (query: string) => {
    if (!query.trim()) return;
    
    const newHistory = [query, ...searchHistory.filter(item => item !== query)].slice(0, MAX_HISTORY_ITEMS);
    setSearchHistory(newHistory);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
  };
  
  // 点击人脉项跳转到详情页
  const handleContactClick = (contactId: number, contact?: any, event?: React.MouseEvent) => {
    // 保存搜索历史
    if (searchQuery.trim()) {
      saveSearchHistory(searchQuery.trim());
    }
    
    setShowDropdown(false);
    setShowHistory(false);
    setSearchQuery("");
    
    // 判断是否为共享人脉
    if (contact && contact._isShared && contact._sharedBy) {
      // 共享人脉，显示提示信息
      if (event) {
        const rect = event.currentTarget.getBoundingClientRect();
        toast(`共享人脉 赶快找${contact._sharedBy}介绍吧！`, {
          duration: 1000,
          position: "top",
          style: {
            position: 'fixed',
            top: `${rect.top - 60}px`,
            left: '50%',
            transform: 'translateX(-50%)',
          },
        });
      } else {
        toast(`共享人脉 赶快找${contact._sharedBy}介绍吧！`, {
          duration: 1000,
          position: "top",
        });
      }
    } else {
      // 自己的人脉，正常跳转
      setLocation(`/parent/contacts/${contactId}`);
    }
  };
  
  // 点击历史记录项
  const handleHistoryClick = (query: string) => {
    setSearchQuery(query);
    setShowHistory(false);
    setShowDropdown(true);
  };
  
  // 删除单条历史记录
  const handleDeleteHistory = (query: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newHistory = searchHistory.filter(item => item !== query);
    setSearchHistory(newHistory);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
  };
  
  // 清空所有历史记录
  const handleClearHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem(SEARCH_HISTORY_KEY);
    setShowHistory(false);
  };
  
  const handleAddContact = () => {
    setLocation("/parent/contacts/add");
  };
  
  // 标签管理handler函数
  const handleCreateTag = async () => {
    if (!tagName.trim()) {
      toast.error("请输入标签名称");
      return;
    }
    try {
      await createTagMutation.mutateAsync({
        name: tagName.trim(),
        color: tagColor,
      });
      toast.success("标签创建成功");
      setShowCreateTagDialog(false);
      setTagName("");
      setTagColor(COLOR_OPTIONS[0]);
      refetchTags();
    } catch (error) {
      toast.error("创建标签失败");
    }
  };
  
  const handleEditTag = async () => {
    if (!selectedTag || !tagName.trim()) {
      toast.error("请输入标签名称");
      return;
    }
    try {
      await updateTagMutation.mutateAsync({
        id: selectedTag.id,
        name: tagName.trim(),
        color: tagColor,
      });
      toast.success("标签更新成功");
      setShowEditTagDialog(false);
      setSelectedTag(null);
      setTagName("");
      setTagColor(COLOR_OPTIONS[0]);
      refetchTags();
    } catch (error) {
      toast.error("更新标签失败");
    }
  };
  
  const handleDeleteTag = async () => {
    if (!selectedTag) return;
    try {
      await deleteTagMutation.mutateAsync({ id: selectedTag.id });
      toast.success("标签删除成功");
      setShowDeleteTagDialog(false);
      setSelectedTag(null);
      refetchTags();
    } catch (error) {
      toast.error("删除标签失败");
    }
  };
  
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
  
  const openEditTagDialog = (tag: any) => {
    setSelectedTag(tag);
    setTagName(tag.name);
    setTagColor(tag.color || COLOR_OPTIONS[0]);
    setShowEditTagDialog(true);
  };
  
  const openDeleteTagDialog = (tag: any) => {
    setSelectedTag(tag);
    setShowDeleteTagDialog(true);
  };
  
  // 限制下拉列表最多显示10条
  const dropdownContacts = filteredContacts?.slice(0, 10) || [];

  return (
      <div className="container py-4 sm:py-8 px-2 sm:px-4">
      {/* 标题和返回按钮 */}
      <div className="mb-4 sm:mb-6">
        <div className="flex items-center justify-between mb-1 sm:mb-2">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">
          {filterType === 'thisWeek' && '本周新增人脉'}
          {filterType === 'thisMonth' && '本月新增人脉'}
          {filterType === 'thisYear' && '本年新增人脉'}
          {filterType === 'needsAttention' && '需要关注的人脉'}
          {filterType === 'monthlyActive' && '本月活跃人脉'}
          {filterType === 'todayActive' && '今日活跃人脉'}
          {filterType === 'weeklyActive' && '本周活跃人脉'}
          {filterType === 'yearlyActive' && '今年活跃人脉'}
          {filterType === 'blacklist' && '拉黑名单'}
          {filterType === 'todayReminders' && '今日提醒'}
          {filterType === 'weekReminders' && '本周提醒'}
          {filterType === 'monthReminders' && '本月提醒'}
          {viewMode === 'company' && '公司数量'}
          {selectedTagId && allTags && `标签: ${allTags.find(t => t.id === selectedTagId)?.name || ''}`}
          {!filterType && !selectedTagId && !viewMode && '所有人脉'}
          </h1>
          
          <div className="flex items-center gap-2">
            {/* 共享人脉筛选按钮 */}
            <div className="flex items-center gap-1 sm:gap-2">
              <Button
                variant={shareFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShareFilter('all')}
                className="h-7 px-2 text-xs sm:h-9 sm:px-3 sm:text-sm"
              >
                全部
              </Button>
              <Button
                variant={shareFilter === 'mine' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShareFilter('mine')}
                className="h-7 px-2 text-xs sm:h-9 sm:px-3 sm:text-sm"
              >
                我的
              </Button>
              <Button
                variant={shareFilter === 'shared' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShareFilter('shared')}
                className="h-7 px-2 text-xs sm:h-9 sm:px-3 sm:text-sm"
              >
                共享
              </Button>
            </div>
          </div>
        </div>
        
        <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-6">
          {viewMode === 'company' && companyList ? (
            // 公司视图：统计去重后的公司家数
            `共 ${new Set(companyList.map(item => item.companyName)).size} 家公司`
          ) : (
            `共 ${filteredContacts?.length || 0} 位人脉`
          )}
        </p>
        
        {/* 折叠标签按钮和排序按钮 */}
        <div className="mb-4">
          <div className="flex items-center gap-2">
            {allTags && allTags.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsTagAreaExpanded(!isTagAreaExpanded)}
                className="h-7 px-2 text-xs sm:h-8 sm:px-3 sm:text-sm"
              >
                <Tag className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                {isTagAreaExpanded ? '收起标签' : '按标签筛选'}
              </Button>
            )}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs sm:h-8 sm:px-3 sm:text-sm"
                >
                  <ArrowUpDown className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {!sortBy && '按排序筛选'}
                  {sortBy === 'tagCount_desc' && '排序：标签数↓'}
                  {sortBy === 'tagCount_asc' && '排序：标签数↑'}
                  {sortBy === 'interactionCount_desc' && '排序：联络次数↓'}
                  {sortBy === 'interactionCount_asc' && '排序：联络次数↑'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setSortBy(undefined)}>
                  <span className={!sortBy ? 'font-bold' : ''}>默认排序</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy('tagCount_desc')}>
                  <span className={sortBy === 'tagCount_desc' ? 'font-bold' : ''}>标签数量：由高到低</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy('tagCount_asc')}>
                  <span className={sortBy === 'tagCount_asc' ? 'font-bold' : ''}>标签数量：由低到高</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy('interactionCount_desc')}>
                  <span className={sortBy === 'interactionCount_desc' ? 'font-bold' : ''}>联络次数：由高到低</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy('interactionCount_asc')}>
                  <span className={sortBy === 'interactionCount_asc' ? 'font-bold' : ''}>联络次数：由低到高</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        
        {/* 标签筛选器 */}
        {allTags && allTags.length > 0 && isTagAreaExpanded && (
          <div className="mb-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                {/* 多选模式复选框 */}
                <label className="flex items-center gap-1 sm:gap-2 cursor-pointer">
                  <span className="text-xs sm:text-sm">多选</span>
                  <Checkbox
                    checked={isMultiSelectMode}
                    onCheckedChange={(checked) => {
                      setIsMultiSelectMode(checked as boolean);
                      // 切换模式时，清空当前选中的标签
                      if (selectedTagIds.length > 0) {
                        const newUrl = filterType 
                          ? `/parent/contacts/list?filter=${filterType}`
                          : '/parent/contacts/list';
                        setLocation(newUrl);
                      }
                    }}
                    className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                />
              </label>

            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTagManagement(true)}
              className="h-6 px-2 text-xs sm:h-7 sm:px-3 sm:text-xs mb-2"
            >
              <Settings className="h-3 w-3 mr-1" />
              标签管理
            </Button>
              <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.id);
                
                return (
                  <Badge
                    key={tag.id}
                    variant={isSelected ? "default" : "outline"}
                    className="cursor-pointer transition-all hover:scale-105"
                    style={{
                      backgroundColor: isSelected ? mapColorToTheme(tag.color) : '#ffffff',
                      borderColor: isSelected ? mapColorToTheme(tag.color) : '#d1d5db',
                      color: isSelected ? '#fff' : '#9ca3af',
                    }}
                    onClick={() => {
                      if (isMultiSelectMode) {
                        // 多选模式：添加/移除标签
                        let newTagIds: number[];
                        if (isSelected) {
                          // 移除该标签
                          newTagIds = selectedTagIds.filter(id => id !== tag.id);
                        } else {
                          // 添加该标签
                          newTagIds = [...selectedTagIds, tag.id];
                        }
                        
                        // 更新URL
                        if (newTagIds.length === 0) {
                          const newUrl = filterType 
                            ? `/parent/contacts/list?filter=${filterType}`
                            : '/parent/contacts/list';
                          setLocation(newUrl);
                        } else {
                          const tagParam = newTagIds.join(',');
                          const newUrl = filterType
                            ? `/parent/contacts/list?filter=${filterType}&tag=${tagParam}`
                            : `/parent/contacts/list?tag=${tagParam}`;
                          setLocation(newUrl);
                        }
                      } else {
                        // 单选模式：切换选中状态
                        if (isSelected) {
                          // 取消筛选
                          const newUrl = filterType 
                            ? `/parent/contacts/list?filter=${filterType}`
                            : '/parent/contacts/list';
                          setLocation(newUrl);
                        } else {
                          // 应用筛选
                          const newUrl = filterType
                            ? `/parent/contacts/list?filter=${filterType}&tag=${tag.id}`
                            : `/parent/contacts/list?tag=${tag.id}`;
                          setLocation(newUrl);
                        }
                      }
                    }}
                  >
                    {tag.name}
                  </Badge>
                );
              })}
              </div>
            </div>
          </div>
        )}
        
        {/* 搜索框和添加按钮 */}
        <div className="flex gap-2 sm:gap-4">
          <div ref={searchRef} className="relative flex-1">
            <Search className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground z-10" />
            <Input
              placeholder="搜索人脉..."
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={handleSearchFocus}
              className="pl-7 sm:pl-10 h-8 sm:h-10 text-sm"
            />
            
            {/* 搜索下拉列表 */}
            {showDropdown && dropdownContacts.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
                {dropdownContacts.map((contact: any) => {
                  const company = getFieldValue(contact, "公司");
                  const position = getFieldValue(contact, "职位");
                  
                  return (
                    <div
                      key={contact.id}
                      onClick={(e) => handleContactClick(contact.id, contact, e)}
                      className="px-3 sm:px-4 py-2 sm:py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm sm:text-base truncate">{contact.name}</span>
                            {contact.title && (
                              <span className="text-xs sm:text-sm text-muted-foreground truncate">{contact.title}</span>
                            )}
                          </div>
                          {(company || position) && (
                            <div className="text-xs sm:text-sm text-muted-foreground mt-1 truncate">
                              {company && <span>{company}</span>}
                              {company && position && <span className="mx-1">·</span>}
                              {position && <span>{position}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* 搜索历史记录 */}
            {showHistory && searchHistory.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
                <div className="flex items-center justify-between px-3 sm:px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-xs sm:text-sm text-muted-foreground">搜索历史</span>
                  <button
                    onClick={handleClearHistory}
                    className="text-xs hover:underline"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    清空
                  </button>
                </div>
                {searchHistory.map((query, index) => (
                  <div
                    key={index}
                    onClick={() => handleHistoryClick(query)}
                    className="flex items-center justify-between px-3 sm:px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                  >
                    <span className="text-sm truncate flex-1">{query}</span>
                    <button
                      onClick={(e) => handleDeleteHistory(query, e)}
                      className="ml-2 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {selectedContactIds.length === 0 ? (
            <Button 
              onClick={() => {
                // 进入批量选择模式，选中第一个人脉
                if (filteredContacts && filteredContacts.length > 0) {
                  setSelectedContactIds([filteredContacts[0].id]);
                }
              }}
              variant="outline"
              size="sm"
              className="h-8 sm:h-10 text-xs sm:text-sm whitespace-nowrap"
            >
              <span>批量选择</span>
            </Button>
          ) : null}
          
          <Button 
            onClick={handleAddContact}
            size="sm"
            className="h-8 sm:h-10 text-xs sm:text-sm whitespace-nowrap"
          >
            <Plus className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
            <span className="hidden sm:inline">添加人脉</span>
          </Button>
        </div>
      </div>

      {/* 批量操作工具栏 */}
      {selectedContactIds.length > 0 && (
        <div className="border rounded-lg p-3 mb-4 flex flex-wrap items-center justify-between gap-2"
             style={{ 
               backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, white)',
               borderColor: 'var(--color-primary)'
             }}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
              已选择 {selectedContactIds.length} 人
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedContactIds([])}
              className="text-xs h-7 px-2"
            >
              取消选择
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const allIds = filteredContacts?.map(c => c.id) || [];
                setSelectedContactIds(allIds);
              }}
              className="text-xs h-7 px-2"
            >
              全选
            </Button>
            {operationHistory.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const lastOp = operationHistory[operationHistory.length - 1];
                  if (!lastOp) return;
                  
                  setIsBatchOperating(true);
                  try {
                    // 撤销操作：如果上次是添加，则移除；如果上次是移除，则添加
                    if (lastOp.type === 'add') {
                      await batchRemoveTagMutation.mutateAsync({
                        contactIds: lastOp.contactIds,
                        tagId: lastOp.tagId,
                      });
                      toast.success(`已撤销添加「${lastOp.tagName}」标签的操作`);
                    } else {
                      await batchAddTagMutation.mutateAsync({
                        contactIds: lastOp.contactIds,
                        tagId: lastOp.tagId,
                      });
                      toast.success(`已撤销移除「${lastOp.tagName}」标签的操作`);
                    }
                    // 移除历史记录
                    setOperationHistory(prev => prev.slice(0, -1));
                  } catch (error) {
                    toast.error('撤销失败，请重试');
                  } finally {
                    setIsBatchOperating(false);
                  }
                }}
                className="text-xs h-7 px-2 text-orange-600 hover:text-orange-700"
                disabled={isBatchOperating}
              >
                <Undo className="h-3 w-3 mr-1" />
                撤销
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">设置关注周期:</span>
            {allTags?.filter(tag => ['周关注', '周关注', '月关注', '季关注'].includes(tag.name)).length === 0 ? (
              <span className="text-xs text-amber-600">请先创建“周关注”、“月关注”、“季关注”标签</span>
            ) : (
              <>
                {allTags?.filter(tag => tag.name === '周关注').map(tag => (
                  <Button
                    key={tag.id}
                    variant="outline"
                    size="sm"
                    disabled={isBatchOperating}
                    onClick={() => {
                      // 打开确认对话框
                      setConfirmDialog({
                        open: true,
                        type: 'cycle',
                        tagId: tag.id,
                        tagName: tag.name,
                        onConfirm: async () => {
                          setIsBatchOperating(true);
                          try {
                            const result = await batchAddTagMutation.mutateAsync({
                              contactIds: selectedContactIds,
                              tagId: tag.id,
                            });
                            toast.success(`成功为 ${result.successCount} 人设置周关注${result.skipCount > 0 ? `，${result.skipCount} 人已有该标签` : ''}`);
                            // 添加历史记录
                            setOperationHistory(prev => [...prev, {
                              type: 'add',
                              contactIds: selectedContactIds,
                              tagId: tag.id,
                              tagName: tag.name,
                              timestamp: Date.now(),
                            }]);
                            // 保持选中状态，不清空
                          } catch (error) {
                            toast.error('设置失败，请重试');
                          } finally {
                            setIsBatchOperating(false);
                          }
                        },
                      });
                    }}
                    className="text-xs h-7 px-2 bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100"
                  >
                    周关注
                  </Button>
                ))}
                {allTags?.filter(tag => tag.name === '月关注').map(tag => (
                  <Button
                    key={tag.id}
                    variant="outline"
                    size="sm"
                    disabled={isBatchOperating}
                    onClick={() => {
                      setConfirmDialog({
                        open: true,
                        type: 'cycle',
                        tagId: tag.id,
                        tagName: tag.name,
                        onConfirm: async () => {
                          setIsBatchOperating(true);
                          try {
                            const result = await batchAddTagMutation.mutateAsync({
                              contactIds: selectedContactIds,
                              tagId: tag.id,
                            });
                            toast.success(`成功为 ${result.successCount} 人设置月关注${result.skipCount > 0 ? `，${result.skipCount} 人已有该标签` : ''}`);
                            setOperationHistory(prev => [...prev, {
                              type: 'add',
                              contactIds: selectedContactIds,
                              tagId: tag.id,
                              tagName: tag.name,
                              timestamp: Date.now(),
                            }]);
                          } catch (error) {
                            toast.error('设置失败，请重试');
                          } finally {
                            setIsBatchOperating(false);
                          }
                        },
                      });
                    }}
                    className="text-xs h-7 px-2"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, white)',
                      borderColor: 'var(--color-primary)',
                      color: 'var(--color-primary)'
                    }}
                  >
                    月关注
                  </Button>
                ))}
                {allTags?.filter(tag => tag.name === '季关注').map(tag => (
                  <Button
                    key={tag.id}
                    variant="outline"
                    size="sm"
                    disabled={isBatchOperating}
                    onClick={() => {
                      setConfirmDialog({
                        open: true,
                        type: 'cycle',
                        tagId: tag.id,
                        tagName: tag.name,
                        onConfirm: async () => {
                          setIsBatchOperating(true);
                          try {
                            const result = await batchAddTagMutation.mutateAsync({
                              contactIds: selectedContactIds,
                              tagId: tag.id,
                            });
                            toast.success(`成功为 ${result.successCount} 人设置季关注${result.skipCount > 0 ? `，${result.skipCount} 人已有该标签` : ''}`);
                            setOperationHistory(prev => [...prev, {
                              type: 'add',
                              contactIds: selectedContactIds,
                              tagId: tag.id,
                              tagName: tag.name,
                              timestamp: Date.now(),
                            }]);
                          } catch (error) {
                            toast.error('设置失败，请重试');
                          } finally {
                            setIsBatchOperating(false);
                          }
                        },
                      });
                    }}
                    className="text-xs h-7 px-2"
                    style={{
                      backgroundColor: `color-mix(in srgb, var(--color-secondary) 10%, white)`,
                      borderColor: `var(--color-secondary)`,
                      color: `var(--color-text)`
                    }}
                  >
                    季关注
                  </Button>
                ))}
              </>
            )}
          </div>
          
          {/* 添加标签下拉菜单 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">添加标签:</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isBatchOperating}
                  className="text-xs h-7 px-2"
                  style={{
                    backgroundColor: `color-mix(in srgb, var(--color-secondary) 10%, white)`,
                    borderColor: `var(--color-secondary)`,
                    color: `var(--color-text)`
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  选择标签
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
                {allTags && allTags.length > 0 ? (
                  allTags.map(tag => (
                    <DropdownMenuItem
                      key={tag.id}
                      onClick={() => {
                        // 打开确认对话框
                        setConfirmDialog({
                          open: true,
                          type: 'add',
                          tagId: tag.id,
                          tagName: tag.name,
                          onConfirm: async () => {
                            setIsBatchOperating(true);
                            try {
                              const result = await batchAddTagMutation.mutateAsync({
                                contactIds: selectedContactIds,
                                tagId: tag.id,
                              });
                              toast.success(`成功为 ${result.successCount} 人添加「${tag.name}」标签${result.skipCount > 0 ? `，${result.skipCount} 人已有该标签` : ''}`);
                              // 添加历史记录
                              setOperationHistory(prev => [...prev, {
                                type: 'add',
                                contactIds: selectedContactIds,
                                tagId: tag.id,
                                tagName: tag.name,
                                timestamp: Date.now(),
                              }]);
                              // 保持选中状态，不清空
                            } catch (error) {
                              toast.error('添加失败，请重试');
                            } finally {
                              setIsBatchOperating(false);
                            }
                          },
                        });
                      }}
                      className="cursor-pointer"
                    >
                      <span 
                        className="w-3 h-3 rounded-full mr-2 flex-shrink-0" 
                        style={{ backgroundColor: mapColorToTheme(tag.color || '#6b7280') }}
                      />
                      {tag.name}
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem disabled>暂无标签</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          {/* 移除标签下拉菜单 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">移除标签:</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isBatchOperating}
                  className="text-xs h-7 px-2 bg-red-50 border-red-300 text-red-700 hover:bg-red-100"
                >
                  <X className="h-3 w-3 mr-1" />
                  选择标签
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
                {allTags && allTags.length > 0 ? (
                  allTags.map(tag => (
                    <DropdownMenuItem
                      key={tag.id}
                      onClick={() => {
                        // 打开确认对话框
                        setConfirmDialog({
                          open: true,
                          type: 'remove',
                          tagId: tag.id,
                          tagName: tag.name,
                          onConfirm: async () => {
                            setIsBatchOperating(true);
                            try {
                              const result = await batchRemoveTagMutation.mutateAsync({
                                contactIds: selectedContactIds,
                                tagId: tag.id,
                              });
                              toast.success(`成功为 ${result.successCount} 人移除「${tag.name}」标签${result.skipCount > 0 ? `，${result.skipCount} 人本无该标签` : ''}`);
                              // 添加历史记录
                              setOperationHistory(prev => [...prev, {
                                type: 'remove',
                                contactIds: selectedContactIds,
                                tagId: tag.id,
                                tagName: tag.name,
                                timestamp: Date.now(),
                              }]);
                              // 保持选中状态，不清空
                            } catch (error) {
                              toast.error('移除失败，请重试');
                            } finally {
                              setIsBatchOperating(false);
                            }
                          },
                        });
                      }}
                      className="cursor-pointer"
                    >
                      <span 
                        className="w-3 h-3 rounded-full mr-2 flex-shrink-0" 
                        style={{ backgroundColor: mapColorToTheme(tag.color || '#6b7280') }}
                      />
                      {tag.name}
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem disabled>暂无标签</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* 人脉列表 */}
      <div>
        {(isLoading || isLoadingCompanyList) ? (
          <div className="text-center py-8 text-muted-foreground">加载中...</div>
        ) : viewMode === 'company' && companyList && companyList.length > 0 ? (
          // 公司列表视图
          <div className="space-y-2">
            {companyList.map((company) => (
              <Card 
                key={company.companyName}
                className="hover:shadow-lg transition-all cursor-pointer"
                onClick={() => {
                  // 如果只有一个联系人，直接跳转到该联系人详情
                  if (company.contactCount === 1) {
                    setLocation(`/parent/contacts/${company.contactIds[0]}`);
                  }
                  // 如果有多个联系人，暂时不跳转（未来可以弹出选择对话框）
                }}
              >
                <CardHeader className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg text-teal-600 dark:text-teal-400">{company.companyName}</CardTitle>
                        {company.contactCount > 1 && (
                          <Badge variant="secondary" className="text-xs">
                            {company.contactCount} 人
                          </Badge>
                        )}
                        <CompanyReportIcon
                          hasReport={company.hasReport}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCompanyForReport(company.companyName);
                            setShowCompanyReportDialog(true);
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {company.contactNames.map((name, index) => (
                          <span key={index}>
                            <span 
                              className="text-sm text-muted-foreground hover:text-primary cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLocation(`/parent/contacts/${company.contactIds[index]}`);
                              }}
                            >
                              {name}
                            </span>
                            {index < company.contactNames.length - 1 && <span className="text-muted-foreground">, </span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : filteredContacts && filteredContacts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {filteredContacts.map((contact) => {
              const isContactSelected = selectedContactIds.includes(contact.id);
              return (
                <Card 
                  key={contact.id}
                  className="hover:shadow-lg transition-all cursor-pointer relative"
                  style={isContactSelected ? {
                    boxShadow: `0 0 0 2px var(--color-primary)`,
                    backgroundColor: 'color-mix(in srgb, var(--color-primary) 5%, white)'
                  } : {}}
                  onClick={(e) => {
                    if (selectedContactIds.length > 0) {
                      // 如果已有选中的人脉，点击卡片切换选中状态
                      if (isContactSelected) {
                        setSelectedContactIds(prev => prev.filter(id => id !== contact.id));
                      } else {
                        setSelectedContactIds(prev => [...prev, contact.id]);
                      }
                    } else {
                      // 判断是否为共享人脉
                      if (contact._isShared && contact._sharedBy) {
                        // 共享人脉，显示提示信息
                        const rect = e.currentTarget.getBoundingClientRect();
                        toast(`共享人脉 赶快找${contact._sharedBy}介绍吧！`, {
                          duration: 1000,
                          position: "top",
                          style: {
                            position: 'fixed',
                            top: `${rect.top - 60}px`,
                            left: '50%',
                            transform: 'translateX(-50%)',
                          },
                        });
                      } else {
                        // 自己的人脉，正常跳转
                        setLocation(`/parent/contacts/${contact.id}`);
                      }
                    }
                  }}
                >
                {/* 批量选择checkbox */}
                {selectedContactIds.length > 0 && (
                  <div 
                    className="absolute top-2 right-2 z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isContactSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedContactIds(prev => [...prev, contact.id]);
                        } else {
                          setSelectedContactIds(prev => prev.filter(id => id !== contact.id));
                        }
                      }}
                      className="w-5 h-5 rounded border-gray-300"
                      style={{ 
                        accentColor: 'var(--color-primary)'
                      }}
                    />
                  </div>
                )}
                {/* 左侧颜色指示条 */}
                <div 
                  className="absolute left-0 top-0 bottom-0 w-1"
                  style={{ backgroundColor: getInteractionStatusColor((contact as any).daysSinceLastInteraction) }}
                />
                <CardHeader className="p-3 sm:p-4 pb-2 pl-4 sm:pl-5">
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base sm:text-lg">
                          {contact.name}
                        </CardTitle>
                        {/* 推荐人状态指示器 - 放在名字右边 */}
                        {(contact as any).hasReferrer !== undefined && (
                          (contact as any).hasReferrer ? (
                            <UserCheck className={`h-4 w-4 ${
                              contact._isShared ? 'text-gray-400' : ''
                            }`}
                            style={!contact._isShared ? { color: 'var(--color-primary)' } : {}} />
                          ) : (
                            <UserX className="h-4 w-4 text-gray-400" />
                          )
                        )}
                        {/* 笑脸图标×累计沟通次数 - 可点击查看详情 */}
                        {(contact as any).totalInteractions !== undefined && (contact as any).totalInteractions > 0 && (
                          <button
                            onClick={(e) => {
                              if (contact._isShared) {
                                e.stopPropagation();
                                return; // 共享人脉不可点击
                              }
                              e.stopPropagation();
                              setSelectedContactForInteraction(contact);
                              setShowInteractionDialog(true);
                            }}
                            className={`flex items-center gap-0.5 transition-opacity ${
                              contact._isShared 
                                ? 'text-gray-400 cursor-default' 
                                : 'hover:opacity-70 cursor-pointer'
                            }`}
                            style={!contact._isShared ? { color: 'var(--color-primary)' } : {}}
                            title={contact._isShared ? '' : '点击查看互动记录'}
                            disabled={contact._isShared}
                          >
                            <Smile className="h-4 w-4" />
                            <span className="text-xs font-medium">×{(contact as any).totalInteractions}</span>
                          </button>
                        )}
                        {/* Layers2图标×直接推荐人数 */}
                        {(contact as any).directReferrals !== undefined && (contact as any).directReferrals > 0 && (
                          <button
                            onClick={(e) => {
                              if (contact._isShared) {
                                e.stopPropagation();
                                return; // 共享人脉不可点击
                              }
                              e.stopPropagation();
                              setLocation(`/parent/contacts/${contact.id}/referrals/direct`);
                            }}
                            className={`flex items-center gap-0.5 transition-opacity ${
                              contact._isShared 
                                ? 'text-gray-400 cursor-default' 
                                : 'hover:opacity-70 cursor-pointer'
                            }`}
                            style={!contact._isShared ? { color: 'var(--color-primary)' } : {}}
                            title={contact._isShared ? '' : '点击查看直接推荐'}
                            disabled={contact._isShared}
                          >
                            <Layers2 className="h-4 w-4" />
                            <span className="text-xs font-medium">×{(contact as any).directReferrals}</span>
                          </button>
                        )}
                        {/* Layers3图标×间接推荐人数 */}
                        {(contact as any).indirectReferrals !== undefined && (contact as any).indirectReferrals > 0 && (
                          <button
                            onClick={(e) => {
                              if (contact._isShared) {
                                e.stopPropagation();
                                return; // 共享人脉不可点击
                              }
                              e.stopPropagation();
                              setLocation(`/parent/contacts/${contact.id}/referrals/indirect`);
                            }}
                            className={`flex items-center gap-0.5 transition-opacity ${
                              contact._isShared 
                                ? 'text-gray-400 cursor-default' 
                                : 'hover:opacity-70 cursor-pointer'
                            }`}
                            style={!contact._isShared ? { color: 'var(--color-primary)' } : {}}
                            title={contact._isShared ? '' : '点击查看间接推荐'}
                            disabled={contact._isShared}
                          >
                            <Layers3 className="h-4 w-4" />
                            <span className="text-xs font-medium">×{(contact as any).indirectReferrals}</span>
                          </button>
                        )}

                        {/* 机器人图标 - 显示公司数量 */}
                        {(() => {
                          if (!companyCategoryId) return null;
                          const companies = contact.fieldValues?.filter((fv: any) => fv.categoryId === companyCategoryId && fv.value && fv.value.trim() !== '') || [];
                          if (companies.length === 0) return null;
                          return (
                            <button
                              onClick={(e) => {
                                if (contact._isShared) {
                                  e.stopPropagation();
                                  return; // 共享人脉不可点击
                                }
                                e.stopPropagation();
                                setSelectedContactForCompanyList(contact);
                                setShowCompanyListDialog(true);
                              }}
                              className={`flex items-center gap-0.5 transition-opacity ${
                                contact._isShared 
                                  ? 'text-gray-400 cursor-default' 
                                  : 'text-blue-500 hover:opacity-70 cursor-pointer'
                              }`}
                              title={contact._isShared ? '' : '点击查看公司列表'}
                              disabled={contact._isShared}
                            >
                              <CompanyReportIcon hasReport={true} onClick={() => {}} />
                              <span className="text-xs font-medium">×{companies.length}</span>
                            </button>
                          );
                        })()}
                        {/* 共享者标识 - 显示这个人脉是谁共享给我的，放在最后 */}
                        {contact._isShared && contact._sharedBy && (
                          <span className="flex items-center gap-0.5">
                            <Handshake className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
                            <span className="text-xs text-muted-foreground">{contact._sharedBy}</span>
                          </span>
                        )}
                      </div>
                      {contact.title && (
                        <span className="text-xs sm:text-sm text-muted-foreground font-normal">
                          {contact.title}
                        </span>
                      )}
                      {/* 公司信息显示 - 当viewMode为company时突出显示 */}
                      {(() => {
                        const company = getFieldValue(contact, "公司");
                        const position = getFieldValue(contact, "职位");
                        if (!company && !position) return null;
                        return (
                          <div className={`text-xs sm:text-sm mt-0.5 ${
                            viewMode === 'company' 
                              ? 'text-teal-600 dark:text-teal-400 font-medium' 
                              : 'text-muted-foreground'
                          }`}>
                            {company && <span>{company}</span>}
                            {company && position && <span className="mx-1">·</span>}
                            {position && <span>{position}</span>}
                          </div>
                        );
                      })()}
                    </div>
                    {/* 右上角操作按钮 */}
                    <div className="flex items-center gap-1">
                      {/* 快捷联络按钮 - 共享人脉禁用 */}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0"
                        onClick={(e) => {
                          if (contact._isShared) {
                            e.stopPropagation();
                            return; // 共享人脉不可点击
                          }
                          handleQuickContactClick(e, contact);
                        }}
                        disabled={contact._isShared}
                      >
                        <MessageCircle 
                          className={`h-4 w-4 ${
                            contact._isShared
                              ? 'text-gray-300' // 共享人脉显示暗色
                              : contact.hasTodayInteraction 
                                ? 'text-gray-400' 
                                : 'text-blue-500'
                          }`}
                        />
                        {/* 调试标记 */}
                        <span className="text-[8px] text-red-600 font-bold ml-0.5">
                          {contact.hasTodayInteraction ? 'T' : 'F'}
                        </span>
                      </Button>
                      {/* 更多操作菜单 - 共享人脉不显示编辑和删除按钮 */}
                      {!contact._isShared && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setLocation(`/parent/contacts/${contact.id}`);
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              编辑
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(e, contact);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3 sm:p-4 pt-0 pl-4 sm:pl-5">
                  <div className="space-y-1 text-xs sm:text-sm text-muted-foreground mb-2">
                    {contact.phone && <p>电话：{contact.phone}</p>}
                    {contact.occupation && <p>职业：{contact.occupation}</p>}
                  </div>
                  {/* 联络状态显示 */}
                  <div 
                    className="text-xs mt-2 pt-2 border-t border-gray-100 dark:border-gray-700"
                    style={{ color: getInteractionStatusColor((contact as any).daysSinceLastInteraction) }}
                  >
                    {(contact as any).daysSinceLastInteraction !== null ? (
                      <div>距今 {(contact as any).daysSinceLastInteraction} 天 · 距上次 {formatDate((contact as any).lastInteractionDate)}</div>
                    ) : (
                      <div>从未联络</div>
                    )}
                  </div>
                  {/* 标签显示 */}
                  {contact.tags && contact.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {contact.tags.map((tag: any) => (
                        <Badge
                          key={tag.id}
                          variant="outline"
                          className="text-xs cursor-pointer hover:bg-opacity-10 transition-colors"
                          style={{
                            borderColor: mapColorToTheme(tag.color || '#3b82f6'),
                            color: mapColorToTheme(tag.color || '#3b82f6'),
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/parent/contacts/list?tag=${tag.id}`);
                          }}
                        >
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {/* 个人标签显示 */}
                  {contact.personalTags && contact.personalTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {contact.personalTags.map((tag: any) => (
                        <span
                          key={`personal-${tag.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs text-white"
                          style={{
                            backgroundColor: mapColorToTheme(tag.color || '#8b5cf6'),
                          }}
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                          </svg>
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            {searchQuery ? '没有找到匹配的人脉' : '还没有添加人脉，点击上方按钮开始添加'}
          </div>
        )}
      </div>
      
      {/* 标签管理Dialog */}
      <Dialog open={showTagManagement} onOpenChange={setShowTagManagement}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>标签管理</DialogTitle>
            <DialogDescription>
              创建、编辑和管理您的人脉标签
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <Button onClick={() => setShowCreateTagDialog(true)} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              创建标签
            </Button>
            
            {/* 标签列表（可拖拽排序） */}
            {localTags && localTags.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={localTags.map((tag) => tag.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="grid grid-cols-1 gap-2">
                    {localTags.map((tag) => (
                      <SortableTagItem
                        key={tag.id}
                        tag={tag}
                        onEdit={() => openEditTagDialog(tag)}
                        onDelete={() => openDeleteTagDialog(tag)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>还没有创建任何标签</p>
                <p className="text-sm mt-2">点击“创建标签”按钮开始创建</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      {/* 创建标签Dialog */}
      <Dialog open={showCreateTagDialog} onOpenChange={setShowCreateTagDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建标签</DialogTitle>
            <DialogDescription>
              创建一个新的人脉标签，用于分类和管理您的人脉关系
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">标签名称</Label>
              <Input
                id="name"
                placeholder="例如：重要客户、同学、亲戚等"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
              />
            </div>
              <div className="space-y-2">
              <Label>标签颜色（基于当前主题）</Label>
              <div className="flex gap-2 flex-wrap">
                {(themeColorOptions.length > 0 ? themeColorOptions : COLOR_OPTIONS).map((color, index) => (
                  <button
                    key={`${color}-${index}`}
                    className={`w-8 h-8 rounded-full border-2 ${
                      tagColor === color ? "border-black" : "border-transparent"
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setTagColor(color)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateTagDialog(false)}>
              取消
            </Button>
            <Button onClick={handleCreateTag}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 编辑标签Dialog */}
      <Dialog open={showEditTagDialog} onOpenChange={setShowEditTagDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑标签</DialogTitle>
            <DialogDescription>
              修改标签的名称和颜色
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">标签名称</Label>
              <Input
                id="edit-name"
                placeholder="例如：重要客户、同学、亲戚等"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>标签颜色（基于当前主题）</Label>
              <div className="flex gap-2 flex-wrap">
                {(themeColorOptions.length > 0 ? themeColorOptions : COLOR_OPTIONS).map((color, index) => (
                  <button
                    key={`${color}-${index}`}
                    className={`w-8 h-8 rounded-full border-2 ${
                      tagColor === color ? "border-black" : "border-transparent"
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setTagColor(color)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditTagDialog(false)}>
              取消
            </Button>
            <Button onClick={handleEditTag}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 删除标签Dialog */}
      <Dialog open={showDeleteTagDialog} onOpenChange={setShowDeleteTagDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除标签</DialogTitle>
            <DialogDescription>
              确定要删除标签“{selectedTag?.name}”吗？此操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteTagDialog(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteTag}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 删除人脉确认Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              您确定要删除人脉 "{contactToDelete?.name}" 吗？此操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowDeleteDialog(false);
                setContactToDelete(null);
              }}
            >
              取消
            </Button>
            <Button 
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteContactMutation.isPending}
            >
              {deleteContactMutation.isPending ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 快捷联络确认Dialog */}
      <Dialog open={showQuickContactDialog} onOpenChange={(open) => {
        setShowQuickContactDialog(open);
        if (!open) {
          setContactToRecord(null);
          setQuickContactNote("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>记录联络</DialogTitle>
            <DialogDescription>
              {contactToRecord?.hasTodayInteraction 
                ? `今天已经记录过与 "${contactToRecord?.name}" 的联络，单日确认上限1次`
                : `记录与 "${contactToRecord?.name}" 的本次联络`
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-3">
            <Button 
              onClick={confirmRecordInteraction}
              disabled={recordInteractionMutation.isPending || contactToRecord?.hasTodayInteraction}
              className="w-full"
            >
              {recordInteractionMutation.isPending ? "记录中..." : "确认记录"}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowQuickContactDialog(false);
                setContactToRecord(null);
                setQuickContactNote("");
              }}
              className="w-full"
            >
              取消
            </Button>
            {!contactToRecord?.hasTodayInteraction && (
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
      
      {/* 互动记录详情对话框 */}
      <InteractionHistoryDialog
        open={showInteractionDialog}
        onOpenChange={setShowInteractionDialog}
        contactId={selectedContactForInteraction?.id || 0}
        contactName={selectedContactForInteraction?.name || ""}
      />
      
      {/* 推荐关系详情对话框 */}
      <ReferralRelationshipDialog
        open={showReferralDialog}
        onOpenChange={setShowReferralDialog}
        contactId={selectedContactForReferral?.id || 0}
        contactName={selectedContactForReferral?.name || ""}
        type={referralType}
      />
      
      {/* 批量操作确认对话框 */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.type === 'add' && '确认批量添加标签'}
              {confirmDialog.type === 'remove' && '确认批量移除标签'}
              {confirmDialog.type === 'cycle' && '确认批量设置关注周期'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.type === 'add' && (
                <span>
                  将为 <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>{selectedContactIds.length}</span> 位人脉批量添加「
                  <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>{confirmDialog.tagName}</span>
                  」标签，是否继续？
                </span>
              )}
              {confirmDialog.type === 'remove' && (
                <span>
                  将为 <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>{selectedContactIds.length}</span> 位人脉批量移除「
                  <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>{confirmDialog.tagName}</span>
                  」标签，是否继续？
                </span>
              )}
              {confirmDialog.type === 'cycle' && (
                <span>
                  将为 <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>{selectedContactIds.length}</span> 位人脉设置「
                  <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>{confirmDialog.tagName}</span>
                  」关注周期，是否继续？
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (confirmDialog.onConfirm) {
                  await confirmDialog.onConfirm();
                }
                setConfirmDialog(prev => ({ ...prev, open: false }));
              }}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* 企业报告弹窗 */}
      <CompanyReportDialog
        open={showCompanyReportDialog}
        onOpenChange={setShowCompanyReportDialog}
        companyName={selectedCompanyForReport}
      />
      
      {/* 公司列表弹窗 */}
      <CompanyListDialog
        open={showCompanyListDialog}
        onOpenChange={setShowCompanyListDialog}
        contact={selectedContactForCompanyList}
      />
    </div>
  );
}