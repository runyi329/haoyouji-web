import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Image as ImageIcon,
  Link2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type TransactionType = "expense" | "income";

const AddTransaction = () => {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();

  const [transactionType, setTransactionType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("0.00");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("银行转账");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }));
  const [payer, setPayer] = useState("我自己");
  const [isPayerSheetOpen, setIsPayerSheetOpen] = useState(false);

  // 分类选项
  const categories = {
    expense: ["贷款", "购物", "交通", "其他", "保险医疗", "餐饮", "娱乐", "教育", "住房"],
    income: ["工资", "奖金", "投资收益", "其他收入"],
  };

  // 快捷分类（支出专用）
  const quickCategories = [
    "胡上海建行按揭",
    "邮储",
    "胡招行经营贷",
    "蒋招行闪电贷",
  ];

  // 账户选项
  const accounts = ["银行转账", "现金", "招行转账", "支付宝", "微信支付"];

  // 模拟成员列表
  const members = [
    { id: 1, name: "我自己", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=me" },
    { id: 2, name: "Yunting", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=yunting" },
    { id: 3, name: "M", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=m" },
  ];

  // 处理数字键盘输入
  const handleNumberInput = (num: string) => {
    if (num === "." && amount.includes(".")) {
      return; // 已经有小数点了
    }
    
    if (amount === "0.00" || amount === "0") {
      setAmount(num === "." ? "0." : num);
    } else {
      setAmount(amount + num);
    }
  };

  // 处理删除
  const handleDelete = () => {
    if (amount.length > 1) {
      setAmount(amount.slice(0, -1));
    } else {
      setAmount("0.00");
    }
  };

  // 处理保存
  const handleSave = () => {
    if (!selectedCategory) {
      toast.error("请选择分类");
      return;
    }
    if (parseFloat(amount) === 0) {
      toast.error("请输入金额");
      return;
    }

    toast.success("记账成功！");
    setLocation(`/ledger/${id}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-96">
      {/* 顶部导航 */}
      <div className="bg-blue-500 text-white p-4 flex items-center justify-between">
        <button onClick={() => setLocation(`/ledger/${id}`)}>
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-semibold">添加账目</h1>
        <div className="w-10" /> {/* 占位 */}
      </div>

      {/* 类型标签页 */}
      <div className="bg-white flex">
        <button
          className={`flex-1 py-3 text-center ${
            transactionType === "expense"
              ? "bg-blue-500 text-white font-semibold"
              : "text-gray-600"
          }`}
          onClick={() => setTransactionType("expense")}
        >
          支出 ▼
        </button>
        <button
          className={`flex-1 py-3 text-center ${
            transactionType === "income"
              ? "bg-blue-500 text-white font-semibold"
              : "text-gray-600"
          }`}
          onClick={() => setTransactionType("income")}
        >
          收入
        </button>
      </div>

      {/* 金额显示 */}
      <div className="bg-white p-6">
        <div className="text-5xl font-light text-gray-800">¥{amount}</div>
      </div>

      {/* 分类选择 */}
      <div className="bg-white mt-2 p-4">
        <div className="text-sm text-gray-500 mb-3">请选择分类</div>
        <div className="flex flex-wrap gap-2">
          {categories[transactionType].map((category) => (
            <button
              key={category}
              className={`px-4 py-2 rounded-full text-sm ${
                selectedCategory === category
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* 快捷分类（仅支出） */}
      {transactionType === "expense" && (
        <div className="bg-white mt-2 p-4">
          <div className="flex flex-wrap gap-2">
            {quickCategories.map((category) => (
              <button
                key={category}
                className="px-3 py-1.5 bg-gray-50 text-gray-600 text-xs rounded border border-gray-200"
                onClick={() => {
                  setSelectedCategory("贷款");
                  setNote(category);
                }}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 账户选择 */}
      <div className="bg-white mt-2 p-4">
        <div className="text-sm text-gray-500 mb-3">
          {transactionType === "expense" ? "选择付款方式" : "选择收款方式"}
        </div>
        <div className="flex flex-wrap gap-2">
          {accounts.map((account) => (
            <button
              key={account}
              className={`px-4 py-2 rounded-full text-sm ${
                selectedAccount === account
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
              onClick={() => setSelectedAccount(account)}
            >
              {account}
            </button>
          ))}
        </div>
      </div>

      {/* 备注输入 */}
      <div className="bg-white mt-2 p-4">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="备注"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="flex-1 p-2 border-none outline-none text-gray-700"
          />
          <button className="p-2 bg-blue-500 text-white rounded">
            <ImageIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 底部工具栏 */}
      <div className="bg-white mt-2 p-4">
        <div className="flex items-center justify-between text-sm">
          <button className="flex items-center gap-1 text-gray-600">
            <Link2 className="w-4 h-4" />
            <span>关联账户</span>
          </button>
          <button className="flex items-center gap-1 text-gray-600">
            <Calendar className="w-4 h-4" />
            <span>{date}</span>
          </button>
          <button 
            className="flex items-center gap-1 text-gray-600"
            onClick={() => setIsPayerSheetOpen(true)}
          >
            <User className="w-4 h-4" />
            <span>{payer}</span>
          </button>
        </div>
      </div>

      {/* 数字键盘 */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-100 grid grid-cols-4 gap-px border-t z-50">
        {["7", "8", "9", "-"].map((key) => (
          <button
            key={key}
            className="bg-white p-6 text-2xl font-light text-gray-800 active:bg-gray-200"
            onClick={() => key !== "-" && handleNumberInput(key)}
          >
            {key}
          </button>
        ))}
        {["4", "5", "6", "+"].map((key) => (
          <button
            key={key}
            className="bg-white p-6 text-2xl font-light text-gray-800 active:bg-gray-200"
            onClick={() => key !== "+" && handleNumberInput(key)}
          >
            {key}
          </button>
        ))}
        {["1", "2", "3"].map((key) => (
          <button
            key={key}
            className="bg-white p-6 text-2xl font-light text-gray-800 active:bg-gray-200"
            onClick={() => handleNumberInput(key)}
          >
            {key}
          </button>
        ))}
        <button
          className="bg-blue-500 text-white p-6 text-lg font-semibold row-span-2 active:bg-blue-600"
          onClick={handleSave}
        >
          保存
        </button>
        <button
          className="bg-white p-6 text-2xl font-light text-gray-800 active:bg-gray-200"
          onClick={() => handleNumberInput(".")}
        >
          .
        </button>
        <button
          className="bg-white p-6 text-2xl font-light text-gray-800 active:bg-gray-200"
          onClick={() => handleNumberInput("0")}
        >
          0
        </button>
        <button
          className="bg-white p-6 text-xl text-gray-800 active:bg-gray-200 flex items-center justify-center"
          onClick={handleDelete}
        >
          ⌫
        </button>
      </div>

      {/* 支出人选择抽屉 */}
      <Sheet open={isPayerSheetOpen} onOpenChange={setIsPayerSheetOpen}>
        <SheetContent side="bottom" className="h-[60vh]">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              <span>请选择支出人：</span>
              <button
                onClick={() => setIsPayerSheetOpen(false)}
                className="text-blue-500"
              >
                完成
              </button>
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            {members.map((member) => (
              <button
                key={member.id}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg"
                onClick={() => {
                  setPayer(member.name);
                  setIsPayerSheetOpen(false);
                }}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={member.avatar}
                    alt={member.name}
                    className="w-10 h-10 rounded-full"
                  />
                  <span className="text-lg">{member.name}</span>
                </div>
                {payer === member.name && (
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                )}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default AddTransaction;
