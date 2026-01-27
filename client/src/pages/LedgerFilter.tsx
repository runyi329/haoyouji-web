import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { ChevronLeft, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export default function LedgerFilter() {
  const [, params] = useRoute("/ledger/:id/filter");
  const [, setLocation] = useLocation();
  const ledgerId = parseInt(params?.id || "0");

  // 获取账本成员
  const { data: membersData } = trpc.ledger.getMembers.useQuery({ ledgerId });

  // 筛选条件状态
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [showMemberPicker, setShowMemberPicker] = useState(false);

  // 切换成员选择
  const toggleMember = (memberId: number) => {
    if (memberId === 0) {
      setSelectedMemberIds([]);
    } else {
      setSelectedMemberIds(prev => 
        prev.includes(memberId) 
          ? prev.filter(id => id !== memberId)
          : [...prev, memberId]
      );
    }
  };
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
    { value: "all", label: "不限制", color: "bg-blue-500" },
    { value: "expense", label: "支出", color: "bg-orange-500" },
    { value: "income", label: "收入", color: "bg-green-500" },
  ];

  // 资金账户选项
  const accountTypes = [
    { value: "all", label: "全部", color: "bg-blue-500" },
    { value: "bank", label: "银行转账", color: "bg-orange-500" },
    { value: "cash", label: "现金", color: "bg-green-500" },
    { value: "cmb", label: "招行转账", color: "bg-purple-500" },
    { value: "alipay", label: "支付宝", color: "bg-blue-400" },
    { value: "wechat", label: "微信钱包", color: "bg-orange-400" },
  ];

  // 重置所有条件
  const handleReset = () => {
    setSelectedMemberIds([]);
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex flex-col">
      {/* 顶部标题栏 */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-500 px-3 py-2.5 flex items-center shadow-md">
        <button onClick={() => setLocation(`/ledger/${ledgerId}`)} className="p-1 -ml-1">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="flex-1 text-center text-base font-medium text-white">筛选账单</h1>
        <div className="w-5"></div>
      </div>

      {/* 筛选条件区域 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* 记账人 */}
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">记账人</label>
            <button
              onClick={() => setShowMemberPicker(true)}
              className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white text-[10px] font-medium flex-shrink-0 overflow-hidden"
            >
              {selectedMemberIds.length === 0 ? (
                <span className="text-[8px] leading-tight">全部<br />成员</span>
              ) : selectedMemberIds.length === 1 ? (
                <span className="text-[10px]">成员</span>
              ) : (
                <span className="text-[10px]">多选</span>
              )}
            </button>
          </div>
        </div>

        {/* 账目时间 */}
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">账目时间</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="开始日期"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-blue-400"
            />
            <span className="text-gray-400 text-xs">至</span>
            <input
              type="text"
              placeholder="结束日期"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-blue-400"
            />
          </div>
        </div>

        {/* 金额范围 */}
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">金额范围</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="最小金额"
              value={amountMin}
              onChange={(e) => setAmountMin(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-blue-400"
            />
            <span className="text-gray-400 text-xs">至</span>
            <input
              type="text"
              placeholder="最大金额"
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-blue-400"
            />
          </div>
        </div>

        {/* 账目类型 */}
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">账目类型</label>
          <div className="flex flex-wrap gap-2">
            {transactionTypes.map((type) => (
              <Button
                key={type.value}
                variant={selectedType === type.value ? "default" : "outline"}
                size="sm"
                className={`h-7 px-3 text-xs rounded-full ${
                  selectedType === type.value
                    ? `${type.color} text-white hover:opacity-90`
                    : "border-gray-200"
                }`}
                onClick={() => setSelectedType(type.value)}
              >
                {type.label}
              </Button>
            ))}
          </div>
        </div>

        {/* 资金账户 */}
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">资金账户</label>
          <div className="flex flex-wrap gap-2">
            {accountTypes.map((account) => (
              <Button
                key={account.value}
                variant={selectedAccount === account.value ? "default" : "outline"}
                size="sm"
                className={`h-7 px-3 text-xs rounded-full ${
                  selectedAccount === account.value
                    ? `${account.color} text-white hover:opacity-90`
                    : "border-gray-200"
                }`}
                onClick={() => setSelectedAccount(account.value)}
              >
                {account.label}
              </Button>
            ))}
          </div>
        </div>

        {/* 货币种类 */}
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">货币种类</label>
            <Button
              variant={selectedCurrency === "all" ? "default" : "outline"}
              size="sm"
              className={`h-7 px-3 text-xs rounded-full ${
                selectedCurrency === "all" ? "bg-green-500 hover:bg-green-600" : ""
              }`}
              onClick={() => setSelectedCurrency("all")}
            >
              不限制
            </Button>
          </div>
        </div>

        {/* 备注信息 */}
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">备注信息</label>
          <input
            type="text"
            placeholder="输入备注关键词"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-blue-400"
          />
        </div>

        {/* 高级选项 */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-center gap-2 py-2 text-gray-600 text-sm"
        >
          <span>高级选项</span>
          <ChevronDown
            className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
          />
        </button>

        {showAdvanced && (
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-xs text-gray-500 text-center">暂无高级选项</p>
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="bg-white border-t px-3 py-2.5 flex gap-2 shadow-lg">
        <Button
          variant="outline"
          className="flex-1 h-10 text-sm border-gray-300"
          onClick={handleReset}
        >
          重置条件
        </Button>
        <Button
          className="flex-1 h-10 text-sm bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white"
          onClick={handleSearch}
        >
          确定搜索
        </Button>
      </div>

      {/* 成员选择弹窗 */}
      {showMemberPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowMemberPicker(false)}>
          <div className="bg-white rounded-lg p-4 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium mb-3">选择成员</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              <div 
                onClick={() => toggleMember(0)}
                className={`flex items-center p-2 rounded cursor-pointer ${
                  selectedMemberIds.length === 0 ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm mr-2">
                  全
                </div>
                <span>全部成员</span>
                {selectedMemberIds.length === 0 && <span className="ml-auto text-blue-600">✓</span>}
              </div>
              {membersData?.map((member: any) => (
                <div 
                  key={member.id}
                  onClick={() => toggleMember(member.id)}
                  className={`flex items-center p-2 rounded cursor-pointer ${
                    selectedMemberIds.includes(member.id) ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  {member.avatarUrl ? (
                    <img src={member.avatarUrl} alt="" className="w-8 h-8 rounded-full mr-2" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-white text-sm mr-2">
                      {member.nickname?.charAt(0) || 'U'}
                    </div>
                  )}
                  <span>{member.nickname}</span>
                  {selectedMemberIds.includes(member.id) && <span className="ml-auto text-blue-600">✓</span>}
                </div>
              ))}
            </div>
            <button 
              onClick={() => setShowMemberPicker(false)}
              className="w-full mt-4 bg-blue-600 text-white py-2 rounded"
            >
              确定
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
