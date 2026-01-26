import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ChevronLeft, Home, Plane, Hammer, Briefcase, GraduationCap, Receipt, Edit } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// 账本类型配置
const ledgerTypeConfig: Record<string, { name: string; icon: any; defaultName: string }> = {
  family: { name: "家庭/情侣账本", icon: Home, defaultName: "家庭记账" },
  travel: { name: "旅游账本", icon: Plane, defaultName: "旅游账本" },
  renovation: { name: "装修账本", icon: Hammer, defaultName: "装修账本" },
  business: { name: "生意账本", icon: Briefcase, defaultName: "生意账本" },
  class: { name: "班级账本", icon: GraduationCap, defaultName: "班级账本" },
  reimbursement: { name: "报销账本", icon: Receipt, defaultName: "报销账本" },
  custom: { name: "自定义账本", icon: Edit, defaultName: "自定义账本" },
};

// 货币配置
const currencies = [
  { code: "CNY", symbol: "¥", name: "人民币" },
  { code: "USD", symbol: "$", name: "美元" },
  { code: "JPY", symbol: "¥", name: "日元" },
  { code: "EUR", symbol: "€", name: "欧元" },
  { code: "HKD", symbol: "HK$", name: "港币" },
  { code: "GBP", symbol: "£", name: "英镑" },
];

export default function CreateLedger() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const typeParam = params.get("type") || "family";
  
  const typeConfig = ledgerTypeConfig[typeParam] || ledgerTypeConfig.family;
  const Icon = typeConfig.icon;

  const [ledgerName, setLedgerName] = useState(typeConfig.defaultName);
  const [nickname, setNickname] = useState("");
  const [currency, setCurrency] = useState("CNY");
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [createdLedgerId, setCreatedLedgerId] = useState<number | null>(null);

  const createLedgerMutation = trpc.ledger.create.useMutation({
    onSuccess: (data) => {
      setCreatedLedgerId(data.id);
      setShowSuccessDialog(true);
    },
    onError: (error) => {
      toast.error("创建账本失败: " + error.message);
    },
  });

  const handleCreate = () => {
    if (!ledgerName.trim()) {
      toast.error("请输入账本名称");
      return;
    }
    if (!nickname.trim()) {
      toast.error("请输入您在账本内的昵称");
      return;
    }

    // 调用后端API创建账本
    createLedgerMutation.mutate({
      name: ledgerName,
      type: typeParam,
      currency,
      memberNickname: nickname,
    });
  };

  const handleGoToSettings = () => {
    if (createdLedgerId) {
      setLocation(`/ledger/${createdLedgerId}/settings`);
    }
  };

  const handleSkip = () => {
    if (createdLedgerId) {
      // 跳转到新创建的账本详情页
      setLocation(`/ledger/${createdLedgerId}`);
    } else {
      // 如果没有创建成功，跳转到账本列表
      setLocation("/ledger");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="bg-blue-500 text-white px-3 py-2.5 flex items-center">
        <button
          onClick={() => setLocation("/ledger/create-type")}
          className="p-1 -ml-1"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-center text-base font-medium pr-6">创建新的账本</h1>
      </div>

      {/* 表单内容 */}
      <div className="p-4 space-y-4">
        {/* 账本类型显示 */}
        <div className="bg-white rounded-lg p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-gray-500">账本类型</div>
            <div className="text-sm font-medium text-gray-900">{typeConfig.name}</div>
          </div>
        </div>

        {/* 账本名称 */}
        <div className="bg-white rounded-lg p-3 space-y-2">
          <Label htmlFor="ledgerName" className="text-sm text-gray-700">
            账本名称
          </Label>
          <Input
            id="ledgerName"
            value={ledgerName}
            onChange={(e) => setLedgerName(e.target.value)}
            placeholder="请输入账本名称"
            className="h-9 text-sm"
          />
        </div>

        {/* 我在账本内的昵称 */}
        <div className="bg-white rounded-lg p-3 space-y-2">
          <Label htmlFor="nickname" className="text-sm text-gray-700">
            我在账本内的昵称
            <span className="text-xs text-gray-500 ml-2">（共享者可见，每个账本昵称可以不同）</span>
          </Label>
          <Input
            id="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="请输入您的昵称"
            className="h-9 text-sm"
          />
        </div>

        {/* 账本结算货币 */}
        <div className="bg-white rounded-lg p-3 space-y-2">
          <Label htmlFor="currency" className="text-sm text-gray-700">
            账本结算货币
          </Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((curr) => (
                <SelectItem key={curr.code} value={curr.code}>
                  {curr.symbol} {curr.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 创建按钮 */}
        <Button
          onClick={handleCreate}
          disabled={createLedgerMutation.isPending}
          className="w-full h-10 bg-blue-500 hover:bg-blue-600 text-white"
        >
          {createLedgerMutation.isPending ? "创建中..." : "创建账本"}
        </Button>
      </div>

      {/* 创建成功对话框 */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="w-[85%] max-w-sm" showCloseButton={false}>
          <DialogTitle className="text-center text-base font-medium">
            账本创建成功了
          </DialogTitle>
          <DialogDescription className="text-center text-sm text-gray-600">
            是否去设置或邀请好友加入账本？
          </DialogDescription>
          <DialogFooter className="flex-row gap-2 sm:justify-center">
            <Button
              variant="outline"
              onClick={handleSkip}
              className="flex-1 h-9"
            >
              不用了
            </Button>
            <Button
              onClick={handleGoToSettings}
              className="flex-1 h-9 bg-blue-500 hover:bg-blue-600"
            >
              去设置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
