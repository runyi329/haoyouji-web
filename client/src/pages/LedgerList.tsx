import { useState } from "react";
import { useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Users, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function LedgerList() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("active");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newLedgerName, setNewLedgerName] = useState("");
  
  // 获取账本列表
  const { data: ledgers, isLoading, refetch } = trpc.ledger.getMyLedgers.useQuery();
  
  // 创建账本
  const createLedgerMutation = trpc.ledger.createLedger.useMutation({
    onSuccess: () => {
      toast.success("账本创建成功");
      setIsCreateDialogOpen(false);
      setNewLedgerName("");
      refetch();
    },
    onError: (error) => {
      toast.error("创建失败：" + error.message);
    },
  });
  
  const handleCreateLedger = () => {
    if (!newLedgerName.trim()) {
      toast.error("请输入账本名称");
      return;
    }
    createLedgerMutation.mutate({ name: newLedgerName.trim() });
  };
  
  const handleLedgerClick = (ledgerId: number) => {
    setLocation(`/ledger/${ledgerId}`);
  };
  
  // 筛选账本
  const activeLedgers = ledgers?.filter(l => !l.isArchived) || [];
  const archivedLedgers = ledgers?.filter(l => l.isArchived) || [];
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50">
      {/* 顶部导航 */}
      <div className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-10">
        <div className="container max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button
                variant="ghost"
                size="icon"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold">账本</h1>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                创建账本
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>创建新账本</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="ledger-name">账本名称</Label>
                  <Input
                    id="ledger-name"
                    placeholder="例如：家庭账本、旅游账本"
                    value={newLedgerName}
                    onChange={(e) => setNewLedgerName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleCreateLedger();
                      }
                    }}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleCreateLedger}
                  disabled={createLedgerMutation.isPending}
                >
                  {createLedgerMutation.isPending ? "创建中..." : "创建"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      
      {/* 主内容 */}
      <div className="container max-w-2xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="active">活跃账本</TabsTrigger>
            <TabsTrigger value="archived">归档账本</TabsTrigger>
          </TabsList>
          
          <TabsContent value="active" className="space-y-4">
            {isLoading ? (
              <div className="text-center py-12 text-gray-500">加载中...</div>
            ) : activeLedgers.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-4">
                  <Users className="h-16 w-16 mx-auto mb-2" />
                  <p>还没有账本</p>
                </div>
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  创建第一个账本
                </Button>
              </div>
            ) : (
              activeLedgers.map((ledger) => (
                <Card
                  key={ledger.id}
                  className="p-4 hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => handleLedgerClick(ledger.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{ledger.name}</h3>
                      <p className="text-sm text-gray-500">
                        创建于 {new Date(ledger.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {ledger.isVip && (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                        VIP
                      </span>
                    )}
                  </div>
                </Card>
              ))
            )}
          </TabsContent>
          
          <TabsContent value="archived" className="space-y-4">
            {archivedLedgers.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                没有归档的账本
              </div>
            ) : (
              archivedLedgers.map((ledger) => (
                <Card
                  key={ledger.id}
                  className="p-4 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                  onClick={() => handleLedgerClick(ledger.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{ledger.name}</h3>
                      <p className="text-sm text-gray-500">
                        创建于 {new Date(ledger.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
