import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { toast } from "sonner";

export default function LedgerDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = parseInt(params.id || "0");
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split("T")[0]);
  
  // 获取账本详情
  const { data: detail, refetch: refetchDetail } = trpc.ledger.getLedgerDetail.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0 }
  );
  
  // 获取账单列表
  const { data: transactions, refetch: refetchTransactions } = trpc.ledger.getTransactions.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0 }
  );
  
  // 添加账单
  const addTransactionMutation = trpc.ledger.addTransaction.useMutation({
    onSuccess: () => {
      toast.success("账单添加成功");
      setIsAddDialogOpen(false);
      resetForm();
      refetchDetail();
      refetchTransactions();
    },
    onError: (error) => {
      toast.error("添加失败：" + error.message);
    },
  });
  
  const resetForm = () => {
    setTransactionType("expense");
    setAmount("");
    setCategory("");
    setDescription("");
    setTransactionDate(new Date().toISOString().split("T")[0]);
  };
  
  const handleAddTransaction = () => {
    if (!amount || !category) {
      toast.error("请填写金额和分类");
      return;
    }
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("请输入有效的金额");
      return;
    }
    
    addTransactionMutation.mutate({
      ledgerId,
      type: transactionType,
      amount: amountNum.toFixed(2),
      category,
      description: description || undefined,
      transactionDate: new Date(transactionDate),
    });
  };
  
  // 常用分类
  const expenseCategories = ["餐饮", "交通", "购物", "娱乐", "医疗", "教育", "住房", "其他"];
  const incomeCategories = ["工资", "奖金", "投资", "兼职", "礼金", "其他"];
  
  const categories = transactionType === "expense" ? expenseCategories : incomeCategories;
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50">
      {/* 顶部导航 */}
      <div className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-10">
        <div className="container max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/ledger">
              <Button
                variant="ghost"
                size="icon"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold">账本详情</h1>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                记一笔
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>添加账单</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>类型</Label>
                  <Select value={transactionType} onValueChange={(v) => setTransactionType(v as "income" | "expense")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense">支出</SelectItem>
                      <SelectItem value="income">收入</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="amount">金额</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>分类</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择分类" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="date">日期</Label>
                  <Input
                    id="date"
                    type="date"
                    value={transactionDate}
                    onChange={(e) => setTransactionDate(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">备注（可选）</Label>
                  <Textarea
                    id="description"
                    placeholder="添加备注..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
                
                <Button
                  className="w-full"
                  onClick={handleAddTransaction}
                  disabled={addTransactionMutation.isPending}
                >
                  {addTransactionMutation.isPending ? "添加中..." : "添加"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      
      {/* 统计卡片 */}
      <div className="container max-w-2xl mx-auto px-4 py-6">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-green-600 mb-2">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm">收入</span>
            </div>
            <p className="text-2xl font-bold">
              ¥{detail?.stats.totalIncome.toFixed(2) || "0.00"}
            </p>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center gap-2 text-red-600 mb-2">
              <TrendingDown className="h-4 w-4" />
              <span className="text-sm">支出</span>
            </div>
            <p className="text-2xl font-bold">
              ¥{detail?.stats.totalExpense.toFixed(2) || "0.00"}
            </p>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center gap-2 text-blue-600 mb-2">
              <Wallet className="h-4 w-4" />
              <span className="text-sm">结余</span>
            </div>
            <p className="text-2xl font-bold">
              ¥{detail?.stats.balance.toFixed(2) || "0.00"}
            </p>
          </Card>
        </div>
        
        {/* 账单列表 */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">账单记录</h2>
          
          {!transactions || transactions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              还没有账单记录
            </div>
          ) : (
            transactions.map((transaction) => (
              <Card key={transaction.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{transaction.category}</span>
                      {transaction.subcategory && (
                        <span className="text-sm text-gray-500">· {transaction.subcategory}</span>
                      )}
                    </div>
                    {transaction.description && (
                      <p className="text-sm text-gray-600 mb-1">{transaction.description}</p>
                    )}
                    <p className="text-xs text-gray-400">
                      {new Date(transaction.transactionDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-xl font-bold ${
                        transaction.type === "income" ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {transaction.type === "income" ? "+" : "-"}¥{transaction.amount}
                    </p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
