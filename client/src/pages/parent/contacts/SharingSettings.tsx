import React, { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Settings, Users, Share2, Search, Check, X, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// 可共享的字段列表
const SHAREABLE_FIELDS = [
  { name: 'name', label: '姓名', required: true },
  { name: 'title', label: '称谓', required: false },
  { name: 'gender', label: '性别', required: false },
  { name: 'occupation', label: '职业', required: false },
  { name: 'address', label: '地址', required: false },
  { name: 'region', label: '地区', required: false },
  { name: 'wechat', label: '微信', required: false },
  { name: 'phone', label: '电话', required: false },
  { name: 'tags', label: '标签', required: false },
];

export default function SharingSettings() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  
  // 状态
  const [activeTab, setActiveTab] = useState<'my' | 'shared'>('my'); // 当前激活的tab
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<any>(null);
  const [searchUsername, setSearchUsername] = useState("");
  const [connectionNote, setConnectionNote] = useState("");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  
  // 获取我的共享连接列表
  const { data: myConnections, isLoading: loadingConnections } = trpc.sharing.listMyConnections.useQuery();
  
  // 获取共享给我的连接列表
  const { data: sharedToMe, isLoading: loadingSharedToMe } = trpc.sharing.listSharedToMe.useQuery();
  
  // 搜索用户
  const { data: searchResults, isLoading: searching } = trpc.sharing.searchUsers.useQuery(
    { query: searchUsername },
    { enabled: searchUsername.length >= 2 }
  );
  
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
  
  // 打开权限配置对话框
  const openPermissionDialog = (connection: any) => {
    setSelectedConnection(connection);
    // 初始化权限状态
    const initialPermissions: Record<string, boolean> = {};
    SHAREABLE_FIELDS.forEach(field => {
      const perm = connection.permissions?.find((p: any) => p.fieldName === field.name);
      initialPermissions[field.name] = perm ? perm.isShared : true;
    });
    setPermissions(initialPermissions);
    setShowPermissionDialog(true);
  };
  
  // 保存权限配置
  const handleSavePermissions = () => {
    if (!selectedConnection) return;
    
    const permissionsArray = Object.entries(permissions).map(([fieldName, isShared]) => ({
      fieldName,
      isShared,
    }));
    
    updatePermissions.mutate({
      connectionId: selectedConnection.id,
      permissions: permissionsArray,
    });
  };
  
  // 处理添加连接
  const handleAddConnection = (username: string) => {
    createConnection.mutate({
      receiverUsername: username,
      note: connectionNote || undefined,
    });
  };
  
  // 处理删除连接
  const handleDeleteConnection = (connectionId: number) => {
    if (confirm("确定要删除这个连接吗？删除后对方将无法查看您的人脉数据。")) {
      deleteConnection.mutate({ connectionId });
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/parent/contacts")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">共享设置</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* 标语卡片 */}
        <Card className="bg-gradient-to-r from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 border-purple-200 dark:border-purple-800">
          <CardContent className="py-4">
            <div className="flex items-center justify-center gap-3">
              <Share2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <p className="text-base font-medium text-purple-800 dark:text-purple-200 text-center">
                每个人都是一座金矿，关键在于如何挖掘和连接。
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tab按钮 */}
        <div className="flex gap-3">
          <Button 
            onClick={() => setActiveTab('my')}
            variant={activeTab === 'my' ? 'default' : 'outline'}
            className="flex-1 h-10"
          >
            <Users className="h-4 w-4 mr-2" />
            我的共享连接
          </Button>
          <Button 
            onClick={() => setActiveTab('shared')}
            variant={activeTab === 'shared' ? 'default' : 'outline'}
            className="flex-1 h-10"
          >
            <Share2 className="h-4 w-4 mr-2" />
            共享给我的
          </Button>
        </div>

        {/* 添加连接按钮（只在“我的共享连接”tab显示） */}
        {activeTab === 'my' && (
          <Button onClick={() => setShowAddDialog(true)} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            添加连接
          </Button>
        )}

        {/* 名单列表 */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            {activeTab === 'my' ? (
              // 我的共享连接列表
              loadingConnections ? (
                <div className="text-center py-8 text-muted-foreground">
                  加载中...
                </div>
              ) : !myConnections || myConnections.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">暂无共享连接</p>
                  <p className="text-xs mt-1">点击“添加连接”开始共享您的人脉</p>
                </div>
              ) : (
                myConnections.map((conn: any) => (
                  <div
                    key={conn.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {conn.receiverName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        @{conn.receiverUsername}
                      </p>
                      {conn.note && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          备注: {conn.note}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openPermissionDialog(conn)}
                        className="h-8 px-2"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteConnection(conn.id)}
                        className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )
            ) : (
              // 共享给我的连接列表
              loadingSharedToMe ? (
                <div className="text-center py-8 text-muted-foreground">
                  加载中...
                </div>
              ) : !sharedToMe || sharedToMe.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Share2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">暂无共享给您的数据</p>
                  <p className="text-xs mt-1">当其他用户共享给您时，会显示在这里</p>
                </div>
              ) : (
                sharedToMe.map((conn: any) => (
                  <div
                    key={conn.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {conn.sharerName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        @{conn.sharerUsername}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))
              )
            )}
          </CardContent>
        </Card>
      </div>

      {/* 添加连接对话框 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
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
                        className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                        onClick={() => handleAddConnection(user.username)}
                      >
                        <div>
                          <p className="font-medium text-sm">{user.name || user.username}</p>
                          <p className="text-xs text-muted-foreground">@{user.username}</p>
                        </div>
                        <Button size="sm" variant="ghost">
                          <Plus className="h-4 w-4" />
                        </Button>
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
            <DialogTitle>权限配置</DialogTitle>
            <DialogDescription>
              设置 {selectedConnection?.receiverName} 可以查看的字段
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              默认全部共享，取消勾选的字段将不会展示给对方。
            </p>
            
            <div className="space-y-3">
              {SHAREABLE_FIELDS.map((field) => (
                <div key={field.name} className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    {field.label}
                    {field.required && (
                      <span className="text-xs text-muted-foreground">(必选)</span>
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
            <Button onClick={handleSavePermissions} disabled={updatePermissions.isPending}>
              {updatePermissions.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
