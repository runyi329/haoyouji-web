import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useColorTheme } from "@/contexts/ColorThemeContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crown, Notebook, ChevronLeft, Search, UserPlus, ChevronDown, ArrowUpDown } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { UserAvatar } from "@/components/UserAvatar";
import { toast } from "sonner";
import { pinyin } from "pinyin-pro";


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
  const [sortBy, setSortBy] = useState<"members" | "records" | "date">("date");

  // 获取当前用户信息
  const { data: user } = trpc.auth.me.useQuery();
  
  // 从后端API获取账本列表
  const { data: ledgers, isLoading, refetch } = trpc.ledger.list.useQuery({
    isArchived: activeTab === "archived",
  });
  
  // 分别查询使用中和已存档的数量
  const { data: activeLedgers } = trpc.ledger.list.useQuery({ isArchived: false });
  const { data: archivedLedgers } = trpc.ledger.list.useQuery({ isArchived: true });

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
    
    // 排序
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "members":
          return (b.memberCount || 0) - (a.memberCount || 0);
        case "records":
          return (b.recordCount || 0) - (a.recordCount || 0);
        case "date":
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
    
    return result;
  }, [ledgers, searchQuery, selectedMember, sortBy]);

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
    <div className="min-h-screen bg-[#FAF3ED] pb-24 max-w-md mx-auto relative shadow-2xl">
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
            <button 
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              onClick={() => setShowSearchDialog(true)}
            >
              <Search className="w-5 h-5 text-[#222222]" strokeWidth={2} />
            </button>
            <button 
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              onClick={() => setShowSortDialog(true)}
            >
              <ArrowUpDown className="w-5 h-5 text-[#222222]" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      {/* 切换按钮 */}
      <div className="px-4 py-3">
        <div className="flex gap-2 bg-white rounded-2xl p-1 shadow-sm">
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
      </div>

      {/* 账本列表 */}
      <div className="px-4 pb-4 space-y-3">
        {isLoading ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <p className="text-gray-500">加载中...</p>
          </div>
        ) : filteredLedgers.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <p className="text-gray-500">暂无{activeTab === "active" ? "使用中" : "已封存"}的账本</p>
          </div>
        ) : (
          filteredLedgers.map((ledger) => (
            <div
              key={ledger.id}
              className="cursor-pointer"
              onClick={() => setLocation(`/ledger/${ledger.id}`)}
            >
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="px-4 py-4">
                  {/* 账本标题区 */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Notebook className="w-5 h-5 flex-shrink-0 text-[#D32F2F]" strokeWidth={2.5} />
                        <h3 className="font-bold text-lg text-[#222222] truncate">{ledger.name}</h3>
                        {ledger.isVip === true && (
                          <Badge variant="secondary" className="bg-gradient-to-r from-amber-400 to-amber-500 text-white text-xs px-1.5 py-0.5 flex-shrink-0 shadow-sm">
                            VIP
                          </Badge>
                        )}
                      </div>
                      {/* 展开/收起按钮 */}
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
                    </div>
                    {/* 信息行：小头像 + 开账天数 + 账目条数 */}
                    <div className="flex items-center gap-3 text-sm text-gray-400 font-medium">
                      <div className="flex items-center gap-1.5">
                        <div className="flex -space-x-1">
                          {(ledger.members || []).slice(0, 3).map((member, index) => (
                            <div 
                              key={member.userId} 
                              className="ring-1 ring-white rounded-full overflow-hidden" 
                              style={{ zIndex: 3 - index, width: '20px', height: '20px' }}
                            >
                              <img
                                src={member.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${member.username}`}
                                alt={member.nickname || member.username}
                                className="w-full h-full object-cover"
                              />
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
                        <span className="text-[#D32F2F] font-semibold">{ledger.memberCount}人共享</span>
                      </div>
                      <span className="text-gray-300">|</span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#4CAF50]"></span>
                        开账 {Math.floor((Date.now() - new Date(ledger.createdAt).getTime()) / (1000 * 60 * 60 * 24))}天
                      </span>
                      <span className="text-gray-300">|</span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#D32F2F]"></span>
                        {ledger.recordCount || 0}条账目
                      </span>
                    </div>
                  </div>

                  {/* 操作按钮区 - 默认折叠 */}
                  {expandedLedgerIds.has(ledger.id) && (
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
          ))
        )}
      </div>

      {/* 底部按钮 */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <div className="max-w-md mx-auto px-4 pb-4 pt-3 bg-white border-t border-gray-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <div className="flex gap-3">
            <button
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#D32F2F]-light text-[#D32F2F] hover:bg-[#FFEBEE] transition-colors shadow-sm"
              onClick={() => {
                // TODO: 加入他人账本
              }}
            >
              加入他人账本
            </button>
            <button
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#D32F2F] text-white hover:bg-[#D32F2F]-dark transition-colors shadow-sm"
              onClick={() => setShowCreateDialog(true)}
            >
              创建新的账本
            </button>
          </div>
        </div>
      </div>

      {/* 创建账本对话框 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="w-[85%] rounded-lg p-0 gap-0" showCloseButton={false}>
          <DialogTitle className="sr-only">创建账本</DialogTitle>
          <button
            onClick={() => {
              setShowCreateDialog(false);
              setLocation("/ledger/create-type");
            }}
            className="w-full text-center py-3.5 text-[#1976D2] font-medium border-b border-divider hover:bg-[#FAF3ED] transition-colors"
          >
            新建全新账本
          </button>
          <button
            onClick={() => {
              setShowCreateDialog(false);
              // TODO: 实现复制已有账本功能
            }}
            className="w-full text-center py-3.5 text-[#1976D2] font-medium border-b border-divider hover:bg-[#FAF3ED] transition-colors"
          >
            复制已有账本
          </button>
          <button
            onClick={() => setShowCreateDialog(false)}
            className="w-full text-center py-3.5 text-[#757575] font-medium hover:bg-[#FAF3ED] transition-colors"
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

      {/* 搜索对话框 */}
      <Dialog open={showSearchDialog} onOpenChange={setShowSearchDialog}>
        <DialogContent className="max-w-sm top-[15%] translate-y-0">
          <DialogTitle>搜索账本</DialogTitle>
          <div className="space-y-4 pt-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">账本名称</label>
              <Input
                placeholder="输入账本名称..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">按成员筛选</label>
              <Input
                placeholder="输入成员名称或首字母..."
                value={selectedMember}
                onChange={(e) => setSelectedMember(e.target.value)}
                autoComplete="off"
                list="no-suggestions"
              />
              <p className="text-xs text-gray-500 mt-1">支持拼音首字母搜索，如“zs”匹配“张三”</p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedMember("");
                }}
              >
                清除
              </Button>
              <Button
                className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C]"
                onClick={() => setShowSearchDialog(false)}
              >
                确定
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 排序对话框 */}
      <Dialog open={showSortDialog} onOpenChange={setShowSortDialog}>
        <DialogContent className="max-w-sm">
          <DialogTitle>排序方式</DialogTitle>
          <div className="space-y-3 pt-4">
            <button
              className={`w-full p-3 rounded-lg border-2 transition-all ${
                sortBy === "members"
                  ? "border-[#D32F2F] bg-red-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => {
                setSortBy("members");
                setShowSortDialog(false);
              }}
            >
              <div className="text-left">
                <div className="font-medium text-gray-900">成员人数</div>
                <div className="text-sm text-gray-500">按共享成员数量排序</div>
              </div>
            </button>
            <button
              className={`w-full p-3 rounded-lg border-2 transition-all ${
                sortBy === "records"
                  ? "border-[#D32F2F] bg-red-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => {
                setSortBy("records");
                setShowSortDialog(false);
              }}
            >
              <div className="text-left">
                <div className="font-medium text-gray-900">账目条数</div>
                <div className="text-sm text-gray-500">按账目数量排序</div>
              </div>
            </button>
            <button
              className={`w-full p-3 rounded-lg border-2 transition-all ${
                sortBy === "date"
                  ? "border-[#D32F2F] bg-red-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => {
                setSortBy("date");
                setShowSortDialog(false);
              }}
            >
              <div className="text-left">
                <div className="font-medium text-gray-900">开账日期</div>
                <div className="text-sm text-gray-500">按创建时间排序</div>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
