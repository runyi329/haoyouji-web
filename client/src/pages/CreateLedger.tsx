import { useState } from "react";
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
import { ChevronLeft, Home, Plane, Hammer, Briefcase, GraduationCap, Receipt, Edit, Dumbbell } from "lucide-react";
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
  diet: { name: "减肥账本", icon: Dumbbell, defaultName: "我的减肥计划" },
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
  { code: "USDT", symbol: "₮", name: "USDT" },
];

export default function CreateLedger() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const typeParam = params.get("type") || "family";
  const isDiet = typeParam === "diet";

  const typeConfig = ledgerTypeConfig[typeParam] || ledgerTypeConfig.family;
  const Icon = typeConfig.icon;

  const [ledgerName, setLedgerName] = useState(typeConfig.defaultName);
  const [nickname, setNickname] = useState("");
  const [currency, setCurrency] = useState("CNY");
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [createdLedgerId, setCreatedLedgerId] = useState<number | null>(null);

  // 减肥账本专属字段
  const [gender, setGender] = useState<"female" | "male">("female");
  const [currentWeight, setCurrentWeight] = useState("");
  const [height, setHeight] = useState("");
  const [planToLose, setPlanToLose] = useState("");

  const saveConfigMutation = trpc.diet.saveConfig.useMutation();

  const createLedgerMutation = trpc.ledger.create.useMutation({
    onSuccess: async (data) => {
      setCreatedLedgerId(data.id);
      // 减肥账本：自动保存基础档案
      if (isDiet && currentWeight && planToLose) {
        const cw = parseFloat(currentWeight);
        const lose = parseFloat(planToLose);
        if (!isNaN(cw) && !isNaN(lose) && cw > 0 && lose > 0) {
          try {
            await saveConfigMutation.mutateAsync({
              ledgerId: data.id,
              initialWeight: cw,
              targetWeight: Math.max(cw - lose, 1),
              currentWeight: cw,
              height: height ? parseFloat(height) : undefined,
              gender,
            });
          } catch (e) {
            console.error("保存减肥配置失败", e);
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 300));
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
    if (isDiet) {
      if (!currentWeight || parseFloat(currentWeight) <= 0) {
        toast.error("请输入当前体重");
        return;
      }
      if (!planToLose || parseFloat(planToLose) <= 0) {
        toast.error("请输入计划减重斤数");
        return;
      }
    }
    createLedgerMutation.mutate({
      name: ledgerName,
      type: typeParam,
      currency: isDiet ? "CNY" : currency,
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
      if (typeParam === "diet") {
        setLocation(`/ledger/${createdLedgerId}/diet`);
      } else {
        setLocation(`/ledger/${createdLedgerId}`);
      }
    } else {
      setLocation("/ledger");
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF3ED]">
      {/* 顶部导航栏 */}
      <div className="text-white px-3 py-2.5 flex items-center" style={{ backgroundColor: 'var(--brand-red, #D32F2F)' }}>
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
          <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0" style={{ color: isDiet ? '#e11d48' : 'var(--brand-red, #D32F2F)' }}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-gray-500">账本类型</div>
            <div className="text-sm font-medium text-[#222222]">{typeConfig.name}</div>
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
            {isDiet ? "学员昵称" : "我在账本内的昵称"}
            <span className="text-xs text-gray-500 ml-2">（选填，不填则显示用户名）</span>
          </Label>
          <Input
            id="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={isDiet ? "学员昵称，选填" : "选填，不填则使用用户名"}
            className="h-9 text-sm"
          />
        </div>

        {/* 减肥账本专属：基础档案 */}
        {isDiet && (
          <div className="bg-white rounded-lg p-3 space-y-4">
            <div className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-2">
              学员基础档案
              <span className="text-xs text-gray-400 ml-2 font-normal">（后续可在账本内修改）</span>
            </div>

            {/* 性别 */}
            <div className="space-y-2">
              <Label className="text-sm text-gray-600">性别</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setGender("female")}
                  className={`flex-1 h-9 rounded-lg text-sm font-medium border transition-colors ${
                    gender === "female"
                      ? "bg-rose-500 text-white border-rose-500"
                      : "bg-gray-50 text-gray-600 border-gray-200"
                  }`}
                >
                  女
                </button>
                <button
                  type="button"
                  onClick={() => setGender("male")}
                  className={`flex-1 h-9 rounded-lg text-sm font-medium border transition-colors ${
                    gender === "male"
                      ? "bg-rose-500 text-white border-rose-500"
                      : "bg-gray-50 text-gray-600 border-gray-200"
                  }`}
                >
                  男
                </button>
              </div>
            </div>

            {/* 当前体重 */}
            <div className="space-y-2">
              <Label className="text-sm text-gray-600">当前体重 <span className="text-red-400">*</span></Label>
              <div className="relative">
                <Input
                  type="number"
                  value={currentWeight}
                  onChange={(e) => setCurrentWeight(e.target.value)}
                  placeholder="请输入当前体重"
                  className="h-9 text-sm pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">斤</span>
              </div>
            </div>

            {/* 身高 */}
            <div className="space-y-2">
              <Label className="text-sm text-gray-600">身高 <span className="text-gray-400 text-xs">（选填）</span></Label>
              <div className="relative">
                <Input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="请输入身高"
                  className="h-9 text-sm pr-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">cm</span>
              </div>
            </div>

            {/* 计划减多少斤 */}
            <div className="space-y-2">
              <Label className="text-sm text-gray-600">计划减重 <span className="text-red-400">*</span></Label>
              <div className="relative">
                <Input
                  type="number"
                  value={planToLose}
                  onChange={(e) => setPlanToLose(e.target.value)}
                  placeholder="计划减掉多少斤"
                  className="h-9 text-sm pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">斤</span>
              </div>
              {currentWeight && planToLose && parseFloat(currentWeight) > 0 && parseFloat(planToLose) > 0 && (
                <p className="text-xs text-rose-500">
                  目标体重：{(parseFloat(currentWeight) - parseFloat(planToLose)).toFixed(1)} 斤
                </p>
              )}
            </div>
          </div>
        )}

        {/* 账本结算货币（减肥账本不显示） */}
        {!isDiet && (
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
        )}

        {/* 创建按钮 */}
        <Button
          onClick={handleCreate}
          disabled={createLedgerMutation.isPending}
          className="w-full h-10 text-white"
          style={{ backgroundColor: 'var(--brand-red, #D32F2F)' }}
        >
          {createLedgerMutation.isPending ? "创建中..." : "创建账本"}
        </Button>
      </div>

      {/* 创建成功对话框 */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="w-[85%] max-w-sm" showCloseButton={false}>
          <DialogTitle className="text-center text-base font-medium">
            {isDiet ? "减肥账本创建成功 🎉" : "账本创建成功了"}
          </DialogTitle>
          <DialogDescription className="text-center text-sm text-[#757575]">
            {isDiet
              ? "可以邀请学员和拉拉队加入，一起见证蜕变！"
              : "是否去设置或邀请好友加入账本？"}
          </DialogDescription>
          <DialogFooter className="flex-row gap-2 sm:justify-center">
            <Button
              variant="outline"
              onClick={handleSkip}
              className="flex-1 h-9"
            >
              {isDiet ? "进入账本" : "不用了"}
            </Button>
            <Button
              onClick={handleGoToSettings}
              className="flex-1 h-9 text-white"
              style={{ backgroundColor: 'var(--brand-red, #D32F2F)' }}
            >
              邀请成员
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
