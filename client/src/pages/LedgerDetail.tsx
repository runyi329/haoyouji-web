import { useState } from 'react';
import { useRoute, Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { ArrowLeft, Plus, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export default function LedgerDetail() {
  const [, params] = useRoute('/ledger/:id');
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');

  const { data: ledger } = trpc.ledger.detail.useQuery({ ledgerId });
  const { data: stats } = trpc.ledger.stats.useQuery({ ledgerId });
  const { data: transactions, refetch } = trpc.ledger.transactions.useQuery({ ledgerId });

  const addMutation = trpc.ledger.addTransaction.useMutation({
    onSuccess: () => {
      toast.success('账单添加成功');
      setShowAddDialog(false);
      setAmount('');
      setCategory('');
      setDescription('');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || '添加失败');
    },
  });

  const handleAdd = () => {
    if (!amount || !category) {
      toast.error('请填写完整信息');
      return;
    }
    addMutation.mutate({
      ledgerId,
      type,
      amount,
      category,
      description,
      transactionDate: new Date(),
    });
  };

  if (!ledger) {
    return <div className="min-h-screen flex items-center justify-center">加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/ledger">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold text-gray-800">{ledger.name}</h1>
          </div>
          <Button onClick={() => setShowAddDialog(true)} size="sm">
            <Plus className="w-4 h-4 mr-1" />
            记一笔
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {stats && (
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4 text-center">
              <div className="text-sm text-gray-500 mb-1">收入</div>
              <div className="text-xl font-bold text-green-600">¥{stats.totalIncome.toFixed(2)}</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-sm text-gray-500 mb-1">支出</div>
              <div className="text-xl font-bold text-red-600">¥{stats.totalExpense.toFixed(2)}</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-sm text-gray-500 mb-1">结余</div>
              <div className="text-xl font-bold text-blue-600">¥{stats.balance.toFixed(2)}</div>
            </Card>
          </div>
        )}

        <div>
          <h2 className="text-lg font-semibold mb-4">账单记录</h2>
          {!transactions || transactions.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              还没有账单记录，点击右上角开始记账
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((t) => (
                <Card key={t.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {t.type === 'income' ? (
                        <TrendingUp className="w-5 h-5 text-green-600" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-red-600" />
                      )}
                      <div>
                        <div className="font-medium">{t.category}</div>
                        {t.description && <div className="text-sm text-gray-500">{t.description}</div>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-semibold ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                        {t.type === 'income' ? '+' : '-'}¥{parseFloat(t.amount).toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(t.transactionDate).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>记一笔</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>类型</Label>
              <Select value={type} onValueChange={(v: 'income' | 'expense') => setType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">支出</SelectItem>
                  <SelectItem value="income">收入</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="amount">金额 *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="category">分类 *</Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="例如：餐饮、交通、工资"
              />
            </div>
            <div>
              <Label htmlFor="desc">备注</Label>
              <Textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简单描述这笔支出"
                rows={2}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                取消
              </Button>
              <Button onClick={handleAdd} disabled={addMutation.isPending}>
                {addMutation.isPending ? '添加中...' : '添加'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
