import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArrowLeft, Plus, Trash2, Settings, Users, Search, ArrowUpDown, ArrowUpRight, ArrowDownLeft, ChevronRight, Shield, Bell, X, QrCode, Camera } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { QRCodeSVG } from "qrcode.react";
import { Html5Qrcode } from "html5-qrcode";

// 可共享的字段列表
const SHAREABLE_FIELDS = [
  { name: 'name', label: '姓名', required: true },
  { name: 'title', label: '昵称', required: false },
  { name: 'gender', label: '性别', required: false },
  { name: 'occupation', label: '职业', required: false },
  { name: 'address', label: '地址', required: false },
  { name: 'region', label: '地区', required: false },
  { name: 'wechat', label: '微信', required: false },
  { name: 'phone', label: '电话', required: false },
  { name: 'tags', label: '标签', required: false },
];

// 每批加载的数量
const BATCH_SIZE = 20;

// 根据名字生成一致的头像背景色
const AVATAR_COLORS = [
  '#A80000', '#d44', '#e67e22', '#2ecc71', '#1abc9c',
  '#3498db', '#9b59b6', '#e74c3c', '#f39c12', '#16a085',
  '#2980b9', '#8e44ad', '#c0392b', '#d35400', '#27ae60',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitial(name: string): string {
  return name ? name.charAt(0).toUpperCase() : '?';
}

export default function SharingSettings() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  
  // 状态
  const [activeTab, setActiveTab] = useState<'my' | 'shared'>('my');
  const [mySearchQuery, setMySearchQuery] = useState("");
  const [sharedSearchQuery, setSharedSearchQuery] = useState("");
  const [mySortBy, setMySortBy] = useState<'default' | 'count_desc' | 'count_asc'>('default');
  const [sharedSortBy, setSharedSortBy] = useState<'default' | 'count_desc' | 'count_asc'>('default');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [showMyQrDialog, setShowMyQrDialog] = useState(false);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [qrMode, setQrMode] = useState<'receive' | 'give' | 'both' | null>(null); // null=选择模式阶段
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<any>(null);
  const [searchUsername, setSearchUsername] = useState("");
  const [connectionNote, setConnectionNote] = useState("");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  
  // 无限加载状态
  const [myVisibleCount, setMyVisibleCount] = useState(BATCH_SIZE);
  const [sharedVisibleCount, setSharedVisibleCount] = useState(BATCH_SIZE);
  const listEndRef = useRef<HTMLDivElement>(null);
  
  // 获取我的共享连接列表
  const { data: myConnections, isLoading: loadingConnections } = trpc.sharing.listMyConnections.useQuery();
  
  // 获取共享给我的连接列表
  const { data: sharedToMe, isLoading: loadingSharedToMe } = trpc.sharing.listSharedToMe.useQuery();
  
  // 获取未读共享通知详情
  const { data: unreadNotifications } = trpc.sharing.getUnreadNotifications.useQuery();
  
  // 标记共享通知为已读
  const markAsRead = trpc.sharing.markAsRead.useMutation({
    onSuccess: () => {
      utils.sharing.getUnreadNotifications.invalidate();
      utils.sharing.getUnreadCount.invalidate();
    },
  });
  
  // 搜索用户
  const { data: searchResults, isLoading: searching } = trpc.sharing.searchUsers.useQuery(
    { query: searchUsername },
    { enabled: searchUsername.length >= 2 }
  );

  // 获取我的二维码（根据选择的模式）
  const { data: myQrData } = trpc.sharing.getMyQrCode.useQuery(
    { mode: qrMode ?? 'receive' },
    { enabled: showMyQrDialog && qrMode !== null }
  );

  // 通过扫码添加连接
  const addByQrCode = trpc.sharing.addByQrCode.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || '添加成功！');
      setShowScanDialog(false);
      utils.sharing.listMyConnections.invalidate();
      stopScanner();
    },
    onError: (error) => {
      toast.error(error.message);
      stopScanner();
      setShowScanDialog(false);
    },
  });

  // 停止扫码器
  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  // 启动扫码器
  const startScanner = useCallback(async () => {
    setIsScanning(true);
    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          await stopScanner();
          addByQrCode.mutate({ qrContent: decodedText });
        },
        () => {}
      );
    } catch (err: any) {
      toast.error('无法启动摄像头：' + (err?.message || '请允许摄像头权限'));
      setIsScanning(false);
    }
  }, [stopScanner, addByQrCode]);

  // 关闭扫码对话框时停止扫码
  useEffect(() => {
    if (!showScanDialog) {
      stopScanner();
    }
  }, [showScanDialog, stopScanner]);

  // 打开扫码对话框后自动启动扫码
  useEffect(() => {
    if (showScanDialog) {
      const timer = setTimeout(() => startScanner(), 300);
      return () => clearTimeout(timer);
    }
  }, [showScanDialog]);

  // 创建连接
  const createConnection = trpc.sharing.createConnection.useMutation({
    onSuccess: (data) => {
      toast.success(`已成功连接到 ${data.receiverName}`);
      setShowAddDialog(false);
      setSearchUsername("");
      setConnectionNote("");
      utils.sharing.listMyConnections.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  
  // 删除连接
  const deleteConnection = trpc.sharing.deleteConnection.useMutation({
    onSuccess: () => {
      toast.success("已删除连接");
      utils.sharing.listMyConnections.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  
  // 更新权限
  const updatePermissions = trpc.sharing.updatePermissions.useMutation({
    onSuccess: () => {
      toast.success("权限配置已更新");
      setShowPermissionDialog(false);
      setSelectedConnection(null);
      utils.sharing.listMyConnections.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  
  // 过滤和排序我的共享连接
  const filteredAndSortedMyConnections = useMemo(() => {
    if (!myConnections) return [];
    let filtered = myConnections.filter((conn: any) => 
      conn.receiverName?.toLowerCase().includes(mySearchQuery.toLowerCase()) ||
      conn.receiverUsername?.toLowerCase().includes(mySearchQuery.toLowerCase())
    );
    if (mySortBy === 'count_desc') {
      filtered.sort((a: any, b: any) => (b.sharedContactCount || 0) - (a.sharedContactCount || 0));
    } else if (mySortBy === 'count_asc') {
      filtered.sort((a: any, b: any) => (a.sharedContactCount || 0) - (b.sharedContactCount || 0));
    }
    return filtered;
  }, [myConnections, mySearchQuery, mySortBy]);
  
  // 过滤和排序共享给我的连接
  const filteredAndSortedSharedToMe = useMemo(() => {
    if (!sharedToMe) return [];
    let filtered = sharedToMe.filter((conn: any) => 
      conn.sharerName?.toLowerCase().includes(sharedSearchQuery.toLowerCase()) ||
      conn.sharerUsername?.toLowerCase().includes(sharedSearchQuery.toLowerCase())
    );
    if (sharedSortBy === 'count_desc') {
      filtered.sort((a: any, b: any) => (b.sharedContactCount || 0) - (a.sharedContactCount || 0));
    } else if (sharedSortBy === 'count_asc') {
      filtered.sort((a: any, b: any) => (a.sharedContactCount || 0) - (b.sharedContactCount || 0));
    }
    return filtered;
  }, [sharedToMe, sharedSearchQuery, sharedSortBy]);

  // 当前可见的列表数据
  const visibleMyConnections = useMemo(() => 
    filteredAndSortedMyConnections.slice(0, myVisibleCount),
    [filteredAndSortedMyConnections, myVisibleCount]
  );
  
  const visibleSharedToMe = useMemo(() => 
    filteredAndSortedSharedToMe.slice(0, sharedVisibleCount),
    [filteredAndSortedSharedToMe, sharedVisibleCount]
  );

  // 是否还有更多数据
  const hasMoreMy = myVisibleCount < filteredAndSortedMyConnections.length;
  const hasMoreShared = sharedVisibleCount < filteredAndSortedSharedToMe.length;

  // 无限滚动：监听滚动到底部
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          if (activeTab === 'my' && hasMoreMy) {
            setMyVisibleCount(prev => prev + BATCH_SIZE);
          } else if (activeTab === 'shared' && hasMoreShared) {
            setSharedVisibleCount(prev => prev + BATCH_SIZE);
          }
        }
      },
      { threshold: 0.1 }
    );
    
    if (listEndRef.current) {
      observer.observe(listEndRef.current);
    }
    
    return () => observer.disconnect();
  }, [activeTab, hasMoreMy, hasMoreShared]);

  // 搜索变化时重置可见数量
  useEffect(() => {
    setMyVisibleCount(BATCH_SIZE);
  }, [mySearchQuery]);
  
  useEffect(() => {
    setSharedVisibleCount(BATCH_SIZE);
  }, [sharedSearchQuery]);
  
  // 页面加载时自动标记共享通知为已读
  useEffect(() => {
    markAsRead.mutate();
  }, []);
  
  // 打开权限配置对话框
  const openPermissionDialog = useCallback((connection: any) => {
    setSelectedConnection(connection);
    const initialPermissions: Record<string, boolean> = {};
    SHAREABLE_FIELDS.forEach(field => {
      const perm = connection.permissions?.find((p: any) => p.fieldName === field.name);
      initialPermissions[field.name] = perm ? perm.isShared : true;
    });
    setPermissions(initialPermissions);
    setShowPermissionDialog(true);
  }, []);
  
  // 保存权限配置
  const handleSavePermissions = useCallback(() => {
    if (!selectedConnection) return;
    const permissionsArray = Object.entries(permissions).map(([fieldName, isShared]) => ({
      fieldName,
      isShared,
    }));
    updatePermissions.mutate({
      connectionId: selectedConnection.id,
      permissions: permissionsArray,
    });
  }, [selectedConnection, permissions, updatePermissions]);
  
  // 处理添加连接
  const handleAddConnection = useCallback((username: string) => {
    createConnection.mutate({
      receiverUsername: username,
      note: connectionNote || undefined,
    });
  }, [createConnection, connectionNote]);
  
  // 处理删除连接
  const handleDeleteConnection = useCallback((connectionId: number) => {
    if (confirm("确定要删除这个连接吗？删除后对方将无法查看您的人脉数据。")) {
      deleteConnection.mutate({ connectionId });
    }
  }, [deleteConnection]);

  // 统计数字
  const myCount = myConnections?.length || 0;
  const sharedCount = sharedToMe?.length || 0;

  // 当前排序状态文字
  const currentSortLabel = (sortBy: string) => {
    if (sortBy === 'count_desc') return '人数多→少';
    if (sortBy === 'count_asc') return '人数少→多';
    return '默认';
  };
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setLocation("/")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-lg font-bold">共享设置</h1>
          </div>
          {activeTab === 'my' && (
            <div className="flex items-center gap-2">
              {/* 我的二维码 */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-[#D32F2F]"
                onClick={() => setShowMyQrDialog(true)}
                title="我的二维码"
              >
                <QrCode className="h-5 w-5" />
              </Button>
              {/* 扫一扫 */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-[#D32F2F]"
                onClick={() => setShowScanDialog(true)}
                title="扫一扫"
              >
                {/* 扫一扫标识 SVG */}
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                  <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                  <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                  <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                </svg>
              </Button>
              {/* 手动添加 */}
              <Button
                size="sm"
                onClick={() => setShowAddDialog(true)}
                className="h-8 px-3 bg-[#D32F2F] hover:bg-[#B71C1C] text-white"
              >
                <Plus className="h-4 w-4 mr-1" />
                添加
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Tab 按钮 - 带人数统计 */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-1">
          <button
            onClick={() => setActiveTab('my')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'my'
                ? 'bg-white dark:bg-gray-700 text-[#D32F2F] shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <ArrowUpRight className="h-4 w-4" />
            <span>我共享的人</span>
            {myCount > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold ${
                activeTab === 'my'
                  ? 'bg-[#D32F2F] text-white'
                  : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
              }`}>
                {myCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('shared')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'shared'
                ? 'bg-white dark:bg-gray-700 text-[#D32F2F] shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <ArrowDownLeft className="h-4 w-4" />
            <span>共享给我</span>
            {sharedCount > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold ${
                activeTab === 'shared'
                  ? 'bg-[#D32F2F] text-white'
                  : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
              }`}>
                {sharedCount}
              </span>
            )}
          </button>
        </div>

        {/* 未读共享通知提示 */}
        {unreadNotifications && unreadNotifications.length > 0 && (
          <div className="space-y-1.5">
            {unreadNotifications.map((n: any) => (
              <div
                key={n.id}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm ${
                  n.type === 'added'
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                }`}
              >
                <Bell className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="flex-1">
                  {n.type === 'added'
                    ? `🎉 ${n.actorName} 共享了人脉给你`
                    : `👋 ${n.actorName} 取消了与你的共享`
                  }
                </span>
              </div>
            ))}
            <button
              onClick={() => markAsRead.mutate()}
              className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-1"
            >
              清除所有通知
            </button>
          </div>
        )}

        {/* 搜索和排序栏 */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={activeTab === 'my' ? "搜索共享对象..." : "搜索共享来源..."}
              value={activeTab === 'my' ? mySearchQuery : sharedSearchQuery}
              onChange={(e) => activeTab === 'my' ? setMySearchQuery(e.target.value) : setSharedSearchQuery(e.target.value)}
              className="pl-10 h-9 text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-lg"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 px-2.5 text-xs border-gray-200 dark:border-gray-700">
                <ArrowUpDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => activeTab === 'my' ? setMySortBy('default') : setSharedSortBy('default')}>
                <span className={(activeTab === 'my' ? mySortBy : sharedSortBy) === 'default' ? 'font-bold' : ''}>默认排序</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => activeTab === 'my' ? setMySortBy('count_desc') : setSharedSortBy('count_desc')}>
                <span className={(activeTab === 'my' ? mySortBy : sharedSortBy) === 'count_desc' ? 'font-bold' : ''}>共享人数 多→少</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => activeTab === 'my' ? setMySortBy('count_asc') : setSharedSortBy('count_asc')}>
                <span className={(activeTab === 'my' ? mySortBy : sharedSortBy) === 'count_asc' ? 'font-bold' : ''}>共享人数 少→多</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 列表区域 */}
        <div className="space-y-2">
          {activeTab === 'my' ? (
            // ========== 我的共享连接列表 ==========
            loadingConnections ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-[#D32F2F] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-400 mt-3">加载中...</p>
              </div>
            ) : !myConnections || myConnections.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                  <ArrowUpRight className="h-8 w-8 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-500">暂无共享连接</p>
                <p className="text-xs text-gray-400 mt-1">点击右上角"添加"开始共享您的人脉</p>
              </div>
            ) : filteredAndSortedMyConnections.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Search className="h-10 w-10 text-gray-300 mb-3" />
                <p className="text-sm text-gray-500">未找到匹配的连接</p>
              </div>
            ) : (
              <>
                {visibleMyConnections.map((conn: any) => (
                  <div
                    key={conn.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:shadow-sm transition-all"
                  >
                    {/* 头像 */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 overflow-hidden"
                      style={{ backgroundColor: getAvatarColor(conn.receiverName || conn.receiverUsername) }}
                    >
                      {conn.receiverAvatar ? (
                        <img
                          src={conn.receiverAvatar}
                          alt={conn.receiverName}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).parentElement!.textContent = getInitial(conn.receiverName || conn.receiverUsername);
                          }}
                        />
                      ) : (
                        getInitial(conn.receiverName || conn.receiverUsername)
                      )}
                    </div>
                    
                    {/* 信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm truncate text-gray-900 dark:text-gray-100">
                          {conn.receiverName}
                        </p>
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[#F5F5F5] dark:bg-[#424242]/30 text-[#1976D2] dark:text-blue-400 text-[10px] font-medium flex-shrink-0">
                          <Users className="h-2.5 w-2.5" />
                          {conn.sharedContactCount || 0}人
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        @{conn.receiverUsername}
                        {conn.note && <span className="ml-2 text-gray-300">· {conn.note}</span>}
                      </p>
                    </div>
                    
                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-400 hover:text-[#D32F2F] hover:bg-gray-100"
                        onClick={() => openPermissionDialog(conn)}
                        title="权限设置"
                      >
                        <Shield className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-300 hover:text-[#D32F2F] hover:bg-[#FFEBEE]"
                        onClick={() => handleDeleteConnection(conn.id)}
                        title="删除连接"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                {/* 无限加载触发器 */}
                {hasMoreMy && (
                  <div ref={listEndRef} className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                
                {!hasMoreMy && filteredAndSortedMyConnections.length > BATCH_SIZE && (
                  <p className="text-center text-xs text-gray-400 py-3">已显示全部 {filteredAndSortedMyConnections.length} 个连接</p>
                )}
              </>
            )
          ) : (
            // ========== 共享给我的连接列表 ==========
            loadingSharedToMe ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-[#D32F2F] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-400 mt-3">加载中...</p>
              </div>
            ) : !sharedToMe || sharedToMe.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                  <ArrowDownLeft className="h-8 w-8 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-500">暂无共享给您的数据</p>
                <p className="text-xs text-gray-400 mt-1">当其他用户共享给您时，会显示在这里</p>
              </div>
            ) : filteredAndSortedSharedToMe.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Search className="h-10 w-10 text-gray-300 mb-3" />
                <p className="text-sm text-gray-500">未找到匹配的连接</p>
              </div>
            ) : (
              <>
                {visibleSharedToMe.map((conn: any) => (
                  <div
                    key={conn.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:shadow-sm transition-all cursor-pointer active:scale-[0.99]"
                  >
                    {/* 头像 */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 overflow-hidden"
                      style={{ backgroundColor: getAvatarColor(conn.sharerName || conn.sharerUsername) }}
                    >
                      {conn.sharerAvatar ? (
                        <img
                          src={conn.sharerAvatar}
                          alt={conn.sharerName}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).parentElement!.textContent = getInitial(conn.sharerName || conn.sharerUsername);
                          }}
                        />
                      ) : (
                        getInitial(conn.sharerName || conn.sharerUsername)
                      )}
                    </div>
                    
                    {/* 信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm truncate text-gray-900 dark:text-gray-100">
                          {conn.sharerName}
                        </p>
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[#E8F5E9] dark:bg-green-900/30 text-[#4CAF50] dark:text-green-400 text-[10px] font-medium flex-shrink-0">
                          <Users className="h-2.5 w-2.5" />
                          {conn.sharedContactCount || 0}人
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        @{conn.sharerUsername}
                      </p>
                    </div>
                    
                    <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                  </div>
                ))}
                
                {/* 无限加载触发器 */}
                {hasMoreShared && (
                  <div ref={listEndRef} className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                
                {!hasMoreShared && filteredAndSortedSharedToMe.length > BATCH_SIZE && (
                  <p className="text-center text-xs text-gray-400 py-3">已显示全部 {filteredAndSortedSharedToMe.length} 个连接</p>
                )}
              </>
            )
          )}
        </div>
      </div>

      {/* 添加连接对话框 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md !top-[30%]">
          <DialogHeader>
            <DialogTitle>添加共享连接</DialogTitle>
            <DialogDescription>
              搜索用户名，将您的人脉数据共享给对方
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>搜索用户</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="输入用户名搜索..."
                  value={searchUsername}
                  onChange={(e) => setSearchUsername(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            
            {/* 搜索结果 */}
            {searchUsername.length >= 2 && (
              <div className="space-y-2">
                {searching ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    搜索中...
                  </p>
                ) : !searchResults || searchResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    未找到匹配的用户
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {searchResults.map((user: any) => (
                      <div
                        key={user.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                        onClick={() => handleAddConnection(user.username)}
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                          style={{ backgroundColor: getAvatarColor(user.name || user.username) }}
                        >
                          {getInitial(user.name || user.username)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{user.name || user.username}</p>
                          <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
                        </div>
                        <Plus className="h-4 w-4 text-[#D32F2F]" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            <div className="space-y-2">
              <Label>备注（可选）</Label>
              <Input
                placeholder="添加备注..."
                value={connectionNote}
                onChange={(e) => setConnectionNote(e.target.value)}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 权限配置对话框 */}
      <Dialog open={showPermissionDialog} onOpenChange={setShowPermissionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#D32F2F]" />
              权限配置
            </DialogTitle>
            <DialogDescription>
              设置 <span className="font-medium text-gray-700">{selectedConnection?.receiverName}</span> 可以查看的字段
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              默认全部共享，取消勾选的字段将不会展示给对方。
            </p>
            
            <div className="space-y-3">
              {SHAREABLE_FIELDS.map((field) => (
                <div key={field.name} className="flex items-center justify-between py-1">
                  <Label className="flex items-center gap-2 text-sm">
                    {field.label}
                    {field.required && (
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">必选</span>
                    )}
                  </Label>
                  <Checkbox
                    checked={permissions[field.name] ?? true}
                    disabled={field.required}
                    onCheckedChange={(checked) => {
                      setPermissions(prev => ({
                        ...prev,
                        [field.name]: checked as boolean,
                      }));
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPermissionDialog(false)}>
              取消
            </Button>
            <Button 
              onClick={handleSavePermissions} 
              disabled={updatePermissions.isPending}
              className="bg-[#D32F2F] hover:bg-[#D32F2F]-dark text-white"
            >
              {updatePermissions.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 我的二维码对话框 */}
      <Dialog open={showMyQrDialog} onOpenChange={(open) => { setShowMyQrDialog(open); if (!open) setQrMode(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-[#D32F2F]" />
              我的二维码
            </DialogTitle>
            <DialogDescription>
              {qrMode === null ? '请选择共享方式' : qrMode === 'receive' ? '对方扫码后，对方的联系人将共享给你' : qrMode === 'give' ? '对方扫码后，你的联系人将共享给对方' : '对方扫码后，双方互相共享联系人'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            {qrMode === null ? (
              // 模式选择界面
              <div className="w-full flex flex-col gap-3">
                <button
                  onClick={() => setQrMode('receive')}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-gray-100 hover:border-[#D32F2F] hover:bg-red-50 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-600 text-lg">↙</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">对方共享给我</p>
                    <p className="text-xs text-gray-500">对方扫码后，对方的联系人共享给你</p>
                  </div>
                </button>
                <button
                  onClick={() => setQrMode('give')}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-gray-100 hover:border-[#D32F2F] hover:bg-red-50 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-green-600 text-lg">↗</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">我共享给对方</p>
                    <p className="text-xs text-gray-500">对方扫码后，你的联系人共享给对方</p>
                  </div>
                </button>
                <button
                  onClick={() => setQrMode('both')}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-gray-100 hover:border-[#D32F2F] hover:bg-red-50 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-purple-600 text-lg">⇄</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">双向共享</p>
                    <p className="text-xs text-gray-500">对方扫码后，双方互相共享联系人</p>
                  </div>
                </button>
              </div>
            ) : myQrData ? (
              // 显示二维码
              <>
                <button onClick={() => setQrMode(null)} className="self-start text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                  ← 重新选择
                </button>
                <div className="w-full flex items-center justify-center gap-2 py-1">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    qrMode === 'receive' ? 'bg-blue-100 text-blue-700' :
                    qrMode === 'give' ? 'bg-green-100 text-green-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    {qrMode === 'receive' ? '↙ 对方共享给我' : qrMode === 'give' ? '↗ 我共享给对方' : '⇄ 双向共享'}
                  </span>
                </div>
                <div className="p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                  <QRCodeSVG
                    value={myQrData.qrContent}
                    size={200}
                    bgColor="#ffffff"
                    fgColor="#222222"
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <div className="text-center">
                  <p className="font-bold text-gray-800">{myQrData.name}</p>
                  <p className="text-sm text-gray-500">@{myQrData.username}</p>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-[200px]">
                <p className="text-sm text-gray-400">加载中...</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowMyQrDialog(false); setQrMode(null); }} className="w-full">
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 扫一扫对话框 */}
      <Dialog open={showScanDialog} onOpenChange={(open) => {
        if (!open) stopScanner();
        setShowScanDialog(open);
      }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-[#D32F2F]" />
              扫一扫添加
            </DialogTitle>
            <DialogDescription>
              扫描对方的共享二维码，自动添加共享连接
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            <div
              id="qr-reader"
              className="w-full rounded-xl overflow-hidden bg-black"
              style={{ minHeight: '260px' }}
            />
            {!isScanning && (
              <Button
                onClick={startScanner}
                className="bg-[#D32F2F] hover:bg-[#B71C1C] text-white w-full"
              >
                <Camera className="h-4 w-4 mr-2" />
                启动摄像头
              </Button>
            )}
            {addByQrCode.isPending && (
              <p className="text-sm text-gray-500">正在添加...</p>
            )}
            <p className="text-xs text-gray-400 text-center">将对方的二维码对准扫描框</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScanDialog(false)} className="w-full">
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
