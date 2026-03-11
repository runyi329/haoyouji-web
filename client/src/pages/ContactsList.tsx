import React, { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, ArrowLeft, X, Tag, Settings, Pencil, Trash2, MoreVertical, MessageCircle, UserCheck, UserX, Smile, Layers2, Layers3, Undo, Handshake, ArrowUpDown, Check, ChevronsUpDown } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
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
    <Card ref={setNodeRef} style={style} className="bg-white rounded-2xl shadow-sm border-0 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-[#757575] flex-shrink-0"
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
              <Trash2 className="h-4 w-4 text-[#D32F2F]" />
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// 直接返回用户选择的原始颜色，不做主题映射
function mapColorToTheme(color: string): string {
  return color;
}

// 直接返回预定义的颜色选项
function getThemeBasedColorOptions(): string[] {
  return COLOR_OPTIONS;
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

// 根据距离上次联络的天数返回颜色（统一深红色系）
function getInteractionStatusColor(days: number | null): string {
  if (days === null) return '#d4a0a0'; // 从未联络：浅红灰
  if (days <= 30) return '#A80000'; // 0-30天：深红色
  if (days <= 90) return '#d44'; // 31-90天：中红色
  return '#d4a0a0'; // 91天以上：浅红灰
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
  const loadMoreRef = useRef<HTMLDivElement>(null);
  
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
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(true); // 默认启用多选模式
  
  // 标签区域展开/收起状态
  const [isTagAreaExpanded, setIsTagAreaExpanded] = useState(false);
  
  // 共享人脉筛选状态：'all' = 全部、'mine' = 我的、'shared' = 共享
  const [shareFilter, setShareFilter] = useState<'all' | 'mine' | 'shared'>('all');
  
  // 共享人筛选状态：按共享人名字筛选
  const [sharerFilter, setSharerFilter] = useState<string>('all');
  
  // 共享人选择器Popover状态
  const [sharerPopoverOpen, setSharerPopoverOpen] = useState(false);
  
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
  
  // 公司报告存在映射表
  const [companyReportExistsMap, setCompanyReportExistsMap] = useState<Record<string, boolean>>({});
  
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
  const [contactMethod, setContactMethod] = useState<string>(""); // 联络方式：会面/电话/微信
  const [importanceScore, setImportanceScore] = useState<number>(0); // 互动重要性评分：1-5分
  // 补记相关状态
  const [showBackfillDatePicker, setShowBackfillDatePicker] = useState(false); // 是否显示补记日期选择器
  const [backfillDate, setBackfillDate] = useState<string>(""); // 补记日期
  
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
  
  // 分页状态
  const [page, setPage] = useState(1);
  const [allLoadedContacts, setAllLoadedContacts] = useState<any[]>([]);
  
  // 组件挂载时重置状态,确保后退再进入时数据正常加载
  React.useEffect(() => {
    setPage(1);
    setAllLoadedContacts([]);
  }, []); // 空依赖数组,只在组件挂载时执行一次
  
  // 当URL参数中有filter时,自动重置shareFilter为'all',确保显示所有符合条件的人脉
  React.useEffect(() => {
    if (filterType) {
      console.log('[ContactsList] 检测到filter参数:', filterType, ',重置shareFilter为all,重置分页');
      setShareFilter('all');
      setSearchQuery(''); // 同时清空搜索框
      setPage(1); // 重置到第一页
      setAllLoadedContacts([]); // 清空已加载的数据
    }
  }, [filterType]);
  
  // 轻量级获取联系人数量（全部、我的、共享）
  const { data: contactCounts } = trpc.contacts.counts.useQuery();
  
  // 获取统计数据（用于显示新增人数）
  const { data: stats } = trpc.contacts.stats.useQuery();
  
  // 根据筛选类型获取分类统计数量（全部、我的、共享）
  const { data: filteredCounts } = trpc.contacts.filteredCounts.useQuery(
    { filterType: filterType || '' },
    { enabled: !!filterType } // 只有有filterType时才查询
  );
  
  // 获取人脉列表（支持分页）
  const { data: contactsData, isLoading, isFetching } = trpc.contacts.list.useQuery({
    searchQuery: searchQuery || undefined,
    sortBy: sortBy,
    page: page,
    pageSize: 50,
    filterType: filterType || undefined, // 传递筛选类型给后端
  }, {
    enabled: viewMode !== 'company', // 公司视图不使用这个 API
    refetchOnMount: 'always', // 确保页面重新进入时刷新数据
    staleTime: 0, // 设置数据立即过期，确保每次都重新获取
  });
  
  // 当数据加载完成时，累加到已加载列表
  React.useEffect(() => {
    if (contactsData) {
      if (page === 1) {
        // 第一页，直接设置
        setAllLoadedContacts(contactsData.contacts);
      } else {
        // 后续页，追加
        setAllLoadedContacts(prev => [...prev, ...contactsData.contacts]);
      }
    }
  }, [contactsData, page]);
  
  // 当搜索条件、排序或筛选类型变化时，重置分页
  React.useEffect(() => {
    setPage(1);
    setAllLoadedContacts([]);
  }, [searchQuery, sortBy, filterType]);
  
  // 监听location变化，当返回列表页时强制刷新数据
  React.useEffect(() => {
    if (location === '/contacts') {
      // 重置分页、数据和搜索查询，触发重新加载
      setPage(1);
      setAllLoadedContacts([]);
      setSearchQuery(""); // 清空搜索查询
    }
  }, [location]);
  
  // 无限滚动：当滚动到底部时自动加载下一页
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && contactsData?.hasMore && !isFetching) {
          setPage(prev => prev + 1);
        }
      },
      { threshold: 0.1 }
    );
    
    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }
    
    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [contactsData?.hasMore, isFetching]);
  
  // 使用已加载的联系人列表
  const allContacts = allLoadedContacts;

  // 获取公司列表（当 viewMode 为 company 时）
  const { data: companyList, isLoading: isLoadingCompanyList, refetch: refetchCompanyList } = trpc.contacts.companyList.useQuery(undefined, {
    enabled: viewMode === 'company', // 只在公司视图时启用
    refetchOnMount: 'always', // 确保页面重新进入时刷新数据
    staleTime: 0, // 设置数据立即过期，确保每次都重新获取
  });
  
  // 当viewMode变化为company时，强制刷新公司列表
  React.useEffect(() => {
    if (viewMode === 'company') {
      console.log('[ContactsList] viewMode changed to company, refetching companyList...');
      refetchCompanyList();
    }
  }, [viewMode, refetchCompanyList]);
  
  // 调试日志
  console.log('[ContactsList] viewMode:', viewMode);
  console.log('[ContactsList] companyList:', companyList);
  console.log('[ContactsList] isLoadingCompanyList:', isLoadingCompanyList);
  
  // 轻量级获取共享人列表（用于下拉筛选）
  const { data: sharerListData } = trpc.sharing.getSharerList.useQuery();
  
  // 当用户点击"共享"或"全部"筛选时加载共享联系人列表（懒加载优化）
  const { data: sharedContacts, isLoading: isLoadingShared } = trpc.sharing.getSharedContacts.useQuery(undefined, {
    enabled: shareFilter === 'shared' || shareFilter === 'all', // 选中"共享"或"全部"时才加载
  });
  
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
      // 播放成功音效
      const audio = new Audio('/success-sound.mp3');
      audio.volume = 0.5;
      audio.play().catch(err => console.log('音效播放失败:', err));
      
      // 显示笑脸图标+"+1"动画（从中间出现然后被吸收到上方）
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 1rem;
        animation: absorbToTop 1.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        pointer-events: none;
      `;
      overlay.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #22c55e;">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
          <line x1="9" y1="9" x2="9.01" y2="9"></line>
          <line x1="15" y1="9" x2="15.01" y2="9"></line>
        </svg>
        <span style="font-size: 4rem; font-weight: bold; color: #22c55e;">+1</span>
      `;
      
      // 添加动画样式（从中间放大出现，然后向上移动并缩小消失）
      const style = document.createElement('style');
      style.textContent = `
        @keyframes absorbToTop {
          0% { 
            transform: translate(-50%, -50%) scale(0); 
            opacity: 0; 
          }
          30% { 
            transform: translate(-50%, -50%) scale(1.2); 
            opacity: 1; 
          }
          60% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
          100% { 
            transform: translate(-50%, calc(-50% - 200px)) scale(0.2); 
            opacity: 0; 
          }
        }
      `;
      document.head.appendChild(style);
      document.body.appendChild(overlay);
      
      // 1.2秒后移除
      setTimeout(() => {
        if (document.body.contains(overlay)) {
          document.body.removeChild(overlay);
        }
        if (document.head.contains(style)) {
          document.head.removeChild(style);
        }
      }, 1200);
      
      // 强制刷新列表数据，确保hasTodayInteraction状态更新
      await utils.contacts.list.refetch();
      setShowQuickContactDialog(false);
      setContactToRecord(null);
    },
    onError: (error) => {
      toast.error(error.message || "记录失败");
    },
  });
  
  // 共享人列表（使用轻量级 API）
  const sharerList = sharerListData || [];
  
  // 根据筛选条件合并自己的人脉和共享的人脉
  const mergedContacts = React.useMemo(() => {
    if (!allContacts) return [];
    
    // 为共享的人脉添加标记，并根据搜索关键词过滤
    let markedSharedContacts = sharedContacts?.map((contact: any) => ({
      ...contact,
      _isShared: true,
      _originalId: contact.id, // 保存原始ID用于后端操作
      // 确保共享人脉有唯一ID（避免与自己的人脉ID冲突）
      id: `shared_${contact.id}_${contact._sharerUserId || 'unknown'}`,
    })) || [];
    
    // 如果有搜索关键词,对共享人脉也进行过滤
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.trim();
      markedSharedContacts = markedSharedContacts.filter((contact: any) => {
        // 搜索姓名
        if (contact.name && contact.name.includes(query)) return true;
        // 搜索称谓
        if (contact.title && contact.title.includes(query)) return true;
        // 搜索职业
        if (contact.occupation && contact.occupation.includes(query)) return true;
        // 搜索电话 (精确匹配,不转换大小写)
        if (contact.phone && contact.phone.includes(query)) return true;
        // 搜索自定义字段值（公司、职位等）
        if (contact.fieldValues) {
          for (const fv of contact.fieldValues) {
            if (fv.value && fv.value.includes(query)) return true;
          }
        }
        // 搜索全局标签
        if (contact.tags) {
          for (const tag of contact.tags) {
            if (tag.name && tag.name.includes(query)) return true;
          }
        }
        // 搜索个人标签
        if (contact.personalTags) {
          for (const tag of contact.personalTags) {
            if (tag.name && tag.name.includes(query)) return true;
          }
        }
        return false;
      });
    }
    
    // 如果选中了共享模式并且选择了特定共享人，进行过滤
    if (shareFilter === 'shared' && sharerFilter !== 'all') {
      markedSharedContacts = markedSharedContacts.filter((contact: any) => 
        contact._sharerUserId?.toString() === sharerFilter
      );
    }
    
    // 根据 shareFilter 返回对应的人脉列表
    if (shareFilter === 'mine') {
      // 只显示自己的人脉
      return allContacts || [];
    } else if (shareFilter === 'shared') {
      // 只显示共享的人脉
      return markedSharedContacts || [];
    } else {
      // 显示全部人脉（自己的 + 共享的）
      const myContacts = allContacts || [];
      const sharedList = markedSharedContacts || [];
      return [...myContacts, ...sharedList];
    }
  }, [allContacts, sharedContacts, shareFilter, sharerFilter, searchQuery]);
  
  // 根据筛选条件过滤人脉（后端已处理，这里直接使用mergedContacts）
  const contacts = mergedContacts;
  
  // 获取人脉的全局字段分类（公司、职位等）- 移到这里以便在filteredContacts中使用
  const { data: fieldCategories } = trpc.contacts.fieldCategories.list.useQuery();
  
  // 按标签筛选（支持单选和多选）
  // 获取公司字段的categoryId
  const companyCategoryId = React.useMemo(() => {
    if (!fieldCategories) return null;
    const category = fieldCategories.find(c => c.name === '公司名称');
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
  
  // 检查所有公司的报告状态
  useEffect(() => {
    if (!filteredContacts || !companyCategoryId) return;
    
    // 收集所有公司名称
    const allCompanyNames = new Set<string>();
    filteredContacts.forEach(contact => {
      const companies = contact.fieldValues?.filter((fv: any) => 
        fv.categoryId === companyCategoryId && fv.value && fv.value.trim() !== ''
      ) || [];
      companies.forEach((company: any) => {
        allCompanyNames.add(company.value);
      });
    });
    
    // 检查每个公司是否有报告
    allCompanyNames.forEach(companyName => {
      // 如果已经检查过，跳过
      if (companyName in companyReportExistsMap) return;
      
      fetch(`/api/company-reports/${encodeURIComponent(companyName)}`)
        .then(res => res.json())
        .then(data => {
          setCompanyReportExistsMap(prev => ({ ...prev, [companyName]: !!data.data }));
        })
        .catch(() => {
          setCompanyReportExistsMap(prev => ({ ...prev, [companyName]: false }));
        });
    });
  }, [filteredContacts, companyCategoryId]);
  
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
  
  // 搜索框输入时显示模糊搜索下拉列表
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    // 当有输入内容时显示下拉框，否则隐藏
    if (value.trim()) {
      setShowDropdown(true);
      setShowHistory(false);
    } else {
      setShowDropdown(false);
      // 当清空输入时，如果有历史记录则显示历史
      if (searchHistory.length > 0) {
        setShowHistory(true);
      }
    }
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
      let note = quickContactNote.trim() || "快捷联络";
      // 如果选择了联络方式，添加到备注中
      if (contactMethod) {
        note = `${contactMethod} - ${note}`;
      }
      // 如果选择了重要性评分，添加到备注中
      if (importanceScore > 0) {
        note = `${note} [重要性:${importanceScore}分]`;
      }
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
      setContactMethod("");
      setImportanceScore(0);
    }
  };

  // 补记确认：使用选定的历史日期记录联络
  const confirmBackfillInteraction = () => {
    if (contactToRecord && backfillDate) {
      let note = quickContactNote.trim() || "补记联络";
      if (contactMethod) {
        note = `${contactMethod} - ${note}`;
      }
      if (importanceScore > 0) {
        note = `${note} [重要性:${importanceScore}分]`;
      }
      // 将选定日期转为ISO字符串（当天中午）
      const selectedDate = new Date(backfillDate + 'T12:00:00');
      recordInteractionMutation.mutate({ 
        contactId: contactToRecord.id,
        note,
        interactionDate: selectedDate.toISOString()
      }, {
        onSuccess: () => {
          // 补记的日期如果是今天，则更新hasTodayInteraction
          const today = new Date();
          const selected = new Date(backfillDate);
          const isToday = today.getFullYear() === selected.getFullYear() &&
            today.getMonth() === selected.getMonth() &&
            today.getDate() === selected.getDate();
          if (isToday) {
            setContactToRecord(prev => prev ? { ...prev, hasTodayInteraction: true } : null);
          }
          // 补记非当天日期，联络灯不变暗（不更新hasTodayInteraction）
        }
      });
      setQuickContactNote("");
      setContactMethod("");
      setImportanceScore(0);
      setShowBackfillDatePicker(false);
      setBackfillDate("");
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
    
    // 关闭下拉列表和历史记录
    setShowDropdown(false);
    setShowHistory(false);
    
    // 设置搜索查询为该人脉的名字,让它显示在列表中
    if (contact && contact.name) {
      setSearchQuery(contact.name);
    } else {
      setSearchQuery("");
    }
    
    // 让搜索框失去焦点,防止下拉列表重新打开
    if (searchRef.current) {
      const input = searchRef.current.querySelector('input');
      if (input) {
        input.blur();
      }
    }
    
    // 不再直接显示toast或跳转,让用户在列表中点击名片时才触发
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
      <div className="max-w-md mx-auto shadow-2xl bg-[#FAF3ED] min-h-screen">
      {/* 顶部深红色头部 */}
      <div className="bg-gradient-to-r from-[#A80000] to-[#d44] text-white px-4 pt-4 pb-5 rounded-b-3xl mb-4">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg sm:text-xl font-bold text-white">
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
          
          <div className="flex items-center gap-1">
            {/* 共享人脉筛选按钮 */}
              <button
                onClick={() => setShareFilter('all')}
                className={`h-7 px-2.5 text-xs rounded-full font-medium transition-all ${shareFilter === 'all' ? 'bg-white text-[#D32F2F]' : 'bg-white/20 text-white/90 hover:bg-white/30'}`}
              >
                全部{(filterType && filteredCounts) ? ` (${filteredCounts.total})` : (contactCounts ? ` (${contactCounts.total})` : '')}
              </button>
              <button
                onClick={() => setShareFilter('mine')}
                className={`h-7 px-2.5 text-xs rounded-full font-medium transition-all ${shareFilter === 'mine' ? 'bg-white text-[#D32F2F]' : 'bg-white/20 text-white/90 hover:bg-white/30'}`}
              >
                我的{(filterType && filteredCounts) ? ` (${filteredCounts.mine})` : (contactCounts ? ` (${contactCounts.mine})` : '')}
              </button>
              <button
                onClick={() => setShareFilter('shared')}
                className={`h-7 px-2.5 text-xs rounded-full font-medium transition-all ${shareFilter === 'shared' ? 'bg-white text-[#D32F2F]' : 'bg-white/20 text-white/90 hover:bg-white/30'}`}
              >
                共享{(filterType && filteredCounts) ? ` (${filteredCounts.shared})` : (contactCounts ? ` (${contactCounts.shared})` : '')}
              </button>
          </div>
        </div>
        
        <p className="text-xs sm:text-sm text-white/70 mb-3">
          {viewMode === 'company' && companyList ? (
            `共 ${new Set(companyList.map(item => item.companyName)).size} 家公司`
          ) : isLoading ? (
            `加载中...`
          ) : (filterType && filteredCounts) ? (
            // 有筛选类型时，根据 shareFilter 显示对应的分类数量
            shareFilter === 'all' ? `共 ${filteredCounts.total} 位人脉` :
            shareFilter === 'mine' ? `共 ${filteredCounts.mine} 位人脉` :
            `共 ${filteredCounts.shared} 位人脉`
          ) : contactCounts ? (
            // 无筛选类型时，显示总人脉数量
            shareFilter === 'all' ? `共 ${contactCounts.total} 位人脉` :
            shareFilter === 'mine' ? `共 ${contactCounts.mine} 位人脉` :
            `共 ${contactCounts.shared} 位人脉`
          ) : (
            `共 0 位人脉`
          )}
        </p>
        
      </div>
      {/* 工具栏区域 */}
      <div className="px-4">
        {/* 折叠标签按钮和排序按钮 */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            {allTags && allTags.length > 0 && (
              <button
                onClick={() => setIsTagAreaExpanded(!isTagAreaExpanded)}
                className="flex items-center h-8 px-3 text-xs rounded-xl bg-white shadow-sm text-[#D32F2F] font-medium hover:bg-[#D32F2F]-light transition-all"
              >
                <Tag className="h-3.5 w-3.5 mr-1.5" />
                {isTagAreaExpanded ? '收起标签' : '按标签筛选'}
              </button>
            )}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center h-8 px-3 text-xs rounded-xl bg-white shadow-sm text-[#D32F2F] font-medium hover:bg-[#D32F2F]-light transition-all"
                >
                  <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
                  {!sortBy && '按排序筛选'}
                  {sortBy === 'tagCount_desc' && '排序：标签数↓'}
                  {sortBy === 'tagCount_asc' && '排序：标签数↑'}
                  {sortBy === 'interactionCount_desc' && '排序：联络次数↓'}
                  {sortBy === 'interactionCount_asc' && '排序：联络次数↑'}
                </button>
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
            
            {/* 共享人筛选 - 带搜索功能的Combobox，只在选中“共享”时可用 */}
            <Popover open={sharerPopoverOpen} onOpenChange={setSharerPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  role="combobox"
                  aria-expanded={sharerPopoverOpen}
                  disabled={shareFilter !== 'shared'}
                  className={`flex items-center h-8 px-3 text-xs rounded-xl bg-white shadow-sm font-medium transition-all ${
                    shareFilter !== 'shared' ? 'opacity-40 cursor-not-allowed text-gray-400' : 'text-[#D32F2F] hover:bg-[#D32F2F]-light'
                  }`}
                >
                  <Handshake className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                  <span className="truncate max-w-[80px]">
                    {sharerFilter === 'all' ? '按共享人筛选' : 
                      sharerList.find(s => s.id === sharerFilter)?.name || '按共享人筛选'}
                  </span>
                  <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="搜索共享人..." className="h-9" />
                  <CommandList>
                    <CommandEmpty>未找到共享人</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="all"
                        onSelect={() => {
                          setSharerFilter('all');
                          setSharerPopoverOpen(false);
                        }}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${
                            sharerFilter === 'all' ? 'opacity-100' : 'opacity-0'
                          }`}
                        />
                        全部共享人
                      </CommandItem>
                      {sharerList.map((sharer) => (
                        <CommandItem
                          key={sharer.id}
                          value={sharer.name}
                          onSelect={() => {
                            setSharerFilter(sharer.id);
                            setSharerPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${
                              sharerFilter === sharer.id ? 'opacity-100' : 'opacity-0'
                            }`}
                          />
                          {sharer.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        
        {/* 标签筛选器 */}
        {allTags && allTags.length > 0 && isTagAreaExpanded && (
          <div className="mb-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                {/* 移除多选复选框，默认启用多选模式 */}
              </div>
            <button
              onClick={() => setShowTagManagement(true)}
              className="flex items-center h-7 px-2.5 text-xs rounded-lg text-[#D32F2F] hover:bg-[#D32F2F]-light transition-all mb-2"
            >
              <Settings className="h-3 w-3 mr-1" />
              标签管理
            </button>
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
        
        {/* 搜索框和按钮 */}
        <div className="flex gap-2 sm:gap-4">
          <div ref={searchRef} className="relative flex-1">
            <Input
              placeholder="搜索人脉..."
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={handleSearchFocus}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim()) {
                  // 回车键也可以触发搜索
                  console.log('搜索:', searchQuery);
                }
              }}
              className="pr-8 h-9 text-sm rounded-xl border-divider focus:border-[#D32F2F] focus:ring-[#A80000]"
            />
            {searchQuery && (
              <X
                className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-foreground z-10"
                onClick={() => {
                  setSearchQuery("");
                  setShowDropdown(false);
                  setShowHistory(false);
                }}
              />
            )}
            
            {/* 搜索下拉列表 */}
            {showDropdown && dropdownContacts.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-divider dark:border-gray-700 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
                {dropdownContacts.map((contact: any) => {
                  const company = getFieldValue(contact, "公司名称");
                  const position = getFieldValue(contact, "职位");
                  
                  return (
                    <div
                      key={contact.id}
                      onClick={(e) => handleContactClick(contact.id, contact, e)}
                      className="px-3 sm:px-4 py-2 sm:py-3 hover:bg-[#FAF3ED] dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm sm:text-base truncate">{contact.name}</span>
                            {contact.title && (
                              <span className="text-xs sm:text-sm text-muted-foreground truncate">{contact.title}</span>
                            )}
                          </div>
                          {contact.username && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              @{contact.username}
                            </div>
                          )}
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
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-divider dark:border-gray-700 rounded-lg shadow-lg z-50">
                <div className="flex items-center justify-between px-3 sm:px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-xs sm:text-sm text-muted-foreground">搜索历史</span>
                  <button
                    onClick={handleClearHistory}
                    className="text-xs text-[#D32F2F] hover:underline"
                  >
                    清空
                  </button>
                </div>
                {searchHistory.map((query, index) => (
                  <div
                    key={index}
                    onClick={() => handleHistoryClick(query)}
                    className="flex items-center justify-between px-3 sm:px-4 py-2 hover:bg-[#FAF3ED] dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-b-0"
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
          
          <button 
            onClick={handleAddContact}
            className="flex items-center justify-center h-9 w-9 rounded-xl bg-[#D32F2F] text-white hover:bg-[#D32F2F]-dark transition-all shadow-sm"
          >
            <Plus className="h-4 w-4" />
          </button>
          
          {/* 刷新按钮 */}
          <button
            onClick={() => {
              refetch();
              refetchCompanyList();
              refetchTags();
              toast.success('已刷新');
            }}
            className="flex items-center justify-center h-9 w-9 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-all shadow-sm"
            title="刷新页面"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* 批量操作工具栏 */}
      {selectedContactIds.length > 0 && (
        <div className="border border-[#D32F2F]/30 rounded-2xl p-3 mb-4 flex flex-wrap items-center justify-between gap-2 bg-[#D32F2F]-light">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[#D32F2F]">
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
                className="text-xs h-7 px-2 text-[#D32F2F] hover:text-[#D32F2F]-dark"
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
              <span className="text-xs text-[#CBA471]">请先创建“周关注”、“月关注”、“季关注”标签</span>
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
                    className="text-xs h-7 px-2 bg-[#D32F2F]-light border-[#D32F2F]/30 text-[#D32F2F] hover:bg-[#FFEBEE] rounded-lg"
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
                    className="text-xs h-7 px-2 bg-[#D32F2F]-light border-[#D32F2F]/30 text-[#D32F2F] hover:bg-[#FFEBEE] rounded-lg"
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
                    className="text-xs h-7 px-2 bg-[#D32F2F]-light border-[#D32F2F]/30 text-[#D32F2F] hover:bg-[#FFEBEE] rounded-lg"
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
                  className="text-xs h-7 px-2 bg-[#D32F2F]-light border-[#D32F2F]/30 text-[#D32F2F] hover:bg-[#FFEBEE] rounded-lg"
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
                  className="text-xs h-7 px-2 bg-[#D32F2F]-light border-[#D32F2F]/30 text-[#D32F2F] hover:bg-[#FFEBEE] rounded-lg"
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
      <div className="mt-4">
        {(isLoading || isLoadingCompanyList) ? (
          <div className="text-center py-8 text-muted-foreground">加载中...</div>
        ) : viewMode === 'company' ? (
          // 公司视图
          companyList && companyList.length > 0 ? (
          // 公司列表视图
          <div className="space-y-2">
            {companyList.map((company) => (
              <Card 
                key={company.companyName}
                className={`bg-white rounded-2xl shadow-sm hover:shadow-md transition-all border-0 ${company.isShared ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                onClick={() => {
                  // 如果是共享的公司，弹出提示
                  if (company.isShared) {
                    alert('该公司为共享人脉，请联系共享人查看详情');
                    return;
                  }
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
                        <CardTitle className="text-lg text-[#D32F2F]">{company.companyName}</CardTitle>
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
                              className={`text-sm text-muted-foreground ${company.isShared ? 'cursor-not-allowed' : 'hover:text-primary cursor-pointer'}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (company.isShared) {
                                  alert('该公司为共享人脉，请联系共享人查看详情');
                                  return;
                                }
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
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>暂无公司信息</p>
              <p className="text-sm mt-2">请为人脉添加"公司名称"字段</p>
            </div>
          )
        ) : filteredContacts && filteredContacts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {filteredContacts.map((contact) => {
              const isContactSelected = selectedContactIds.includes(contact.id);
              return (
                <Card 
                  key={contact.id}
                  className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer relative border-0"
                  style={isContactSelected ? {
                    boxShadow: `0 0 0 2px #A80000`,
                    backgroundColor: '#A800000d'
                  } : {}}
                  onClick={(e) => {
                    if (selectedContactIds.length > 0) {
                      // 如果已有选中的人脉，点击卡片切换选中状态
                      // 共享人脉不可选中
                      if (contact._isShared) {
                        e.stopPropagation();
                        return;
                      }
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
                {selectedContactIds.length > 0 && !contact._isShared && (
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
                        accentColor: '#A80000'
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
                            style={!contact._isShared ? { color: '#A80000' } : {}} />
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
                            style={!contact._isShared ? { color: '#A80000' } : {}}
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
                            style={!contact._isShared ? { color: '#A80000' } : {}}
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
                            style={!contact._isShared ? { color: '#A80000' } : {}}
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
                                  : 'text-[#D32F2F] hover:opacity-70 cursor-pointer'
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
                            <Handshake className="h-4 w-4" style={{ color: '#A80000' }} />
                            <span className="text-xs text-muted-foreground">{contact._sharedBy}</span>
                          </span>
                        )}
                      </div>
                      {contact.title && (
                        <span className="text-xs sm:text-sm text-muted-foreground font-normal">
                          {contact.title}
                        </span>
                      )}
                      {/* 公司列表显示 - 显示所有公司全称+报告图标 */}
                      {(() => {
                        if (!companyCategoryId) return null;
                        const companies = contact.fieldValues?.filter((fv: any) => fv.categoryId === companyCategoryId && fv.value && fv.value.trim() !== '') || [];
                        if (companies.length === 0) return null;
                        return (
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            {companies.map((companyField: any, index: number) => (
                              <div key={index} className="flex items-center gap-1">
                                <span className="text-xs sm:text-sm text-[#757575] dark:text-gray-400 font-medium">
                                  {companyField.value}
                                </span>
                                <CompanyReportIcon 
                                  hasReport={companyReportExistsMap[companyField.value] || false}
                                  onClick={(e) => {
                                    if (contact._isShared) {
                                      e.stopPropagation();
                                      return;
                                    }
                                    e.stopPropagation();
                                    setSelectedCompanyForReport(companyField.value);
                                    setShowCompanyReportDialog(true);
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    {/* 右上角操作按钮 */}
                    <div className="flex items-center gap-1">
                      {/* 快捷联络按钮 - 共享人脉禁用 */}
                      {/* 快速联络按钮 */}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0"
                        onClick={(e) => {
                          if (contact._isShared) {
                            e.stopPropagation();
                            return;
                          }
                          handleQuickContactClick(e, contact);
                        }}
                        disabled={contact._isShared || contact.hasTodayInteraction}
                      >
                        <MessageCircle 
                          className={`h-4 w-4 transition-colors ${
                            contact._isShared || contact.hasTodayInteraction
                              ? 'text-gray-400 opacity-50'
                              : 'text-[#D32F2F] hover:text-[#D32F2F]-dark'
                          }`}
                        />
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
                            backgroundColor: mapColorToTheme(tag.color || '#A80000'),
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
        ) : !isLoading && !isLoadingCompanyList && filteredContacts && filteredContacts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchQuery ? '没有找到匹配的人脉' : ''}
          </div>
        ) : null}
        
        {/* 无限滚动触发器 */}
        {contactsData && contactsData.hasMore && (
          <div 
            ref={loadMoreRef}
            className="text-center py-4 text-muted-foreground"
          >
            {isFetching ? '加载中...' : ''}
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
          setContactMethod("");
          setImportanceScore(0);
          setShowBackfillDatePicker(false);
          setBackfillDate("");
        }
      }}>
        <DialogContent className="p-5 overflow-hidden">
          <DialogHeader>
            <DialogTitle>记录沟通</DialogTitle>
            <DialogDescription>
              {contactToRecord?.hasTodayInteraction 
                ? `今天已经记录过与 "${contactToRecord?.name}" 的联络，单日确认上限1次`
                : `记录与 "${contactToRecord?.name}" 的本次联络`
              }
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '8px', width: '100%', boxSizing: 'border-box' }}>
            {!contactToRecord?.hasTodayInteraction && (
              <>
                {/* 联络方式选择（可选） */}
                <div style={{ width: '100%', boxSizing: 'border-box' }}>
                  <Label className="text-sm text-gray-500 mb-2 block">联络方式（可选）</Label>
                  <div style={{ display: 'flex', gap: '6px', width: '100%', boxSizing: 'border-box' }}>
                    {["会面", "电话", "微信"].map((method) => (
                      <Button
                        key={method}
                        type="button"
                        variant={contactMethod === method ? "default" : "outline"}
                        onClick={() => setContactMethod(contactMethod === method ? "" : method)}
                        style={{ flex: 1, height: '36px', fontSize: '14px', padding: 0, minWidth: 0 }}
                      >
                        {method}
                      </Button>
                    ))}
                  </div>
                </div>
                {/* 互动重要性评分（可选） */}
                <div style={{ width: '100%', boxSizing: 'border-box' }}>
                  <Label className="text-sm text-gray-500 mb-2 block">互动重要性评分（可选）</Label>
                  <div style={{ display: 'flex', gap: '6px', width: '100%', boxSizing: 'border-box' }}>
                    {[1, 2, 3, 4, 5].map((score) => (
                      <Button
                        key={score}
                        type="button"
                        variant={importanceScore === score ? "default" : "outline"}
                        onClick={() => setImportanceScore(importanceScore === score ? 0 : score)}
                        style={{ flex: 1, height: '36px', fontSize: '14px', padding: 0, minWidth: 0 }}
                      >
                        {score}分
                      </Button>
                    ))}
                  </div>
                </div>
                {/* 备注输入 */}
                <div style={{ width: '100%', boxSizing: 'border-box' }}>
                  <Input
                    placeholder="输入备注（可选）"
                    value={quickContactNote}
                    onChange={(e) => setQuickContactNote(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </>
            )}
            {/* 补记日期选择器（点击补记后展开） */}
            {showBackfillDatePicker && (
              <div className="border border-gray-200 rounded-lg bg-gray-50 p-3 flex flex-col gap-2">
                <Label className="text-sm text-gray-600 block">选择联络日期</Label>
                <input
                  type="date"
                  value={backfillDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setBackfillDate(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm outline-none block"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: '6px', width: '100%', boxSizing: 'border-box' }}>
                  <Button
                    onClick={confirmBackfillInteraction}
                    disabled={!backfillDate || recordInteractionMutation.isPending}
                    style={{ flex: 1, backgroundColor: '#A80000', color: 'white', height: '36px', fontSize: '14px', minWidth: 0 }}
                  >
                    {recordInteractionMutation.isPending ? "记录中..." : "保存补记"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowBackfillDatePicker(false);
                      setBackfillDate("");
                    }}
                    style={{ flex: 1, height: '36px', fontSize: '14px', minWidth: 0 }}
                  >
                    收起
                  </Button>
                </div>
              </div>
            )}
            <Button 
              onClick={confirmRecordInteraction}
              disabled={recordInteractionMutation.isPending || contactToRecord?.hasTodayInteraction}
              style={{ width: '100%', backgroundColor: '#A80000', color: 'white', boxSizing: 'border-box' }}
            >
              {recordInteractionMutation.isPending ? "记录中..." : "确认记录"}
            </Button>
            {/* 取消 + 补记 并排一行 */}
            <div style={{ display: 'flex', gap: '6px', width: '100%', boxSizing: 'border-box' }}>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowQuickContactDialog(false);
                  setContactToRecord(null);
                  setQuickContactNote("");
                  setContactMethod("");
                  setImportanceScore(0);
                  setShowBackfillDatePicker(false);
                  setBackfillDate("");
                }}
                style={{ flex: 1, minWidth: 0 }}
              >
                取消
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowBackfillDatePicker(!showBackfillDatePicker);
                  if (!showBackfillDatePicker) {
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    setBackfillDate(yesterday.toISOString().split('T')[0]);
                  }
                }}
                style={{ flex: 1, minWidth: 0, borderColor: '#A80000', color: '#A80000' }}
              >
                {showBackfillDatePicker ? "收起补记" : "补记"}
              </Button>
            </div>
          </div>
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
                  将为 <span className="font-semibold" style={{ color: '#A80000' }}>{selectedContactIds.length}</span> 位人脉批量添加「
                  <span className="font-semibold" style={{ color: '#A80000' }}>{confirmDialog.tagName}</span>
                  」标签，是否继续？
                </span>
              )}
              {confirmDialog.type === 'remove' && (
                <span>
                  将为 <span className="font-semibold" style={{ color: '#A80000' }}>{selectedContactIds.length}</span> 位人脉批量移除「
                  <span className="font-semibold" style={{ color: '#A80000' }}>{confirmDialog.tagName}</span>
                  」标签，是否继续？
                </span>
              )}
              {confirmDialog.type === 'cycle' && (
                <span>
                  将为 <span className="font-semibold" style={{ color: '#A80000' }}>{selectedContactIds.length}</span> 位人脉设置「
                  <span className="font-semibold" style={{ color: '#A80000' }}>{confirmDialog.tagName}</span>
                  」关注周期，是否继续？
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#D32F2F] hover:bg-[#D32F2F]-dark text-white"
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