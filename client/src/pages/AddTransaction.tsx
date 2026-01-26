import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Image as ImageIcon,
  Link as LinkIcon,
  MapPin,
  Calendar,
  CheckCircle2,
  User,
} from "lucide-react";
import { toast } from "sonner";

type TransactionType = "expense" | "income" | "transfer";

const AddTransaction = () => {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  
  const [transactionType, setTransactionType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("0.00");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("银行转账");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toLocaleDateString("zh-CN"));

  // 分类选项
  const categories = {
    expense: ["贷款", "购物", "交通", "其他", "保险医疗", "餐饮", "娱乐", "教育", "住房"],
    income: ["工资", "奖金", "投资收益", "其他收入"],
    transfer: ["内部转账"],
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

  // 处理数字键盘输入
  const handleNumberInput = (num: string) => {
    if (amount === "0.00") {
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

    // TODO: 调用 API 保存记账记录
    toast.success("记账成功");
    setLocation(`/ledger/${id}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-blue-600 pb-20">
      {/* 顶部导航 */}
      <div className="bg-blue-600 text-white p-4 flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-blue-700"
          onClick={() => setLocation(`/ledger/${id}`)}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
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
        <button
          className={`flex-1 py-3 text-center ${
            transactionType === "transfer"
              ? "bg-blue-500 text-white font-semibold"
              : "text-gray-600"
          }`}
          onClick={() => setTransactionType("transfer")}
        >
          内部转账
        </button>
      </div>

      {/* 金额显示 */}
      <div className="bg-white p-6">
        <div className="text-5xl font-light text-gray-800">¥{amount}</div>
      </div>

      {/* 分类选择 */}
      <div className="bg-white p-4 mt-2">
        <div className="text-sm text-gray-500 mb-3">请选择分类</div>
        <div className="flex flex-wrap gap-2">
          {categories[transactionType].map((category) => (
            <Button
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              size="lg"
              className={`rounded-full ${
                selectedCategory === category
                  ? "bg-blue-500 text-white"
                  : "text-gray-700"
              }`}
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </Button>
          ))}
        </div>
      </div>

      {/* 快捷分类（仅支出显示） */}
      {transactionType === "expense" && (
        <div className="bg-white p-4 mt-2">
          <div className="flex flex-wrap gap-2">
            {quickCategories.map((category) => (
              <Button
                key={category}
                variant="outline"
                size="sm"
                className="text-gray-700 border-gray-300"
                onClick={() => {
                  setSelectedCategory("贷款");
                  setNote(category);
                }}
              >
                {category}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* 账户选择 */}
      <div className="bg-white p-4 mt-2">
        <div className="text-sm text-gray-500 mb-3">请选择账户</div>
        <div className="flex flex-wrap gap-2">
          {accounts.map((account) => (
            <Button
              key={account}
              variant={selectedAccount === account ? "default" : "outline"}
              size="lg"
              className={`rounded-full ${
                selectedAccount === account
                  ? "bg-blue-500 text-white"
                  : "text-gray-700"
              }`}
              onClick={() => setSelectedAccount(account)}
            >
              {account}
            </Button>
          ))}
        </div>
      </div>

      {/* 备注 */}
      <div className="bg-white p-4 mt-2">
        <div className="text-sm text-gray-500 mb-2">备注</div>
        <Textarea
          placeholder="添加备注..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-[80px] resize-none"
        />
      </div>

      {/* 上传图片 */}
      <div className="bg-white p-4 mt-2 flex justify-end">
        <Button
          variant="default"
          className="bg-blue-500 hover:bg-blue-600 text-white"
        >
          <ImageIcon className="w-4 h-4 mr-2" />
          上传图片
        </Button>
      </div>

      {/* 底部工具栏 */}
      <div className="bg-white p-4 mt-2 flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <button className="flex items-center gap-1 text-gray-600">
            <LinkIcon className="w-4 h-4" />
          </button>
          <button className="flex items-center gap-1 text-gray-600">
            <MapPin className="w-4 h-4" />
          </button>
          <button className="flex items-center gap-1 text-gray-600">
            <Calendar className="w-4 h-4" />
            <span>{date}</span>
          </button>
        </div>
        <div className="flex items-center gap-4">
          <button className="flex items-center gap-1 text-blue-500">
            <CheckCircle2 className="w-4 h-4" />
            <span>计入收支</span>
          </button>
          <button className="flex items-center gap-1 text-gray-600">
            <span>支出人</span>
          </button>
          <button className="flex items-center gap-1 text-gray-600">
            <User className="w-4 h-4" />
            <span>我自己</span>
          </button>
        </div>
      </div>

      {/* 数字键盘 */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-100 grid grid-cols-4 gap-px border-t">
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
    </div>
  );
};

export default AddTransaction;
