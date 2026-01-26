import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { ChevronLeft, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LedgerFilter() {
  const [, params] = useRoute("/ledger/:id/filter");
  const [, setLocation] = useLocation();
  const ledgerId = params?.id;

  // 筛选条件状态
  const [selectedMember, setSelectedMember] = useState("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [selectedCurrency, setSelectedCurrency] = useState("all");
  const [note, setNote] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 账目类型选项
  const transactionTypes = [
    { value: "all", label: "不限制" },
    { value: "expense", label: "支出" },
    { value: "income", label: "收入" },
    { value: "transfer", label: "内部转账" },
    { value: "receivable", label: "待收" },
    { value: "payable", label: "待支" },
    { value: "lend", label: "借出" },
    { value: "borrow", label: "借入" },
  ];

  // 资金账户选项
  const accountTypes = [
    { value: "all", label: "全部" },
    { value: "bank", label: "银行转账" },
    { value: "cash", label: "现金" },
    { value: "cmb", label: "招行转账" },
    { value: "alipay", label: "支付宝" },
    { value: "wechat", label: "微信钱包" },
  ];

  // 重置所有条件
  const handleReset = () => {
    setSelectedMember("all");
    setDateStart("");
    setDateEnd("");
    setAmountMin("");
    setAmountMax("");
    setSelectedType("all");
    setSelectedAccount("all");
    setSelectedCurrency("all");
    setNote("");
  };

  // 确定搜索
  const handleSearch = () => {
    // TODO: 实现搜索逻辑，将筛选条件传递给账本详情页面
    setLocation(`/ledger/${ledgerId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部标题栏 */}
      <div className="bg-white border-b px-4 py-3 flex items-center">
        <button onClick={() => setLocation(`/ledger/${ledgerId}`)} className="p-1 -ml-2">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="flex-1 text-center text-lg font-medium">家庭记账</h1>
        <div className="w-6"></div>
      </div>

      {/* 筛选条件区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* 记账人 */}
        <div className="flex items-center">
          <label className="w-24 text-gray-700">记账人：</label>
          <Button
            variant={selectedMember === "all" ? "default" : "outline"}
            className="rounded-lg"
            onClick={() => setSelectedMember("all")}
          >
            全部成员
          </Button>
        </div>

        {/* 账目时间 */}
        <div className="flex items-center gap-2">
          <label className="w-24 text-gray-700">账目时间：</label>
          <input
            type="text"
            placeholder="不限制"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            className="flex-1 px-4 py-2 bg-gray-100 rounded-lg text-center text-sm outline-none"
          />
          <span className="text-gray-400">-</span>
          <input
            type="text"
            placeholder="不限制"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            className="flex-1 px-4 py-2 bg-gray-100 rounded-lg text-center text-sm outline-none"
          />
        </div>

        {/* 金额范围 */}
        <div className="flex items-center gap-2">
          <label className="w-24 text-gray-700">金额范围：</label>
          <input
            type="text"
            placeholder="不限制"
            value={amountMin}
            onChange={(e) => setAmountMin(e.target.value)}
            className="flex-1 px-4 py-2 bg-gray-100 rounded-lg text-center text-sm outline-none"
          />
          <span className="text-gray-400">-</span>
          <input
            type="text"
            placeholder="不限制"
            value={amountMax}
            onChange={(e) => setAmountMax(e.target.value)}
            className="flex-1 px-4 py-2 bg-gray-100 rounded-lg text-center text-sm outline-none"
          />
        </div>

        {/* 账目类型 */}
        <div>
          <label className="block mb-2 text-gray-700">账目类型：</label>
          <div className="flex flex-wrap gap-2">
            {transactionTypes.map((type) => (
              <Button
                key={type.value}
                variant={selectedType === type.value ? "default" : "outline"}
                className="rounded-lg"
                onClick={() => setSelectedType(type.value)}
              >
                {type.label}
              </Button>
            ))}
          </div>
        </div>

        {/* 资金账户 */}
        <div>
          <label className="block mb-2 text-gray-700">资金账户：</label>
          <div className="flex flex-wrap gap-2">
            {accountTypes.map((account) => (
              <Button
                key={account.value}
                variant={selectedAccount === account.value ? "default" : "outline"}
                className="rounded-lg"
                onClick={() => setSelectedAccount(account.value)}
              >
                {account.label}
              </Button>
            ))}
          </div>
        </div>

        {/* 货币种类 */}
        <div className="flex items-center">
          <label className="w-24 text-gray-700">货币种类：</label>
          <Button
            variant={selectedCurrency === "all" ? "default" : "outline"}
            className="rounded-lg"
            onClick={() => setSelectedCurrency("all")}
          >
            不限制
          </Button>
        </div>

        {/* 备注信息 */}
        <div>
          <label className="block mb-2 text-gray-700">备注信息：</label>
          <input
            type="text"
            placeholder="不限制"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-4 py-3 bg-gray-100 rounded-lg text-sm outline-none"
          />
        </div>

        {/* 高级选项 */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-center gap-2 py-3 text-gray-600"
        >
          <span>高级选项</span>
          <ChevronDown
            className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
          />
        </button>

        {showAdvanced && (
          <div className="bg-gray-100 rounded-lg p-4">
            <p className="text-sm text-gray-500 text-center">暂无高级选项</p>
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="bg-white border-t px-4 py-3 flex gap-3">
        <Button
          variant="outline"
          className="flex-1 h-12 text-base"
          onClick={handleReset}
        >
          重置条件
        </Button>
        <Button
          className="flex-1 h-12 text-base bg-blue-500 hover:bg-blue-600"
          onClick={handleSearch}
        >
          确定搜索
        </Button>
      </div>
    </div>
  );
}
