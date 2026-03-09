import { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crown, Notebook, Gem, MessageSquare, ChevronLeft, Search, UserPlus, ChevronDown, ArrowUpDown, X, Hourglass, BookOpen, FolderPlus, Folder, FolderOpen, Pencil, Trash2, FolderInput, Calculator } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { UserAvatar } from "@/components/UserAvatar";
import { toast } from "sonner";
import { pinyin } from "pinyin-pro";
import BottomNav from "@/components/BottomNav";


export default function Ledger() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [archivingLedgerId, setArchivingLedgerId] = useState<number | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [invitingLedgerId, setInvitingLedgerId] = useState<number | null>(null);
  const [searchUsername, setSearchUsername] = useState("");
  const [showDestroyDialog, setShowDestroyDialog] = useState(false);
  const [destroyingLedgerId, setDestroyingLedgerId] = useState<number | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportingLedgerId, setExportingLedgerId] = useState<number | null>(null);
  const [expandedLedgerIds, setExpandedLedgerIds] = useState<Set<number>>(new Set());
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [showSortDialog, setShowSortDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<string>("");
  const [memberInput, setMemberInput] = useState<string>("");
  const [sortBy, setSortByState] = useState<"members" | "records" | "date">(() => {
    try {
      const saved = localStorage.getItem('ledgerSortBy');
      if (saved === 'members' || saved === 'records' || saved === 'date') return saved;
    } catch (e) {}
    return 'date';
  });
  const [sortOrder, setSortOrderState] = useState<"asc" | "desc">(() => {
    try {
      const saved = localStorage.getItem('ledgerSortOrder');
      if (saved === 'asc' || saved === 'desc') return saved;
    } catch (e) {}
    return 'desc';
  });
  const [lastClickedLedgerId, setLastClickedLedgerId] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem('lastClickedLedgerId');
      return saved ? parseInt(saved, 10) : null;
    } catch (e) {}
    return null;
  });
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [selectedCopyLedgerId, setSelectedCopyLedgerId] = useState<number | null>(null);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [joinSecretKey, setJoinSecretKey] = useState("");
  const [showAddMenu, setShowAddMenu] = useState(false);

  // 分组相关 state
  const [showGroupManageDialog, setShowGroupManageDialog] = useState(false);
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroup, setEditingGroup] = useState<{ id: number; name: string } | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<number | null>(null);
  const [showAssignGroupDialog, setShowAssignGroupDialog] = useState(false);
  const [assigningLedgerId, setAssigningLedgerId] = useState<number | null>(null);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<number>>(new Set());

  // 持久化排序设置的包装函数
  const setSortBy = (val: "members" | "records" | "date") => {
    setSortByState(val);
    try { localStorage.setItem('ledgerSortBy', val); } catch (e) {}
    // 排序时清除点击置顶，排序优先
    setLastClickedLedgerId(null);
    try { localStorage.removeItem('lastClickedLedgerId'); } catch (e) {}
  };
  const setSortOrder = (val: "asc" | "desc") => {
    setSortOrderState(val);
    try { localStorage.setItem('ledgerSortOrder', val); } catch (e) {}
    // 排序时清除点击置顶，排序优先
    setLastClickedLedgerId(null);
    try { localStorage.removeItem('lastClickedLedgerId'); } catch (e) {}
  };
  const handleLedgerClick = (ledgerId: number) => {
    setLastClickedLedgerId(ledgerId);
    try { localStorage.setItem('lastClickedLedgerId', ledgerId.toString()); } catch (e) {}
    // 重新进入账本时清除上次的标签选择，让其默认第一个标签
    try { sessionStorage.removeItem(`ledger_${ledgerId}_selectedTagId`); } catch (e) {}
  };

  // 获取当前用户信息
  const { data: user } = trpc.auth.me.useQuery();

  // 获取账本分组数据
  const { data: groupData, refetch: refetchGroups } = trpc.ledgerGroup.list.useQuery();
  const groups = groupData?.groups || [];
  const ledgerGroupMap: Record<number, number | null> = groupData?.ledgerGroupMap || {};

  // 分组 mutations
  const createGroupMutation = trpc.ledgerGroup.create.useMutation({
    onSuccess: () => { toast.success('分组已创建'); refetchGroups(); setShowCreateGroupDialog(false); setNewGroupName(''); },
    onError: (e) => toast.error(`创建失败: ${e.message}`),
  });
  const updateGroupMutation = trpc.ledgerGroup.update.useMutation({
    onSuccess: () => { toast.success('分组已重命名'); refetchGroups(); setEditingGroup(null); },
    onError: (e) => toast.error(`重命名失败: ${e.message}`),
  });
  const deleteGroupMutation = trpc.ledgerGroup.delete.useMutation({
    onSuccess: () => { toast.success('分组已删除，账本已移出分组'); refetchGroups(); setDeletingGroupId(null); },
    onError: (e) => toast.error(`删除失败: ${e.message}`),
  });
  const assignGroupMutation = trpc.ledgerGroup.assignLedger.useMutation({
    onSuccess: () => { toast.success('已更新分组'); refetchGroups(); setShowAssignGroupDialog(false); setAssigningLedgerId(null); },
    onError: (e) => toast.error(`操作失败: ${e.message}`),
  });
  
  // 从后端API获取账本列表
  const { data: ledgers, isLoading, refetch } = trpc.ledger.list.useQuery({
    isArchived: activeTab === "archived",
  });
  
  // 分别查询使用中和已存档的数量
  const { data: activeLedgers } = trpc.ledger.list.useQuery({ isArchived: false });
  const { data: archivedLedgers } = trpc.ledger.list.useQuery({ isArchived: true });

  // 获取所有待结账目
  const { data: pendingData } = trpc.ledger.getAllPending.useQuery();
  const hasPendingTransactions = (pendingData && pendingData.length > 0);

  // 获取所有账本中的成员名单（去重）
  const allMembers = useMemo(() => {
    const memberMap = new Map<string, { username: string; nickname?: string }>();
    ledgers?.forEach(ledger => {
      ledger.members?.forEach(m => {
        if (m.username && !memberMap.has(m.username)) {
          memberMap.set(m.username, { username: m.username, nickname: m.nickname });
        }
      });
    });
    return Array.from(memberMap.values()).sort((a, b) => (a.username || '').localeCompare(b.username || ''));
  }, [ledgers]);

  // 根据输入匹配成员（支持拼音首字母）
  const matchedMembers = useMemo(() => {
    if (!memberInput.trim()) return allMembers;
    
    const searchTerm = memberInput.toLowerCase();
    return allMembers.filter(member => {
      const displayName = member.nickname || member.username;
      
      // 直接匹配
      if (displayName.toLowerCase().includes(searchTerm)) return true;
      
      // 拼音全拼匹配
      const fullPinyin = pinyin(displayName, { toneType: 'none', type: 'array' }).join('').toLowerCase();
      if (fullPinyin.includes(searchTerm)) return true;
      
      // 拼音首字母匹配
      const initialPinyin = pinyin(displayName, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase();
      if (initialPinyin.includes(searchTerm)) return true;
      
      return false;
    });
  }, [allMembers, memberInput]);

  // 搜索和排序逻辑
  const filteredLedgers = useMemo(() => {
    let result = ledgers || [];
    
    // 搜索过滤
    if (searchQuery) {
      result = result.filter(ledger => 
        ledger.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // 按成员筛选（支持拼音首字母模糊查询）
    if (selectedMember) {
      const searchTerm = selectedMember.toLowerCase();
      result = result.filter(ledger => 
        ledger.members?.some(m => {
          if (!m.username) return false;
          const username = m.username.toLowerCase();
          // 直接匹配
          if (username.includes(searchTerm)) return true;
          
          // 拼音全拼匹配
          const fullPinyin = pinyin(m.username, { toneType: 'none', type: 'array' }).join('').toLowerCase();
          if (fullPinyin.includes(searchTerm)) return true;
          
          // 拼音首字母匹配
          const initialPinyin = pinyin(m.username, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase();
          if (initialPinyin.includes(searchTerm)) return true;
          
          return false;
        })
      );
    }
    
    // 排序：最近点击的账本置顶，其余按自定义排序
    result = [...result].sort((a, b) => {
      // 第一优先级：最近点击的账本置顶
      if (lastClickedLedgerId !== null) {
        if (a.id === lastClickedLedgerId && b.id !== lastClickedLedgerId) return -1;
        if (b.id === lastClickedLedgerId && a.id !== lastClickedLedgerId) return 1;
      }
      
      // 第二优先级：自定义排序
      let comparison = 0;
      switch (sortBy) {
        case "members":
          comparison = (b.memberCount || 0) - (a.memberCount || 0);
          break;
        case "records":
          comparison = (b.recordCount || 0) - (a.recordCount || 0);
          break;
        case "date":
        default:
          comparison = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          break;
      }
      return sortOrder === "asc" ? -comparison : comparison;
    });
    
    return result;
  }, [ledgers, searchQuery, selectedMember, sortBy, sortOrder, lastClickedLedgerId]);

  // 封存账本的mutation
  const archiveMutation = trpc.ledger.archive.useMutation({
    onSuccess: () => {
      toast.success('账本已封存');
      refetch();
      setShowArchiveDialog(false);
      setArchivingLedgerId(null);
    },
    onError: (error) => {
      toast.error(`封存失败: ${error.message}`);
    },
  });

  // 处理封存确认
  const handleArchiveConfirm = () => {
    if (archivingLedgerId) {
      archiveMutation.mutate({ ledgerId: archivingLedgerId, isArchived: true });
    }
  };

  // 搜索用户
  const { data: searchResults } = trpc.sharing.searchUsers.useQuery(
    { query: searchUsername },
    { enabled: searchUsername.length > 0 }
  );

  // 邀请成员的mutation
  const inviteMutation = trpc.ledger.inviteMember.useMutation({
    onSuccess: (data) => {
      toast.success(`已成功邀请 ${data.member.username} 加入账本`);
      setShowInviteDialog(false);
      setSearchUsername("");
      setInvitingLedgerId(null);
      refetch();
    },
    onError: (error) => {
      toast.error(`邀请失败: ${error.message}`);
    },
  });

  // 处理邀请用户
  const handleInviteUser = (username: string) => {
    if (invitingLedgerId) {
      inviteMutation.mutate({ ledgerId: invitingLedgerId, username });
    }
  };

  // 删除账本的mutation
  const deleteMutation = trpc.ledger.delete.useMutation({
    onSuccess: () => {
      toast.success('账本已销毁');
      refetch();
      setShowDestroyDialog(false);
      setDestroyingLedgerId(null);
    },
    onError: (error) => {
      toast.error(`销毁失败: ${error.message}`);
    },
  });

  // 处理销毁确认
  const handleDestroyConfirm = () => {
    if (destroyingLedgerId) {
      deleteMutation.mutate({ ledgerId: destroyingLedgerId });
    }
  };

  // 复制账本的mutation
  const copyMutation = trpc.ledger.copy.useMutation({
    onSuccess: (data) => {
      toast.success(`已成功复制账本：${data.name}`);
      refetch();
      setShowCopyDialog(false);
      setSelectedCopyLedgerId(null);
    },
    onError: (error) => {
      toast.error(`复制失败: ${error.message}`);
    },
  });

  // 处理复制确认
  const handleCopyConfirm = () => {
    if (selectedCopyLedgerId) {
      copyMutation.mutate({ ledgerId: selectedCopyLedgerId });
    }
  };

  // 通过密钥加入账本
  const joinMutation = trpc.ledger.joinBySecretKey.useMutation({
    onSuccess: (data) => {
      toast.success(`已成功加入账本：${data.ledgerName}`);
      refetch();
      setShowJoinDialog(false);
      setJoinSecretKey("");
    },
    onError: (error) => {
      toast.error(`加入失败: ${error.message}`);
    },
  });

  const handleJoinConfirm = () => {
    if (joinSecretKey.trim()) {
      joinMutation.mutate({ secretKey: joinSecretKey.trim() });
    }
  };

  // 获取导出统计信息
  const { data: exportStats } = trpc.ledger.getExportStats.useQuery(
    { ledgerId: exportingLedgerId! },
    { enabled: showExportDialog && exportingLedgerId !== null }
  );

  // 打开导出预览对话框
  const handleOpenExportDialog = (ledgerId: number) => {
    setExportingLedgerId(ledgerId);
    setShowExportDialog(true);
  };

  // 导出账本的处理函数
  const handleExport = async (ledgerId: number) => {
    setShowExportDialog(false);
    const loadingToast = toast.loading(
      <div className="flex items-center gap-2">
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-500"></div>
        <span>正在生成Excel文件...</span>
      </div>
    );
    try {
      if (!user) {
        throw new Error('未登录');
      }
      
      const response = await fetch(`/api/ledger/${ledgerId}/export`, {
        method: 'GET',
        headers: {
          'X-User-Id': user.id.toString(),
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '导出失败');
      }
      
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `账目导出_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.xlsx`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=(['"]?)([^'"\n]*?)\1/);
        if (filenameMatch && filenameMatch[2]) {
          filename = decodeURIComponent(filenameMatch[2]);
        }
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.dismiss(loadingToast);
      toast.success(
        <div className="flex flex-col gap-1">
          <div className="font-semibold">导出成功！</div>
          <div className="text-xs text-[#757575]">{filename}</div>
          <div className="text-xs text-gray-500">文件已保存到下载文件夹</div>
        </div>,
        { duration: 4000 }
      );
    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error(`导出失败: ${error.message || '未知错误'}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF3ED] pb-20 max-w-md mx-auto relative shadow-2xl">
      {/* 顶部导航栏 */}
      <div className="bg-white shadow-sm sticky top-0 z-40">
        <div className="px-4 py-3 flex items-center">
          <Link href="/">
            <button className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft className="w-6 h-6 text-[#222222]" />
            </button>
          </Link>
          <h1 className="flex-1 text-lg font-medium text-center text-[#222222]">共享账本</h1>
          <div className="flex items-center gap-1">
            {/* 私人定制按钮 */}
            <Link href="/custom-showcase">
              <button
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="私人定制账本"
              >
                <Gem className="w-5 h-5 text-[#CBA471]" strokeWidth={2} />
              </button>
            </Link>
            {/* 汇率计算器按钮 */}
            <Link href="/exchange-rate">
              <button
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="汇率计算器"
              >
                <Calculator className="w-5 h-5 text-[#222222]" strokeWidth={2} />
              </button>
            </Link>
            {/* 说明书按钮 */}
            <Link href="/ledger/guide">
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="功能说明书">
                <BookOpen className="w-5 h-5 text-[#222222]" strokeWidth={2} />
              </button>
            </Link>
            <div className="relative">
              <button 
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                onClick={() => setShowSearchDialog(!showSearchDialog)}
              >
                <Search className="w-5 h-5 text-[#222222]" strokeWidth={2} />
              </button>
              
              {/* 搜索下拉菜单 */}
              {showSearchDialog && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-4">
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">账本名称</label>
                      <Input
                        placeholder="输入账本名称..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="relative">
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">按成员筛选</label>
                      <Input
                        placeholder="输入成员名称或首字母..."
                        value={memberInput}
                        onChange={(e) => setMemberInput(e.target.value)}
                        autoComplete="off"
                        className="h-9"
                      />
                      <p className="text-xs text-gray-500 mt-1">支持拼音首字母搜索，如“j”匹配“姜”</p>
                      
                      {/* 下拉提示列表 */}
                      {memberInput && matchedMembers.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                          {matchedMembers.map((member, index) => (
                            <button
                              key={index}
                              className="w-full px-3 py-2 text-left hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-b-0 text-sm"
                              onClick={() => {
                                const displayName = member.nickname || member.username;
                                setSelectedMember(displayName);
                                setMemberInput(displayName);
                                setShowSearchDialog(false); // 选择成员后自动关闭弹窗
                              }}
                            >
                              <span className="text-gray-900">{member.nickname || member.username}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8"
                        onClick={() => setShowSearchDialog(false)}
                      >
                        取消
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 h-8 bg-[#D32F2F] hover:bg-[#B71C1C]"
                        onClick={() => setShowSearchDialog(false)}
                      >
                        确定
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <button 
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                onClick={() => setShowSortDialog(!showSortDialog)}
              >
                <ArrowUpDown className="w-5 h-5 text-[#222222]" strokeWidth={2} />
              </button>
              
              {/* 排序下拉菜单 */}
              {showSortDialog && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-2">
                  <button
                    className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                      sortBy === "members" && sortOrder === "desc"
                        ? "bg-red-50 text-[#D32F2F]"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                    onClick={() => {
                      setSortBy("members");
                      setSortOrder("desc");
                      setShowSortDialog(false);
                    }}
                  >
                    成员人数：由多到少
                  </button>
                  <button
                    className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                      sortBy === "members" && sortOrder === "asc"
                        ? "bg-red-50 text-[#D32F2F]"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                    onClick={() => {
                      setSortBy("members");
                      setSortOrder("asc");
                      setShowSortDialog(false);
                    }}
                  >
                    成员人数：由少到多
                  </button>
                  <button
                    className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                      sortBy === "records" && sortOrder === "desc"
                        ? "bg-red-50 text-[#D32F2F]"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                    onClick={() => {
                      setSortBy("records");
                      setSortOrder("desc");
                      setShowSortDialog(false);
                    }}
                  >
                    账目条数：由多到少
                  </button>
                  <button
                    className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                      sortBy === "records" && sortOrder === "asc"
                        ? "bg-red-50 text-[#D32F2F]"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                    onClick={() => {
                      setSortBy("records");
                      setSortOrder("asc");
                      setShowSortDialog(false);
                    }}
                  >
                    账目条数：由少到多
                  </button>
                  <button
                    className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                      sortBy === "date" && sortOrder === "desc"
                        ? "bg-red-50 text-[#D32F2F]"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                    onClick={() => {
                      setSortBy("date");
                      setSortOrder("desc");
                      setShowSortDialog(false);
                    }}
                  >
                    开账日期：由新到旧
                  </button>
                  <button
                    className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                      sortBy === "date" && sortOrder === "asc"
                        ? "bg-red-50 text-[#D32F2F]"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                    onClick={() => {
                      setSortBy("date");
                      setSortOrder("asc");
                      setShowSortDialog(false);
                    }}
                  >
                    开账日期：由旧到新
                  </button>
                </div>
              )}
            </div>
            {/* 待结算按钮（仅当有待结账目时显示） */}
            {hasPendingTransactions && (
              <button 
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                onClick={() => setLocation("/pending-overview")}
              >
                <Hourglass className="w-5 h-5 text-[#222222]" strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 切换按钮 */}
      <div className="px-4 py-3">
        <div className="flex gap-2 items-center">
          <div className="flex flex-1 gap-2 bg-white rounded-2xl p-1 shadow-sm">
            <button
              onClick={() => setActiveTab("active")}
              className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-colors ${
                activeTab === "active"
                  ? "bg-[#D32F2F] text-white shadow-sm"
                  : "text-[#757575] hover:bg-gray-100"
              }`}
            >
              使用中 {activeLedgers && `(${activeLedgers.length})`}
            </button>
            <button
              onClick={() => setActiveTab("archived")}
              className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-colors ${
                activeTab === "archived"
                  ? "bg-[#D32F2F] text-white shadow-sm"
                  : "text-[#757575] hover:bg-gray-100"
              }`}
            >
              已封存 {archivedLedgers && `(${archivedLedgers.length})`}
            </button>
          </div>
          {/* 快捷添加按钮 */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="w-10 h-10 bg-[#D32F2F] text-white rounded-xl shadow-sm flex items-center justify-center text-xl font-light hover:bg-[#B71C1C] transition-colors"
            >
              +
            </button>
            {showAddMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />
                <div className="absolute right-0 top-12 z-50 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden w-44">
                  <button
                    className="w-full px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors border-b border-gray-100"
                    onClick={() => { setShowAddMenu(false); setShowCreateDialog(true); }}
                  >
                    新建账本
                  </button>
                  <button
                    className="w-full px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors"
                    onClick={() => { setShowAddMenu(false); setShowJoinDialog(true); }}
                  >
                    加入他人账本
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 账本列表 */}
      <div className="px-4 pb-4">
        {isLoading ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <p className="text-gray-500">加载中...</p>
          </div>
        ) : filteredLedgers.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <p className="text-gray-500">暂无{activeTab === "active" ? "使用中" : "已封存"}的账本</p>
          </div>
        ) : activeTab === "archived" ? (
          // 已封存账本不分组
          <div className="space-y-3">
          {filteredLedgers.map((ledger) => (
            <div
              key={ledger.id}
              className="cursor-pointer"
              onClick={() => {
                if ((ledger as any).type === 'opinion_book_demo') {
                  setLocation(`/demo/opinion/${ledger.id}`);
                  return;
                }
                if ((ledger as any).type === 'opinion_book') {
                  // AB型意见本：直接用 ledger.id 跳转（已统一架构）
                  setLocation(`/opinion/${ledger.id}`);
                  return;
                }
                handleLedgerClick(ledger.id);
                setLocation(`/ledger/${ledger.id}`);
              }}
            >
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="px-4 py-4">
                  {/* 账本标题区 */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {(['custom_aa', 'custom_ab', 'custom_ac', 'custom_ad', 'custom_ae', 'diet', 'opinion_book', 'opinion_book_demo'].includes((ledger as any).type)) ? <Gem className="w-5 h-5 flex-shrink-0 text-[#CBA471]" strokeWidth={2} /> : <Notebook className="w-5 h-5 flex-shrink-0 text-[#D32F2F]" strokeWidth={2.5} />}
                        <h3 className="font-bold text-lg text-[#222222] truncate">{ledger.name}</h3>
                        {ledger.isVip === true && (
                          <Badge variant="secondary" className="bg-gradient-to-r from-amber-400 to-amber-500 text-white text-xs px-1.5 py-0.5 flex-shrink-0 shadow-sm">
                            VIP
                          </Badge>
                        )}
                        {(ledger as any).type === 'opinion_book_demo' && (
                          <Badge variant="secondary" className="bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs px-1.5 py-0.5 flex-shrink-0 shadow-sm">
                            演示
                          </Badge>
                        )}
                      </div>
                      {/* 展开/收起按钮：custom_aa 类型仅 super_admin 可见 */}
                      {!((ledger as any).type === 'custom_aa' && user?.role !== 'super_admin') && (
                        <button
                          className="p-1 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedLedgerIds(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(ledger.id)) {
                                newSet.delete(ledger.id);
                              } else {
                                newSet.add(ledger.id);
                              }
                              return newSet;
                            });
                          }}
                        >
                          <ChevronDown 
                            className={`w-5 h-5 text-gray-400 transition-transform ${
                              expandedLedgerIds.has(ledger.id) ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                      )}
                    </div>
                    {/* 信息行：小头像 + 开账天数 + 账目条数 */}
                    {!((ledger as any).type === 'custom_aa' && user?.role !== 'super_admin') && (
                    <div className="flex items-center gap-3 text-sm text-gray-400 font-medium">
                      <div className="flex items-center gap-1.5">
                        <div className="flex -space-x-1">
                          {(ledger.members || []).slice(0, 3).map((member, index) => (
                            <div 
                              key={member.userId} 
                              className="ring-1 ring-white rounded-full relative" 
                              style={{ zIndex: 3 - index, width: '20px', height: '20px' }}
                            >
                              <img
                                src={member.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${member.username}`}
                                alt={member.nickname || member.username || ''}
                                className="w-full h-full object-cover rounded-full"
                              />
                              {(member as any).memberType === 'ai' && (
                                <div 
                                  className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-white font-bold border border-white"
                                  style={{ 
                                    background: 'linear-gradient(135deg, #D32F2F, #FF5252)', 
                                    fontSize: '5px', 
                                    padding: '0px 2px', 
                                    borderRadius: '4px',
                                    lineHeight: '8px',
                                    letterSpacing: '0.5px'
                                  }}
                                >
                                  AI
                                </div>
                              )}
                            </div>
                          ))}
                          {(ledger.memberCount || 0) > 3 && (
                            <div 
                              className="ring-1 ring-white rounded-full bg-gray-200 flex items-center justify-center" 
                              style={{ zIndex: 0, width: '20px', height: '20px' }}
                            >
                              <span className="text-gray-600 text-xs font-bold">+</span>
                            </div>
                          )}
                        </div>
                        <span>
                          <span className="text-[#D32F2F] font-semibold">{ledger.memberCount}</span>
                          <span className="text-gray-500">人共享</span>
                        </span>
                      </div>
                      <span className="text-gray-300">|</span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#4CAF50]"></span>
                        {(ledger as any).type === 'custom_ae' ? <>开箱 {Math.floor((Date.now() - new Date(ledger.createdAt).getTime()) / (1000 * 60 * 60 * 24))}天</> : <>开账 {Math.floor((Date.now() - new Date(ledger.createdAt).getTime()) / (1000 * 60 * 60 * 24))}天</>}
                      </span>
                      <span className="text-gray-300">|</span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#D32F2F]"></span>
                        {(ledger as any).type === 'custom_ae'
                          ? <>{(ledger as any).activeLotteryCount || 0}个抽奖进行中</>
                          : <>{ledger.recordCount || 0}条账目</>}
                      </span>
                    </div>
                    )}
                  </div>

                  {/* 操作按钮区 - 默认折叠，opinion_book类型不显示 */}
                  {expandedLedgerIds.has(ledger.id) && (ledger as any).type !== 'opinion_book' && (
                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
                    {activeTab === "active" && (
                      <>
                        <button
                          className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/ledger/${ledger.id}/filter`);
                          }}
                        >
                          搜索
                        </button>
                        <button
                          className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInvitingLedgerId(ledger.id);
                            setShowInviteDialog(true);
                          }}
                        >
                          共享
                        </button>
                        <button
                          className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/ledger/${ledger.id}/report`);
                          }}
                        >
                          报表
                        </button>
                        <button
                          className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenExportDialog(ledger.id);
                          }}
                        >
                          导出
                        </button>
                        <button
                          className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/ledger/${ledger.id}/settings`);
                          }}
                        >
                          设置
                        </button>
                        <button
                          className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setArchivingLedgerId(ledger.id);
                            setShowArchiveDialog(true);
                          }}
                        >
                          封存
                        </button>

                      </>
                    )}
                    {activeTab === "archived" && (
                      <>
                        <button
                          className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors col-span-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenExportDialog(ledger.id);
                          }}
                        >
                          导出
                        </button>
                        <button
                          className="text-xs h-8 rounded-xl bg-[#D32F2F]-light text-[#D32F2F] font-medium hover:bg-[#FFEBEE] transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDestroyingLedgerId(ledger.id);
                            setShowDestroyDialog(true);
                          }}
                        >
                          销毁
                        </button>
                      </>
                    )}
                  </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          </div>
        ) : (
          // 使用中账本：按分组展示
          <div className="space-y-4">
            {/* 有分组的展示 */}
            {groups.map(group => {
              const groupLedgers = filteredLedgers.filter(l => ledgerGroupMap[l.id] === group.id);
              if (groupLedgers.length === 0) return null;
              const isCollapsed = collapsedGroupIds.has(group.id);
              return (
                <div key={group.id}>
                  {/* 分组标题 */}
                  <button
                    className="flex items-center gap-2 w-full mb-2 px-1"
                    onClick={() => setCollapsedGroupIds(prev => {
                      const next = new Set(prev);
                      if (next.has(group.id)) next.delete(group.id); else next.add(group.id);
                      return next;
                    })}
                  >
                    {isCollapsed
                      ? <Folder className="w-4 h-4 text-[#D32F2F]" />
                      : <FolderOpen className="w-4 h-4 text-[#D32F2F]" />}
                    <span className="text-sm font-semibold text-[#D32F2F]">{group.name}</span>
                    <span className="text-xs text-gray-400">({groupLedgers.length})</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-3">
                      {groupLedgers.map(ledger => (
                        <div key={ledger.id} className="cursor-pointer" onClick={() => { if ((ledger as any).type === 'opinion_book_demo') { setLocation(`/demo/opinion/${ledger.id}`); return; } if ((ledger as any).type === 'opinion_book') { setLocation(`/opinion/${ledger.id}`); return; } handleLedgerClick(ledger.id); setLocation(`/ledger/${ledger.id}`); }}>
                          <div className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-shadow border-l-4 border-[#D32F2F]">
                            <div className="px-4 py-4">
                              <div className="mb-3">
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {(['custom_aa', 'custom_ab', 'custom_ac', 'custom_ad', 'custom_ae', 'diet', 'opinion_book', 'opinion_book_demo'].includes((ledger as any).type)) ? <Gem className="w-5 h-5 flex-shrink-0 text-[#CBA471]" strokeWidth={2} /> : <Notebook className="w-5 h-5 flex-shrink-0 text-[#D32F2F]" strokeWidth={2.5} />}
                                    <h3 className="font-bold text-lg text-[#222222] truncate">{ledger.name}</h3>
                                    {ledger.isVip === true && <Badge variant="secondary" className="bg-gradient-to-r from-amber-400 to-amber-500 text-white text-xs px-1.5 py-0.5 flex-shrink-0 shadow-sm">VIP</Badge>}
                                  </div>
                                  {!((ledger as any).type === 'custom_aa' && user?.role !== 'super_admin') && (
                                    <button className="p-1 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0" onClick={(e) => { e.stopPropagation(); setExpandedLedgerIds(prev => { const s = new Set(prev); s.has(ledger.id) ? s.delete(ledger.id) : s.add(ledger.id); return s; }); }}>
                                      <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${expandedLedgerIds.has(ledger.id) ? 'rotate-180' : ''}`} />
                                    </button>
                                  )}
                                </div>
                                {!((ledger as any).type === 'custom_aa' && user?.role !== 'super_admin') && (
                                <div className="flex items-center gap-3 text-sm text-gray-400 font-medium">
                                  <span className="flex items-center gap-1"><span className="text-[#D32F2F] font-semibold">{ledger.memberCount}</span><span className="text-gray-500">人共享</span></span>
                                  <span className="text-gray-300">|</span>
                                  <span>{(ledger as any).type === 'custom_ae' ? <>开箱 {Math.floor((Date.now() - new Date(ledger.createdAt).getTime()) / (1000 * 60 * 60 * 24))}天</> : <>开账 {Math.floor((Date.now() - new Date(ledger.createdAt).getTime()) / (1000 * 60 * 60 * 24))}天</>}</span>
                                  <span className="text-gray-300">|</span>
                                  <span>{(ledger as any).type === 'custom_ae' ? <>{(ledger as any).activeLotteryCount || 0}个抽奖进行中</> : <>{ledger.recordCount || 0}条账目</>}</span>
                                </div>
                                )}
                              </div>
                              {expandedLedgerIds.has(ledger.id) && (
                                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
                                  <button className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors" onClick={(e) => { e.stopPropagation(); setLocation(`/ledger/${ledger.id}/filter`); }}>搜索</button>
                                  <button className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors" onClick={(e) => { e.stopPropagation(); setInvitingLedgerId(ledger.id); setShowInviteDialog(true); }}>共享</button>
                                  <button className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors" onClick={(e) => { e.stopPropagation(); setLocation(`/ledger/${ledger.id}/report`); }}>报表</button>
                                  <button className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors" onClick={(e) => { e.stopPropagation(); handleOpenExportDialog(ledger.id); }}>导出</button>
                                  <button className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors" onClick={(e) => { e.stopPropagation(); setLocation(`/ledger/${ledger.id}/settings`); }}>设置</button>
                                  <button className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors" onClick={(e) => { e.stopPropagation(); setArchivingLedgerId(ledger.id); setShowArchiveDialog(true); }}>封存</button>

                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {/* 未分组的账本 */}
            {(() => {
              const ungrouped = filteredLedgers.filter(l => !ledgerGroupMap[l.id]);
              if (ungrouped.length === 0 && groups.length > 0) return null;
              return (
                <div>
                  {groups.length > 0 && (
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <Folder className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-semibold text-gray-500">未分组</span>
                      <span className="text-xs text-gray-400">({ungrouped.length})</span>
                    </div>
                  )}
                  <div className="space-y-3">
                    {ungrouped.map(ledger => (
                      <div key={ledger.id} className="cursor-pointer" onClick={() => { if ((ledger as any).type === 'opinion_book_demo') { setLocation(`/demo/opinion/${ledger.id}`); return; } if ((ledger as any).type === 'opinion_book') { setLocation(`/opinion/${ledger.id}`); return; } handleLedgerClick(ledger.id); setLocation(`/ledger/${ledger.id}`); }}>
                        <div className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                          <div className="px-4 py-4">
                            <div className="mb-3">
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  {(['custom_aa', 'custom_ab', 'custom_ac', 'custom_ad', 'custom_ae', 'diet', 'opinion_book', 'opinion_book_demo'].includes((ledger as any).type)) ? <Gem className="w-5 h-5 flex-shrink-0 text-[#CBA471]" strokeWidth={2} /> : <Notebook className="w-5 h-5 flex-shrink-0 text-[#D32F2F]" strokeWidth={2.5} />}
                                  <h3 className="font-bold text-lg text-[#222222] truncate">{ledger.name}</h3>
                                  {ledger.isVip === true && <Badge variant="secondary" className="bg-gradient-to-r from-amber-400 to-amber-500 text-white text-xs px-1.5 py-0.5 flex-shrink-0 shadow-sm">VIP</Badge>}
                                </div>
                                {!((ledger as any).type === 'custom_aa' && user?.role !== 'super_admin') && (
                                  <button className="p-1 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0" onClick={(e) => { e.stopPropagation(); setExpandedLedgerIds(prev => { const s = new Set(prev); s.has(ledger.id) ? s.delete(ledger.id) : s.add(ledger.id); return s; }); }}>
                                    <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${expandedLedgerIds.has(ledger.id) ? 'rotate-180' : ''}`} />
                                  </button>
                                )}
                              </div>
                              {!((ledger as any).type === 'custom_aa' && user?.role !== 'super_admin') && (
                              <div className="flex items-center gap-3 text-sm text-gray-400 font-medium">
                                <span className="flex items-center gap-1"><span className="text-[#D32F2F] font-semibold">{ledger.memberCount}</span><span className="text-gray-500">人共享</span></span>
                                <span className="text-gray-300">|</span>
                                <span>{(ledger as any).type === 'custom_ae' ? <>开箱 {Math.floor((Date.now() - new Date(ledger.createdAt).getTime()) / (1000 * 60 * 60 * 24))}天</> : <>开账 {Math.floor((Date.now() - new Date(ledger.createdAt).getTime()) / (1000 * 60 * 60 * 24))}天</>}</span>
                                <span className="text-gray-300">|</span>
                                <span>{(ledger as any).type === 'custom_ae' ? <>{(ledger as any).activeLotteryCount || 0}个抽奖进行中</> : <>{ledger.recordCount || 0}条账目</>}</span>
                              </div>
                              )}
                            </div>
                            {expandedLedgerIds.has(ledger.id) && (
                              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
                                <button className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors" onClick={(e) => { e.stopPropagation(); setLocation(`/ledger/${ledger.id}/filter`); }}>搜索</button>
                                <button className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors" onClick={(e) => { e.stopPropagation(); setInvitingLedgerId(ledger.id); setShowInviteDialog(true); }}>共享</button>
                                <button className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors" onClick={(e) => { e.stopPropagation(); setLocation(`/ledger/${ledger.id}/report`); }}>报表</button>
                                <button className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors" onClick={(e) => { e.stopPropagation(); handleOpenExportDialog(ledger.id); }}>导出</button>
                                <button className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors" onClick={(e) => { e.stopPropagation(); setLocation(`/ledger/${ledger.id}/settings`); }}>设置</button>
                                <button className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors" onClick={(e) => { e.stopPropagation(); setArchivingLedgerId(ledger.id); setShowArchiveDialog(true); }}>封存</button>

                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* 加入他人账本弹出面板 */}
      {showJoinDialog && (
        <>
          {/* 透明遮罩层，点击关闭 */}
          <div className="fixed inset-0 z-40" onClick={() => { setShowJoinDialog(false); setJoinSecretKey(""); }} />
          <div className="fixed left-0 right-0 z-50" style={{ bottom: '70px' }}>
            <div className="max-w-md mx-auto px-4">
              <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-gray-900">加入他人账本</h3>
                  <button onClick={() => { setShowJoinDialog(false); setJoinSecretKey(""); }} className="p-1 hover:bg-gray-100 rounded-full">
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-3">请输入密钥（66位）以加入共享账本。密钥可从账本管理员处获取。</p>
                <div className="mb-3">
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">账本密钥</label>
                  <Input
                    placeholder="请输入密钥"
                    value={joinSecretKey}
                    onChange={(e) => setJoinSecretKey(e.target.value)}
                    className="font-mono text-xs h-9"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 border-[#D32F2F] text-[#D32F2F]"
                    onClick={() => { setShowJoinDialog(false); setJoinSecretKey(""); }}
                  >
                    取消
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 h-8 bg-[#D32F2F] hover:bg-[#B71C1C] text-white"
                    onClick={handleJoinConfirm}
                    disabled={!joinSecretKey.trim() || joinMutation.isPending}
                  >
                    {joinMutation.isPending ? '加入中...' : '确认加入'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 统一底部导航栏 */}
      <BottomNav 
        onJoinLedger={() => setShowJoinDialog(!showJoinDialog)}
        onCreateLedger={() => setShowCreateDialog(true)}
      />

      {/* 创建账本对话框 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="w-[85%] rounded-xl p-0 gap-0" showCloseButton={false}>
          <DialogTitle className="sr-only">创建账本</DialogTitle>
          <button
            onClick={() => {
              setShowCreateDialog(false);
              setLocation("/ledger/create-type");
            }}
            className="w-full text-center py-4 text-[#D32F2F] font-semibold border-b border-gray-100 hover:bg-[#FFF3F3] transition-colors text-[15px]"
          >
            新建全新账本
          </button>
          <button
            onClick={() => {
              setShowCreateDialog(false);
              setShowCopyDialog(true);
            }}
            className="w-full text-center py-4 text-[#D32F2F] font-semibold border-b border-gray-100 hover:bg-[#FFF3F3] transition-colors text-[15px]"
          >
            复制已有账本
          </button>
          <button
            onClick={() => setShowCreateDialog(false)}
            className="w-full text-center py-4 text-gray-600 font-medium hover:bg-gray-50 transition-colors text-[15px]"
          >
            取消
          </button>
        </DialogContent>
      </Dialog>

      {/* 封存确认对话框 */}
      <Dialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <DialogContent className="w-[85%] rounded-lg p-0 gap-0" showCloseButton={false}>
          <DialogTitle className="sr-only">封存账本</DialogTitle>
          <div className="p-6 text-center">
            <div className="text-2xl mb-4">⚠️</div>
            <p className="text-[#222222] mb-2 font-medium">一旦封存将不可以再修改</p>
            <p className="text-sm text-gray-500">封存后的账本只能查看和导出，无法继续编辑</p>
          </div>
          <button
            onClick={handleArchiveConfirm}
            disabled={archiveMutation.isPending}
            className="w-full text-center py-3.5 text-[#D32F2F] font-medium border-t border-divider hover:bg-[#FAF3ED] transition-colors disabled:opacity-50"
          >
            {archiveMutation.isPending ? '封存中...' : '确认封存'}
          </button>
          <button
            onClick={() => {
              setShowArchiveDialog(false);
              setArchivingLedgerId(null);
            }}
            disabled={archiveMutation.isPending}
            className="w-full text-center py-3.5 text-[#757575] font-medium border-t border-divider hover:bg-[#FAF3ED] transition-colors disabled:opacity-50"
          >
            取消
          </button>
        </DialogContent>
      </Dialog>

      {/* 邀请成员对话框 */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="w-[90%] max-w-md rounded-lg !top-[calc(30%+40px)]" showCloseButton={false}>
          <DialogTitle className="text-lg font-semibold mb-4">邀请成员</DialogTitle>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="输入用户名搜索..."
                value={searchUsername}
                onChange={(e) => setSearchUsername(e.target.value)}
                className="pl-10 pr-4"
              />
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {searchUsername.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  请输入用户名进行搜索
                </div>
              ) : searchResults && searchResults.length > 0 ? (
                searchResults.map((user: any) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 bg-[#FAF3ED] rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        username={user.username}
                        avatar={user.avatar}
                        size="sm"
                      />
                      <div>
                        <p className="font-medium text-[#222222]">{user.name || user.username}</p>
                        <p className="text-sm text-gray-500">@{user.username}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleInviteUser(user.username)}
                      disabled={inviteMutation.isPending}
                      className="text-white hover:opacity-90 bg-[#D32F2F]"
                    >
                      <UserPlus className="w-4 h-4 mr-1" />
                      添加
                    </Button>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500 text-sm">
                  未找到用户
                </div>
              )}
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setShowInviteDialog(false);
                setSearchUsername("");
                setInvitingLedgerId(null);
              }}
            >
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 销毁确认对话框 */}
      <Dialog open={showDestroyDialog} onOpenChange={setShowDestroyDialog}>
        <DialogContent className="w-[85%] rounded-lg p-0 gap-0" showCloseButton={false}>
          <DialogTitle className="sr-only">销毁账本</DialogTitle>
          <div className="p-6 text-center">
            <div className="text-2xl mb-4">⚠️</div>
            <p className="text-[#222222] mb-2 font-medium">一旦销毁将永远消失</p>
            <p className="text-sm text-gray-500">销毁后无法恢复，请谨慎操作</p>
          </div>
          <button
            onClick={handleDestroyConfirm}
            disabled={deleteMutation.isPending}
            className="w-full text-center py-3.5 text-[#D32F2F] font-medium border-t border-divider hover:bg-[#FAF3ED] transition-colors disabled:opacity-50"
          >
            {deleteMutation.isPending ? '销毁中...' : '确认销毁'}
          </button>
          <button
            onClick={() => {
              setShowDestroyDialog(false);
              setDestroyingLedgerId(null);
            }}
            className="w-full text-center py-3.5 text-[#757575] font-medium border-t border-divider hover:bg-[#FAF3ED] transition-colors"
          >
            取消
          </button>
        </DialogContent>
      </Dialog>

      {/* 导出预览对话框 */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="w-[90%] max-w-md rounded-2xl p-0" showCloseButton={false}>
          <DialogTitle className="sr-only">导出账本</DialogTitle>
          
          {exportStats ? (
            <div className="p-6">
              {/* 标题 */}
              <div className="text-center mb-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">导出账本</h3>
                <p className="text-sm text-gray-600">{exportStats.ledgerName}</p>
              </div>

              {/* 统计信息 */}
              <div className="space-y-3 mb-6">
                {/* 记录数 */}
                <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                  <span className="text-sm text-gray-600">记录总数</span>
                  <span className="text-base font-semibold text-gray-900">{exportStats.totalRecords} 条</span>
                </div>

                {/* 时间范围 */}
                {exportStats.earliestDate && exportStats.latestDate && (
                  <div className="p-3 bg-white border border-gray-200 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">时间范围</div>
                    <div className="text-sm font-medium text-gray-900">
                      {exportStats.earliestDate} 至 {exportStats.latestDate}
                    </div>
                  </div>
                )}

                {/* 收入支出 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-white border border-gray-200 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">总收入</div>
                    <div className="text-base font-semibold text-green-600">¥{exportStats.totalIncome}</div>
                  </div>
                  <div className="p-3 bg-white border border-gray-200 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">总支出</div>
                    <div className="text-base font-semibold text-red-600">¥{exportStats.totalExpense}</div>
                  </div>
                </div>

                {/* 结余 */}
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">结余</span>
                    <span className={`text-lg font-bold ${
                      parseFloat(exportStats.balance) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      ¥{exportStats.balance}
                    </span>
                  </div>
                </div>
              </div>

              {/* 按钮 */}
              <div className="space-y-2">
                <Button
                  onClick={() => handleExport(exportingLedgerId!)}
                  className="w-full h-12 text-base font-medium text-white rounded-lg"
                  style={{ backgroundColor: '#D32F2F' }}
                >
                  下载 Excel 文件
                </Button>
                <Button
                  onClick={() => setShowExportDialog(false)}
                  variant="outline"
                  className="w-full h-12 text-base font-medium rounded-lg border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-500">正在加载统计信息...</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 复制账本选择对话框 */}
      <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
        <DialogContent className="w-[90%] max-w-md rounded-2xl p-0" showCloseButton={false}>
          <DialogTitle className="sr-only">选择要复制的账本</DialogTitle>
          
          <div className="p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4 text-center">选择要复制的账本</h3>
            
            {/* 账本列表 */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {ledgers && ledgers.length > 0 ? (
                ledgers.map((ledger) => (
                  <button
                    key={ledger.id}
                    onClick={() => setSelectedCopyLedgerId(ledger.id)}
                    className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                      selectedCopyLedgerId === ledger.id
                        ? "border-[#D32F2F] bg-red-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {(['custom_aa', 'custom_ab', 'custom_ac', 'custom_ad', 'custom_ae', 'diet', 'opinion_book', 'opinion_book_demo'].includes((ledger as any).type)) ? <Gem className="w-5 h-5 text-[#CBA471]" strokeWidth={2} /> : <Notebook className="w-5 h-5 text-[#D32F2F]" />}
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{ledger.name}</div>
                        <div className="text-sm text-gray-500">
                          {ledger.memberCount}人共享 · {ledger.recordCount || 0}条账目
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  暂无可复制的账本
                </div>
              )}
            </div>
            
            {/* 按钮 */}
            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowCopyDialog(false);
                  setSelectedCopyLedgerId(null);
                }}
              >
                取消
              </Button>
              <Button
                className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C]"
                onClick={handleCopyConfirm}
                disabled={!selectedCopyLedgerId || copyMutation.isPending}
              >
                {copyMutation.isPending ? '复制中...' : '确认复制'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 分组管理对话框 */}
      <Dialog open={showGroupManageDialog} onOpenChange={setShowGroupManageDialog}>
        <DialogContent className="w-[90%] max-w-md rounded-2xl p-0" showCloseButton={false}>
          <DialogTitle className="sr-only">管理分组</DialogTitle>
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">管理分组</h3>
              <button onClick={() => setShowGroupManageDialog(false)} className="p-1 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            {/* 分组列表 */}
            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              {groups.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-6">还没有分组，点击下方创建第一个</p>
              ) : groups.map(group => (
                <div key={group.id} className="flex items-center gap-2 p-3 bg-[#FAF3ED] rounded-xl">
                  <Folder className="w-4 h-4 text-[#D32F2F] flex-shrink-0" />
                  {editingGroup !== null && editingGroup.id === group.id ? (
                    <Input
                      autoFocus
                      value={editingGroup.name}
                      onChange={(e) => setEditingGroup(prev => prev ? { ...prev, name: e.target.value } : prev)}
                      onKeyDown={(e) => {
                        if (editingGroup && e.key === 'Enter' && editingGroup.name.trim()) {
                          updateGroupMutation.mutate({ groupId: group.id, name: editingGroup.name.trim() });
                        } else if (e.key === 'Escape') setEditingGroup(null);
                      }}
                      className="flex-1 h-7 text-sm"
                    />
                  ) : (
                    <span className="flex-1 text-sm font-medium text-gray-800">{group.name}</span>
                  )}
                  {editingGroup !== null && editingGroup.id === group.id ? (
                    <button
                      className="text-xs text-[#D32F2F] font-medium px-2 py-1 rounded hover:bg-red-50"
                      onClick={() => { if (editingGroup && editingGroup.name.trim()) updateGroupMutation.mutate({ groupId: group.id, name: editingGroup.name.trim() }); }}
                      disabled={updateGroupMutation.isPending}
                    >保存</button>
                  ) : (
                    <>
                      <button className="p-1 hover:bg-gray-200 rounded" onClick={() => setEditingGroup({ id: group.id, name: group.name })}>
                        <Pencil className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                      <button
                        className="p-1 hover:bg-red-100 rounded"
                        onClick={() => setDeletingGroupId(group.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            {/* 删除确认 */}
            {deletingGroupId !== null && (
              <div className="mb-4 p-3 bg-red-50 rounded-xl border border-red-200">
                <p className="text-sm text-red-700 mb-2">确认删除分组“{groups.find(g => g.id === deletingGroupId)?.name}”？账本将被移出分组，不会删除。</p>
                <div className="flex gap-2">
                  <button className="flex-1 text-xs py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600" onClick={() => setDeletingGroupId(null)}>取消</button>
                  <button
                    className="flex-1 text-xs py-1.5 rounded-lg bg-[#D32F2F] text-white"
                    onClick={() => deleteGroupMutation.mutate({ groupId: deletingGroupId })}
                    disabled={deleteGroupMutation.isPending}
                  >{deleteGroupMutation.isPending ? '删除中...' : '确认删除'}</button>
                </div>
              </div>
            )}
            {/* 创建新分组 */}
            <button
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-[#D32F2F] text-[#D32F2F] text-sm font-medium hover:bg-[#FFF3F3] transition-colors"
              onClick={() => { setShowGroupManageDialog(false); setShowCreateGroupDialog(true); }}
            >
              <FolderPlus className="w-4 h-4" />
              创建新分组
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 创建分组对话框 */}
      <Dialog open={showCreateGroupDialog} onOpenChange={setShowCreateGroupDialog}>
        <DialogContent className="w-[85%] rounded-2xl p-0" showCloseButton={false}>
          <DialogTitle className="sr-only">创建分组</DialogTitle>
          <div className="p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-3">创建新分组</h3>
            <Input
              autoFocus
              placeholder="输入分组名称，如“张三的账本”"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && newGroupName.trim() && createGroupMutation.mutate({ name: newGroupName.trim() })}
              className="mb-4"
              maxLength={50}
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowCreateGroupDialog(false); setNewGroupName(''); }}>取消</Button>
              <Button
                className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C] text-white"
                onClick={() => newGroupName.trim() && createGroupMutation.mutate({ name: newGroupName.trim() })}
                disabled={!newGroupName.trim() || createGroupMutation.isPending}
              >{createGroupMutation.isPending ? '创建中...' : '确认创建'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 归组对话框 */}
      <Dialog open={showAssignGroupDialog} onOpenChange={setShowAssignGroupDialog}>
        <DialogContent className="w-[85%] rounded-2xl p-0" showCloseButton={false}>
          <DialogTitle className="sr-only">选择分组</DialogTitle>
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">选择分组</h3>
              <button onClick={() => { setShowAssignGroupDialog(false); setAssigningLedgerId(null); }} className="p-1 hover:bg-gray-100 rounded-full">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="space-y-2 mb-3">
              {/* 移出分组选项 */}
              <button
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                  assigningLedgerId !== null && !ledgerGroupMap[assigningLedgerId]
                    ? 'border-[#D32F2F] bg-red-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => assigningLedgerId !== null && assignGroupMutation.mutate({ ledgerId: assigningLedgerId, groupId: null })}
              >
                <Folder className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">不分组</span>
              </button>
              {groups.map(group => (
                <button
                  key={group.id}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                    assigningLedgerId !== null && ledgerGroupMap[assigningLedgerId] === group.id
                      ? 'border-[#D32F2F] bg-red-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => assigningLedgerId !== null && assignGroupMutation.mutate({ ledgerId: assigningLedgerId, groupId: group.id })}
                  disabled={assignGroupMutation.isPending}
                >
                  <FolderOpen className="w-4 h-4 text-[#D32F2F]" />
                  <span className="text-sm font-medium text-gray-800">{group.name}</span>
                  {assigningLedgerId !== null && ledgerGroupMap[assigningLedgerId] === group.id && (
                    <span className="ml-auto text-xs text-[#D32F2F] font-medium">当前</span>
                  )}
                </button>
              ))}
            </div>
            {groups.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-2">还没有分组，请先创建分组</p>
            )}
            <button
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm hover:bg-gray-50 transition-colors mt-2"
              onClick={() => { setShowAssignGroupDialog(false); setShowCreateGroupDialog(true); }}
            >
              <FolderPlus className="w-4 h-4" />
              新建分组
            </button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
