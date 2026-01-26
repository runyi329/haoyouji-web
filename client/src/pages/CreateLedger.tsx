import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { ChevronLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";

// 账本类型名称映射
const ledgerTypeNames: Record<string, string> = {
  family: "家庭/情侣账本",
  travel: "旅游账本",
  renovation: "装修账本",
  business: "生意账本",
  class: "班级账本",
  expense: "报销账本",
  custom: "自定义账本",
};

// 货币列表
const currencies = [
  { code: "CNY", name: "人民币", symbol: "¥", flag: "🇨🇳" },
  { code: "USD", name: "美元", symbol: "$", flag: "🇺🇸" },
  { code: "JPY", name: "日元", symbol: "¥", flag: "🇯🇵" },
  { code: "EUR", name: "欧元", symbol: "€", flag: "🇪🇺" },
  { code: "HKD", name: "港币", symbol: "$", flag: "🇭🇰" },
  { code: "GBP", name: "英镑", symbol: "£", flag: "🇬🇧" },
  { code: "CAD", name: "加拿大元", symbol: "$", flag: "🇨🇦" },
  { code: "AUD", name: "澳币", symbol: "$", flag: "🇦🇺" },
  { code: "TWD", name: "新台币NT", symbol: "$", flag: "🇹🇼" },
];

export default function CreateLedger() {
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const type = new URLSearchParams(searchParams).get("type") || "family";
  
  const [ledgerName, setLedgerName] = useState("");
  const [nickname, setNickname] = useState("胡");
  const [selectedCurrency, setSelectedCurrency] = useState("CNY");
  const [showCurrencySheet, setShowCurrencySheet] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);

  // 根据类型设置默认账本名称
  useEffect(() => {
    if (type === "family") {
      setLedgerName("XX和XX的账");
    } else if (type === "renovation") {
      setLedgerName("XX小区 XX号装修账");
    }
  }, [type]);

  const handleCreate = () => {
    // TODO: 调用创建账本API
    setShowSuccessDialog(true);
  };

  const handleGoToSettings = () => {
    setShowSuccessDialog(false);
    // TODO: 跳转到账本设置页面，传递新创建的账本ID
    setLocation("/ledger/1/settings");
  };

  const handleSkipSettings = () => {
    setShowSuccessDialog(false);
    setLocation("/ledger");
  };

  const selectedCurrencyData = currencies.find(c => c.code === selectedCurrency);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* 顶部导航栏 */}
      <div className="bg-blue-500 text-white">
        <div className="container py-3 px-4 flex items-center">
          <button
            onClick={() => setLocation("/ledger/create-type")}
            className="p-1 -ml-2 hover:bg-blue-600 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="flex-1 text-lg font-semibold text-center mr-8">创建新的账本</h1>
        </div>
      </div>

      {/* 表单内容 */}
      <div className="container px-4 py-4 space-y-4">
        {/* 账本名称 */}
        <div className="bg-white rounded-lg p-3">
          <label className="text-xs text-gray-500 mb-1.5 block">账本名称</label>
          <Input
            value={ledgerName}
            onChange={(e) => setLedgerName(e.target.value)}
            placeholder="请输入账本名称"
            className="border-0 p-0 h-8 text-base focus-visible:ring-0"
          />
        </div>

        {/* 自己在账本内的昵称 */}
        <div className="bg-white rounded-lg p-3">
          <label className="text-xs text-gray-500 mb-1.5 block">自己在账本内的昵称</label>
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="请输入昵称"
            className="border-0 p-0 h-8 text-base focus-visible:ring-0"
          />
        </div>

        {/* 账本类型 */}
        <div
          className="bg-white rounded-lg p-3 flex items-center justify-between cursor-pointer"
          onClick={() => setLocation("/ledger/create-type")}
        >
          <label className="text-xs text-gray-500">账本类型</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-800">{ledgerTypeNames[type]}</span>
            <Check className="w-4 h-4 text-green-500" />
          </div>
        </div>

        {/* 账本结算货币 */}
        <div
          className="bg-white rounded-lg p-3 flex items-center justify-between cursor-pointer"
          onClick={() => setShowCurrencySheet(true)}
        >
          <label className="text-xs text-gray-500">账本结算货币</label>
          <div className="flex items-center gap-2">
            <span className="text-lg">{selectedCurrencyData?.flag}</span>
            <span className="text-sm text-gray-800">{selectedCurrencyData?.name}</span>
            <Check className="w-4 h-4 text-green-500" />
          </div>
        </div>

        {/* 确定按钮 */}
        <Button
          onClick={handleCreate}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white h-11 text-base"
        >
          确 定
        </Button>
      </div>

      {/* 货币选择抽屉 */}
      <Sheet open={showCurrencySheet} onOpenChange={setShowCurrencySheet}>
        <SheetContent side="bottom" className="h-[50vh] p-0">
          <div className="p-4 border-b">
            <h3 className="text-base font-semibold text-center">请选择货币：</h3>
          </div>
          <div className="overflow-y-auto h-[calc(50vh-60px)]">
            {currencies.map((currency) => (
              <div
                key={currency.code}
                onClick={() => {
                  setSelectedCurrency(currency.code);
                  setShowCurrencySheet(false);
                }}
                className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <span className="text-2xl">{currency.flag}</span>
                <span className="flex-1 text-sm text-gray-800">
                  {currency.name} ({currency.symbol} {currency.code})
                </span>
                {selectedCurrency === currency.code && (
                  <Check className="w-5 h-5 text-green-500" />
                )}
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* 创建成功对话框 */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="w-[85%] rounded-lg p-0 gap-0">
          <div className="p-6 text-center">
            <h3 className="text-lg font-semibold mb-4">添加账本成功</h3>
            <p className="text-sm text-gray-600">
              账本创建成功了，是否去设置或邀请好友加入账本?
            </p>
          </div>
          <div className="flex border-t">
            <button
              onClick={handleSkipSettings}
              className="flex-1 py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors border-r"
            >
              不用了
            </button>
            <button
              onClick={handleGoToSettings}
              className="flex-1 py-3 text-sm text-blue-500 font-medium hover:bg-gray-50 transition-colors"
            >
              去设置
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
