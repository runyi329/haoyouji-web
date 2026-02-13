import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2, Plus, Edit, Trash2, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export default function EquityManagement() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingInvestment, setEditingInvestment] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    userId: "",
    amount: "",
    notes: "",
  });

  const { data: investments, isLoading, refetch } = trpc.equity.getAllInvestments.useQuery();
  const { data: shareholders } = trpc.equity.getAllShareholders.useQuery();
  const { data: rules } = trpc.equity.getRules.useQuery();

  const addInvestmentMutation = trpc.equity.addInvestment.useMutation({
    onSuccess: () => {
      toast({ title: "添加成功" });
      setIsAddDialogOpen(false);
      setFormData({ userId: "", amount: "", notes: "" });
      refetch();
    },
    onError: (error) => {
      toast({ title: "添加失败", description: error.message, variant: "destructive" });
    },
  });

  const updateInvestmentMutation = trpc.equity.updateInvestment.useMutation({
    onSuccess: () => {
      toast({ title: "更新成功" });
      setIsEditDialogOpen(false);
      setEditingInvestment(null);
      refetch();
    },
    onError: (error) => {
      toast({ title: "更新失败", description: error.message, variant: "destructive" });
    },
  });

  const deleteInvestmentMutation = trpc.equity.deleteInvestment.useMutation({
    onSuccess: () => {
      toast({ title: "删除成功" });
      refetch();
    },
    onError: (error) => {
      toast({ title: "删除失败", description: error.message, variant: "destructive" });
    },
  });

  const handleAdd = () => {
    if (!formData.userId || !formData.amount) {
      toast({ title: "请填写必填项", variant: "destructive" });
      return;
    }
    addInvestmentMutation.mutate({
      userId: parseInt(formData.userId),
      amount: parseFloat(formData.amount),
      notes: formData.notes,
    });
  };

  const handleEdit = () => {
    if (!editingInvestment || !formData.amount) {
      toast({ title: "请填写必填项", variant: "destructive" });
      return;
    }
    updateInvestmentMutation.mutate({
      id: editingInvestment.id,
      amount: parseFloat(formData.amount),
      notes: formData.notes,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("确定要删除这条投资记录吗？")) {
      deleteInvestmentMutation.mutate({ id });
    }
  };

  const openEditDialog = (investment: any) => {
    setEditingInvestment(investment);
    setFormData({
      userId: investment.userId.toString(),
      amount: investment.investmentAmount,
      notes: investment.notes || "",
    });
    setIsEditDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#A80000]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center">
          <Link href="/admin">
            <button className="text-gray-600 hover:text-gray-900">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </Link>
          <h1 className="flex-1 text-center text-lg font-bold text-gray-900">股权激励管理</h1>
          <div className="w-6"></div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* 股份池配置 */}
        <Card className="p-6 rounded-2xl shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4">股份池配置</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-red-50 rounded-xl">
              <p className="text-sm text-gray-600 mb-1">投资股份池</p>
              <p className="text-2xl font-bold text-[#A80000]">
                {rules?.investment_pool_percentage?.toFixed(2) || "33.33"}%
              </p>
            </div>
            <div className="p-4 bg-blue-50 rounded-xl">
              <p className="text-sm text-gray-600 mb-1">贡献股份池</p>
              <p className="text-2xl font-bold text-blue-600">
                {rules?.contribution_pool_percentage?.toFixed(2) || "66.67"}%
              </p>
            </div>
          </div>
        </Card>

        {/* 贡献规则 */}
        <Card className="p-6 rounded-2xl shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4">贡献股份规则</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-700">邀请新用户</span>
              <span className="font-bold text-[#A80000]">
                {rules?.invite_per_user_percentage?.toFixed(2) || "0.05"}% / 人
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-700">被邀请人每100人脉</span>
              <span className="font-bold text-[#A80000]">
                {rules?.referral_network_per_100_percentage?.toFixed(2) || "0.02"}%
              </span>
            </div>
          </div>
        </Card>

        {/* 股东股权总览 */}
        {shareholders && shareholders.length > 0 && (
          <Card className="p-6 rounded-2xl shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4">股东股权总览</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">股东</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">总股份</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">投资股份</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">邀请贡献</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">人脉贡献</th>
                  </tr>
                </thead>
                <tbody>
                  {shareholders.map((shareholder: any) => (
                    <tr key={shareholder.userId} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-2 text-sm">{shareholder.userName}</td>
                      <td className="py-3 px-2 text-sm text-right font-bold text-[#A80000]">
                        {shareholder.totalEquity.toFixed(4)}%
                      </td>
                      <td className="py-3 px-2 text-sm text-right">
                        {shareholder.investmentEquity.toFixed(4)}%
                      </td>
                      <td className="py-3 px-2 text-sm text-right">
                        {shareholder.inviteEquity.toFixed(4)}%
                      </td>
                      <td className="py-3 px-2 text-sm text-right">
                        {shareholder.referralNetworkEquity.toFixed(4)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* 投资记录管理 */}
        <Card className="p-6 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">投资记录管理</h2>
            <Button
              onClick={() => setIsAddDialogOpen(true)}
              className="bg-[#A80000] hover:bg-[#8a0000]"
            >
              <Plus className="w-4 h-4 mr-2" />
              添加投资
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">股东</th>
                  <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">投资金额</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">投资日期</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">备注</th>
                  <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {investments && investments.length > 0 ? (
                  investments.map((investment: any) => (
                    <tr key={investment.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-2 text-sm">{investment.userName || investment.username}</td>
                      <td className="py-3 px-2 text-sm text-right font-semibold">
                        ¥{Number(investment.investmentAmount).toLocaleString('zh-CN')}
                      </td>
                      <td className="py-3 px-2 text-sm">
                        {new Date(investment.investmentDate).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="py-3 px-2 text-sm text-gray-600">{investment.notes || '-'}</td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => openEditDialog(investment)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(investment.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
                      暂无投资记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* 添加投资对话框 */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加投资记录</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="userId">用户ID *</Label>
              <Input
                id="userId"
                type="number"
                value={formData.userId}
                onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                placeholder="请输入用户ID"
              />
            </div>
            <div>
              <Label htmlFor="amount">投资金额（元）*</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="请输入投资金额"
              />
            </div>
            <div>
              <Label htmlFor="notes">备注</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="可选"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleAdd}
              className="bg-[#A80000] hover:bg-[#8a0000]"
              disabled={addInvestmentMutation.isPending}
            >
              {addInvestmentMutation.isPending ? "添加中..." : "确定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑投资对话框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑投资记录</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>股东</Label>
              <Input value={editingInvestment?.userName || editingInvestment?.username || ""} disabled />
            </div>
            <div>
              <Label htmlFor="edit-amount">投资金额（元）*</Label>
              <Input
                id="edit-amount"
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-notes">备注</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleEdit}
              className="bg-[#A80000] hover:bg-[#8a0000]"
              disabled={updateInvestmentMutation.isPending}
            >
              {updateInvestmentMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
