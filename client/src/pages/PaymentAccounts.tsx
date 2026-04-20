import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft,
  CreditCard,
  Wallet,
  Plus,
  Trash2,
  Star,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";

type TabType = "bank" | "alipay" | "wechat" | "blockchain";

// 加密货币配置
const CRYPTOCURRENCIES = [
  { code: "USDT", name: "USDT (Tether)", description: "稳定币" },
  { code: "USDC", name: "USDC (USD Coin)", description: "稳定币" },
  { code: "BTC", name: "BTC (Bitcoin)", description: "比特币" },
  { code: "ETH", name: "ETH (Ethereum)", description: "以太币" },
  { code: "SOL", name: "SOL (Solana)", description: "Solana代币" },
];

// 区块链网络配置（仅支持 APTOS 和 TRC20）
const BLOCKCHAIN_NETWORKS = [
  { code: "APTOS", name: "Aptos", time: "约1分钟", minAmount: "0.01 USDT" },
  { code: "TRC20", name: "Tron (TRC20)", time: "约1分钟", minAmount: "0.01 USDT" },
];

// 银行配置：包括品牌色、渐变色和图标
const BANK_CONFIGS: Record<string, { gradient: string; icon: string; textColor: string }> = {
  "工商银行": { gradient: "from-red-500 to-red-600", icon: "🏦", textColor: "text-white" },
  "建设银行": { gradient: "from-blue-500 to-blue-600", icon: "🏦", textColor: "text-white" },
  "农业银行": { gradient: "from-green-500 to-green-600", icon: "🌾", textColor: "text-white" },
  "中国银行": { gradient: "from-red-600 to-red-700", icon: "🇨🇳", textColor: "text-white" },
  "招商银行": { gradient: "from-red-500 to-pink-600", icon: "💳", textColor: "text-white" },
  "交通银行": { gradient: "from-blue-600 to-blue-700", icon: "🚆", textColor: "text-white" },
  "邮储银行": { gradient: "from-green-600 to-green-700", icon: "📬", textColor: "text-white" },
  "民生银行": { gradient: "from-teal-500 to-teal-600", icon: "🏦", textColor: "text-white" },
  "中信银行": { gradient: "from-red-600 to-red-700", icon: "🏦", textColor: "text-white" },
  "浦发银行": { gradient: "from-blue-500 to-indigo-600", icon: "🏦", textColor: "text-white" },
  "兴业银行": { gradient: "from-blue-600 to-blue-700", icon: "🏦", textColor: "text-white" },
  "光大银行": { gradient: "from-purple-500 to-purple-600", icon: "✨", textColor: "text-white" },
  "平安银行": { gradient: "from-orange-500 to-orange-600", icon: "🛡️", textColor: "text-white" },
  "华夏银行": { gradient: "from-red-500 to-red-600", icon: "🏦", textColor: "text-white" },
  "广发银行": { gradient: "from-red-600 to-pink-600", icon: "🏦", textColor: "text-white" },
  // 默认样式
  "default": { gradient: "from-gray-600 to-gray-700", icon: "🏦", textColor: "text-white" },
};

// 获取银行配置
const getBankConfig = (bankName: string) => {
  // 尝试匹配包含关键字的银行名
  for (const [key, config] of Object.entries(BANK_CONFIGS)) {
    if (bankName.includes(key)) {
      return config;
    }
  }
  return BANK_CONFIGS.default;
};

interface PaymentAccountsProps {
  hideHeader?: boolean;
}

export default function PaymentAccounts({ hideHeader = false }: PaymentAccountsProps = {}) {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>("bank");
  
  // 银行卡相关状态
  const [isBankCardDialogOpen, setIsBankCardDialogOpen] = useState(false);
  const [isBankCardConfirmOpen, setIsBankCardConfirmOpen] = useState(false);
  const [editingBankCard, setEditingBankCard] = useState<any>(null);
  const [showCardNumber, setShowCardNumber] = useState<Record<string, boolean>>({});
  const [bankCardForm, setBankCardForm] = useState({
    cardNumber: "",
    cardHolder: "",
    bankName: "",
    cardType: "debit" as "debit" | "credit",
    notes: "",
  });

  // 数字钱包相关状态
  const [isWalletDialogOpen, setIsWalletDialogOpen] = useState(false);
  const [isWalletConfirmOpen, setIsWalletConfirmOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState<any>(null);
  const [showWalletAddress, setShowWalletAddress] = useState<Record<string, boolean>>({});
  const [walletForm, setWalletForm] = useState({
    walletType: "blockchain" as "blockchain" | "alipay" | "wechat" | "binance" | "okx" | "other",
    network: "",
    walletAddress: "",
    currency: "",
    account: "",
    accountName: "",
    notes: "",
  });

  // 查询银行卡列表
  const { data: bankCards = [], refetch: refetchBankCards } = trpc.paymentAccounts.getBankCards.useQuery();
  
  // 查询数字钱包列表
  const { data: digitalWallets = [], refetch: refetchWallets } = trpc.paymentAccounts.getDigitalWallets.useQuery();

  // 添加银行卡
  const addBankCardMutation = trpc.paymentAccounts.addBankCard.useMutation({
    onSuccess: () => {
      toast.success("银行卡添加成功");
      setIsBankCardDialogOpen(false);
      resetBankCardForm();
      refetchBankCards();
    },
    onError: (error) => {
      toast.error(`添加失败: ${error.message}`);
    },
  });

  // 更新银行卡
  const updateBankCardMutation = trpc.paymentAccounts.updateBankCard.useMutation({
    onSuccess: () => {
      toast.success("银行卡更新成功");
      setIsBankCardDialogOpen(false);
      resetBankCardForm();
      refetchBankCards();
    },
    onError: (error) => {
      toast.error(`更新失败: ${error.message}`);
    },
  });

  // 删除银行卡
  const deleteBankCardMutation = trpc.paymentAccounts.deleteBankCard.useMutation({
    onSuccess: () => {
      toast.success("银行卡删除成功");
      refetchBankCards();
    },
    onError: (error) => {
      toast.error(`删除失败: ${error.message}`);
    },
  });

  // 设置默认银行卡
  const setDefaultBankCardMutation = trpc.paymentAccounts.setDefaultBankCard.useMutation({
    onSuccess: () => {
      toast.success("已设置为默认银行卡");
      refetchBankCards();
    },
    onError: (error) => {
      toast.error(`设置失败: ${error.message}`);
    },
  });

  // 添加数字钱包
  const addWalletMutation = trpc.paymentAccounts.addDigitalWallet.useMutation({
    onSuccess: () => {
      toast.success("数字钱包添加成功");
      setIsWalletDialogOpen(false);
      resetWalletForm();
      refetchWallets();
    },
    onError: (error) => {
      toast.error(`添加失败: ${error.message}`);
    },
  });

  // 更新数字钱包
  const updateWalletMutation = trpc.paymentAccounts.updateDigitalWallet.useMutation({
    onSuccess: () => {
      toast.success("数字钱包更新成功");
      setIsWalletDialogOpen(false);
      resetWalletForm();
      refetchWallets();
    },
    onError: (error) => {
      toast.error(`更新失败: ${error.message}`);
    },
  });

  // 删除数字钱包
  const deleteWalletMutation = trpc.paymentAccounts.deleteDigitalWallet.useMutation({
    onSuccess: () => {
      toast.success("数字钱包删除成功");
      refetchWallets();
    },
    onError: (error) => {
      toast.error(`删除失败: ${error.message}`);
    },
  });

  // 设置默认数字钱包
  const setDefaultWalletMutation = trpc.paymentAccounts.setDefaultDigitalWallet.useMutation({
    onSuccess: () => {
      toast.success("已设置为默认数字钱包");
      refetchWallets();
    },
    onError: (error) => {
      toast.error(`设置失败: ${error.message}`);
    },
  });

  // 重置银行卡表单
  const resetBankCardForm = () => {
    setBankCardForm({
      cardNumber: "",
      cardHolder: "",
      bankName: "",
      cardType: "debit",
      notes: "",
    });
    setEditingBankCard(null);
  };

  // 重置钱包表单
  const resetWalletForm = () => {
    setWalletForm({
      walletType: "blockchain",
      network: "",
      walletAddress: "",
      currency: "",
      account: "",
      accountName: "",
      notes: "",
    });
    setEditingWallet(null);
  };

  // 打开添加银行卡对话框
  const handleAddBankCard = () => {
    resetBankCardForm();
    setIsBankCardDialogOpen(true);
  };

  // 打开编辑银行卡对话框
  const handleEditBankCard = (card: any) => {
    setEditingBankCard(card);
    setBankCardForm({
      cardNumber: card.cardNumber,
      cardHolder: card.cardHolder,
      bankName: card.bankName,
      cardType: card.cardType,
      notes: card.notes || "",
    });
    setIsBankCardDialogOpen(true);
  };

  // 提交银行卡表单
  const handleSubmitBankCard = () => {
    if (!bankCardForm.cardNumber || !bankCardForm.cardHolder || !bankCardForm.bankName) {
      toast.error("请填写完整信息");
      return;
    }

    // 先打开确认对话框
    setIsBankCardConfirmOpen(true);
  };

  // 确认提交银行卡
  const handleConfirmBankCard = () => {
    if (editingBankCard) {
      updateBankCardMutation.mutate({
        cardId: editingBankCard.id,
        ...bankCardForm,
      });
    } else {
      addBankCardMutation.mutate(bankCardForm);
    }
    setIsBankCardConfirmOpen(false);
  };

  // 删除银行卡
  const handleDeleteBankCard = (cardId: string) => {
    if (confirm("确定要删除这张银行卡吗？")) {
      deleteBankCardMutation.mutate({ cardId });
    }
  };

  // 设置默认银行卡
  const handleSetDefaultBankCard = (cardId: string) => {
    setDefaultBankCardMutation.mutate({ cardId });
  };

  // 打开添加钱包对话框
  const handleAddWallet = () => {
    resetWalletForm();
    setIsWalletDialogOpen(true);
  };

  // 打开编辑钱包对话框
  const handleEditWallet = (wallet: any) => {
    setEditingWallet(wallet);
    setWalletForm({
      walletType: wallet.walletType,
      network: wallet.network || "",
      walletAddress: wallet.walletAddress || "",
      currency: wallet.currency || "",
      account: wallet.account || "",
      accountName: wallet.accountName || "",
      notes: wallet.notes || "",
    });
    setIsWalletDialogOpen(true);
  };

  // 提交钱包表单
  const handleSubmitWallet = () => {
    // 根据钱包类型验证必填字段
    if (walletForm.walletType === "blockchain") {
      if (!walletForm.network || !walletForm.walletAddress || !walletForm.currency) {
        toast.error("请填写完整的区块链钱包信息");
        return;
      }
    } else if (walletForm.walletType === "binance") {
      if (!walletForm.account) {
        toast.error("请填写币安交易所 ID");
        return;
      }
      if (!/^\d{9}$/.test(walletForm.account.trim())) {
        toast.error("币安 ID 必须为 9 位纯数字，请检查后重新输入");
        return;
      }
    } else if (walletForm.walletType === "okx") {
      if (!walletForm.account) {
        toast.error("请填写欧易 UID");
        return;
      }
      if (!/^\d{8,12}$/.test(walletForm.account.trim())) {
        toast.error("欧易 UID 必须为 8～12 位纯数字，请检查后重新输入");
        return;
      }
    } else if (walletForm.walletType === "wechat") {
      if (!walletForm.account) {
        toast.error("请填写微信号");
        return;
      }
    } else if (walletForm.walletType === "alipay") {
      if (!walletForm.account) {
        toast.error("请填写支付宝账号");
        return;
      }
    }
    // 先打开确认对话框
    setIsWalletConfirmOpen(true);
  };

  // 确认提交钱包
  const handleConfirmWallet = () => {
    if (editingWallet) {
      updateWalletMutation.mutate({
        walletId: editingWallet.id,
        ...walletForm,
      });
    } else {
      addWalletMutation.mutate(walletForm);
    }
    setIsWalletConfirmOpen(false);
  };

  // 删除钱包
  const handleDeleteWallet = (walletId: string) => {
    if (confirm("确定要删除这个数字钱包吗？")) {
      deleteWalletMutation.mutate({ walletId });
    }
  };

  // 设置默认钱包
  const handleSetDefaultWallet = (walletId: string) => {
    setDefaultWalletMutation.mutate({ walletId });
  };

  // 脱敏显示卡号（显示前4位和后4位）
  const maskCardNumber = (cardNumber: string, show: boolean) => {
    if (show) return cardNumber;
    if (cardNumber.length <= 8) return "****";
    return `${cardNumber.slice(0, 4)} **** **** ${cardNumber.slice(-4)}`;
  };

  // 脱敏显示钱包地址（显示前6位和后4位）
  const maskWalletAddress = (address: string, show: boolean) => {
    if (show) return address;
    if (address.length <= 10) return "******";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航栏 */}
      {!hideHeader && (
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => navigate("/parent/profile")}
              className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">支付账户管理</h1>
            <div className="w-9" />
          </div>
        </div>
      )}

      {/* 标签页切换 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex border-t border-gray-200">
          <button
            onClick={() => setActiveTab("bank")}
            className={`flex-1 py-3 text-center text-sm font-medium transition-colors ${
              activeTab === "bank"
                ? "text-[#D32F2F] border-b-2 border-[#D32F2F]"
                : "text-gray-500"
            }`}
          >
            <CreditCard className="w-4 h-4 inline-block mr-1" />
            银行卡
          </button>
          <button
            onClick={() => setActiveTab("wechat")}
            className={`flex-1 py-3 text-center text-sm font-medium transition-colors ${
              activeTab === "wechat"
                ? "text-[#D32F2F] border-b-2 border-[#D32F2F]"
                : "text-gray-500"
            }`}
          >
            微信
          </button>
          <button
            onClick={() => setActiveTab("alipay")}
            className={`flex-1 py-3 text-center text-sm font-medium transition-colors ${
              activeTab === "alipay"
                ? "text-[#D32F2F] border-b-2 border-[#D32F2F]"
                : "text-gray-500"
            }`}
          >
            支付宝
          </button>
          <button
            onClick={() => setActiveTab("blockchain")}
            className={`flex-1 py-3 text-center text-sm font-medium transition-colors ${
              activeTab === "blockchain"
                ? "text-[#D32F2F] border-b-2 border-[#D32F2F]"
                : "text-gray-500"
            }`}
          >
            区块链
          </button>
        </div>
      </div>

      {/* 银行卡列表 */}
      {activeTab === "bank" && (
        <div className="p-4 space-y-3">
          {bankCards.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <CreditCard className="w-16 h-16 mx-auto mb-3 opacity-30" />
              <p>暂无银行卡</p>
            </div>
          ) : (
            bankCards.map((card) => {
              const bankConfig = getBankConfig(card.bankName);
              return (
              <div
                key={card.id}
                className="relative overflow-hidden rounded-xl shadow-lg"
              >
                {/* 渐变背景 */}
                <div className={`bg-gradient-to-br ${bankConfig.gradient} p-5`}>
                  {/* 顶部：银行名和默认标记 */}
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h3 className={`font-bold text-lg ${bankConfig.textColor}`}>
                        {card.bankName}
                      </h3>
                      <p className={`text-xs ${bankConfig.textColor} opacity-80`}>
                        {card.cardType === "debit" ? "借记卡" : "信用卡"}
                      </p>
                    </div>
                    {card.isDefault === 1 && (
                      <span className="flex items-center gap-1 text-xs bg-white/20 backdrop-blur-sm text-white px-2 py-1 rounded-full">
                        <Star className="w-3 h-3 fill-current" />
                        默认
                      </span>
                    )}
                  </div>

                  {/* 卡号 */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between">
                      <span className={`text-xl font-mono tracking-wider ${bankConfig.textColor}`}>
                        {maskCardNumber(card.cardNumber, showCardNumber[card.id])}
                      </span>
                      <button
                        onClick={() =>
                          setShowCardNumber((prev) => ({ ...prev, [card.id]: !prev[card.id] }))
                        }
                        className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
                      >
                        {showCardNumber[card.id] ? (
                          <EyeOff className={`w-4 h-4 ${bankConfig.textColor}`} />
                        ) : (
                          <Eye className={`w-4 h-4 ${bankConfig.textColor}`} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* 持卡人 */}
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${bankConfig.textColor} opacity-70`}>持卡人</span>
                    <span className={`text-sm font-medium ${bankConfig.textColor}`}>{card.cardHolder}</span>
                  </div>
                </div>

                {/* 底部操作栏（白色背景） */}
                <div className="bg-white p-4">
                  {card.notes && (
                    <div className="text-sm text-gray-500 mb-3 pb-3 border-b">
                      备注: {card.notes}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetDefaultBankCard(card.id)}
                      disabled={card.isDefault === 1}
                      className="flex-1"
                    >
                      <Star className={`w-4 h-4 mr-1 ${card.isDefault === 1 ? "fill-current" : ""}`} />
                      {card.isDefault === 1 ? "已设为默认" : "设为默认"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditBankCard(card)}
                      className="flex-1"
                    >
                      编辑
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteBankCard(card.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
            })
          )}

          <Button
            onClick={handleAddBankCard}
            className="w-full bg-[#D32F2F] hover:bg-[#B71C1C] text-white"
          >
            <Plus className="w-5 h-5 mr-1" />
            添加银行卡
          </Button>
        </div>
      )}

      {/* 微信支付列表 */}
      {activeTab === "wechat" && (
        <div className="p-4 space-y-3">
          {digitalWallets.filter(w => w.walletType === "wechat").length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Wallet className="w-16 h-16 mx-auto mb-3 opacity-30" />
              <p>暂无微信收款账号</p>
            </div>
          ) : (
            digitalWallets.filter(w => w.walletType === "wechat").map((wallet) => (
              <div
                key={wallet.id}
                className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">微信支付</h3>
                      {wallet.isDefault === 1 && (
                        <span className="flex items-center gap-1 text-xs bg-[#D32F2F] text-white px-2 py-0.5 rounded">
                          <Star className="w-3 h-3 fill-current" />
                          默认
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleSetDefaultWallet(wallet.id)}
                    disabled={wallet.isDefault === 1}
                    className={`p-1.5 rounded ${
                      wallet.isDefault === 1
                        ? "text-[#D32F2F]"
                        : "text-gray-400 hover:text-[#D32F2F] hover:bg-gray-100"
                    }`}
                  >
                    <Star className={`w-5 h-5 ${wallet.isDefault === 1 ? "fill-current" : ""}`} />
                  </button>
                </div>
                <div className="space-y-2 mb-3">
                  {wallet.account && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">微信号</span>
                      <span className="text-sm font-medium">{wallet.account}</span>
                    </div>
                  )}
                  {wallet.accountName && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">姓名</span>
                      <span className="text-sm font-medium">{wallet.accountName}</span>
                    </div>
                  )}
                  {wallet.notes && (
                    <div className="text-sm text-gray-500 pt-1 border-t">备注: {wallet.notes}</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleEditWallet(wallet)} className="flex-1">编辑</Button>
                  <Button variant="outline" size="sm" onClick={() => handleDeleteWallet(wallet.id)} className="text-red-600 hover:text-red-700 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            ))
          )}
          <Button
            onClick={() => { resetWalletForm(); setWalletForm({ ...walletForm, walletType: "wechat" }); setIsWalletDialogOpen(true); }}
            className="w-full bg-[#D32F2F] hover:bg-[#B71C1C] text-white"
          >
            <Plus className="w-5 h-5 mr-1" />
            添加微信收款
          </Button>
        </div>
      )}

      {/* 支付宝列表 */}
      {activeTab === "alipay" && (
        <div className="p-4 space-y-3">
          {digitalWallets.filter(w => w.walletType === "alipay").length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Wallet className="w-16 h-16 mx-auto mb-3 opacity-30" />
              <p>暂无支付宝收款账号</p>
            </div>
          ) : (
            digitalWallets.filter(w => w.walletType === "alipay").map((wallet) => (
              <div
                key={wallet.id}
                className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">支付宝</h3>
                      {wallet.isDefault === 1 && (
                        <span className="flex items-center gap-1 text-xs bg-[#D32F2F] text-white px-2 py-0.5 rounded">
                          <Star className="w-3 h-3 fill-current" />
                          默认
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleSetDefaultWallet(wallet.id)}
                    disabled={wallet.isDefault === 1}
                    className={`p-1.5 rounded ${
                      wallet.isDefault === 1
                        ? "text-[#D32F2F]"
                        : "text-gray-400 hover:text-[#D32F2F] hover:bg-gray-100"
                    }`}
                  >
                    <Star className={`w-5 h-5 ${wallet.isDefault === 1 ? "fill-current" : ""}`} />
                  </button>
                </div>
                <div className="space-y-2 mb-3">
                  {wallet.account && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">支付宝账号</span>
                      <span className="text-sm font-medium">{wallet.account}</span>
                    </div>
                  )}
                  {wallet.accountName && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">姓名</span>
                      <span className="text-sm font-medium">{wallet.accountName}</span>
                    </div>
                  )}
                  {wallet.notes && (
                    <div className="text-sm text-gray-500 pt-1 border-t">备注: {wallet.notes}</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleEditWallet(wallet)} className="flex-1">编辑</Button>
                  <Button variant="outline" size="sm" onClick={() => handleDeleteWallet(wallet.id)} className="text-red-600 hover:text-red-700 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            ))
          )}
          <Button
            onClick={() => { resetWalletForm(); setWalletForm({ ...walletForm, walletType: "alipay" }); setIsWalletDialogOpen(true); }}
            className="w-full bg-[#D32F2F] hover:bg-[#B71C1C] text-white"
          >
            <Plus className="w-5 h-5 mr-1" />
            添加支付宝收款
          </Button>
        </div>
      )}

      {/* 区块链钱包列表 */}
      {activeTab === "blockchain" && (
        <div className="p-4 space-y-3">
          {digitalWallets.filter(w => w.walletType === "blockchain").length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Wallet className="w-16 h-16 mx-auto mb-3 opacity-30" />
              <p>暂无区块链钱包</p>
            </div>
          ) : (
            digitalWallets.filter(w => w.walletType === "blockchain").map((wallet) => (
              <div
                key={wallet.id}
                className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">区块链钱包</h3>
                      {wallet.isDefault === 1 && (
                        <span className="flex items-center gap-1 text-xs bg-[#D32F2F] text-white px-2 py-0.5 rounded">
                          <Star className="w-3 h-3 fill-current" />
                          默认
                        </span>
                      )}
                    </div>
                    {wallet.walletType === "blockchain" && wallet.network && (
                      <p className="text-sm text-gray-500">{wallet.network}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleSetDefaultWallet(wallet.id)}
                    disabled={wallet.isDefault === 1}
                    className={`p-1.5 rounded ${
                      wallet.isDefault === 1
                        ? "text-[#D32F2F]"
                        : "text-gray-400 hover:text-[#D32F2F] hover:bg-gray-100"
                    }`}
                  >
                    <Star className={`w-5 h-5 ${wallet.isDefault === 1 ? "fill-current" : ""}`} />
                  </button>
                </div>

                <div className="space-y-2 mb-3">
                  {wallet.walletType === "blockchain" && (
                    <>
                      {wallet.currency && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">币种</span>
                          <span className="text-sm font-medium">{wallet.currency}</span>
                        </div>
                      )}
                      {wallet.walletAddress && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">地址</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono text-right max-w-[200px] truncate">
                              {maskWalletAddress(wallet.walletAddress, showWalletAddress[wallet.id])}
                            </span>
                            <button
                              onClick={() =>
                                setShowWalletAddress((prev) => ({
                                  ...prev,
                                  [wallet.id]: !prev[wallet.id],
                                }))
                              }
                              className="p-1 hover:bg-gray-100 rounded"
                            >
                              {showWalletAddress[wallet.id] ? (
                                <EyeOff className="w-4 h-4 text-gray-400" />
                              ) : (
                                <Eye className="w-4 h-4 text-gray-400" />
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {(wallet.walletType === "alipay" || wallet.walletType === "wechat") && (
                    <>
                      {wallet.account && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">账号</span>
                          <span className="text-sm">{wallet.account}</span>
                        </div>
                      )}
                      {wallet.accountName && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">姓名</span>
                          <span className="text-sm">{wallet.accountName}</span>
                        </div>
                      )}
                    </>
                  )}
                  {wallet.notes && (
                    <div className="text-sm text-gray-500 pt-1 border-t">
                      备注: {wallet.notes}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditWallet(wallet)}
                    className="flex-1"
                  >
                    编辑
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteWallet(wallet.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}

          <Button
            onClick={() => {
              resetWalletForm();
              setWalletForm({ ...walletForm, walletType: "blockchain" });
              setIsWalletDialogOpen(true);
            }}
            className="w-full bg-[#D32F2F] hover:bg-[#B71C1C] text-white"
          >
            <Plus className="w-5 h-5 mr-1" />
            添加区块链钱包
          </Button>
        </div>
      )}

      {/* 银行卡编辑对话框 */}
      <Dialog open={isBankCardDialogOpen} onOpenChange={setIsBankCardDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBankCard ? "编辑银行卡" : "添加银行卡"}</DialogTitle>
            <DialogDescription>请填写银行卡信息</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cardNumber">卡号 *</Label>
              <Input
                id="cardNumber"
                value={bankCardForm.cardNumber}
                onChange={(e) =>
                  setBankCardForm({ ...bankCardForm, cardNumber: e.target.value })
                }
                placeholder="请输入银行卡号"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cardHolder">持卡人姓名 *</Label>
              <Input
                id="cardHolder"
                value={bankCardForm.cardHolder}
                onChange={(e) =>
                  setBankCardForm({ ...bankCardForm, cardHolder: e.target.value })
                }
                placeholder="请输入持卡人姓名"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bankName">开户行 *</Label>
              <Input
                id="bankName"
                value={bankCardForm.bankName}
                onChange={(e) =>
                  setBankCardForm({ ...bankCardForm, bankName: e.target.value })
                }
                placeholder="例如：中国工商银行"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cardType">卡类型</Label>
              <Select
                value={bankCardForm.cardType}
                onValueChange={(value: "debit" | "credit") =>
                  setBankCardForm({ ...bankCardForm, cardType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">借记卡</SelectItem>
                  <SelectItem value="credit">信用卡</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">备注</Label>
              <Textarea
                id="notes"
                value={bankCardForm.notes}
                onChange={(e) =>
                  setBankCardForm({ ...bankCardForm, notes: e.target.value })
                }
                placeholder="选填"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsBankCardDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              onClick={handleSubmitBankCard}
              disabled={addBankCardMutation.isPending || updateBankCardMutation.isPending}
              className="bg-[#D32F2F] hover:bg-[#B71C1C]"
            >
              {(addBankCardMutation.isPending || updateBankCardMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editingBankCard ? "更新" : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 数字钱包编辑对话框 */}
      <Dialog open={isWalletDialogOpen} onOpenChange={setIsWalletDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingWallet ? "编辑数字钱包" : "添加数字钱包"}</DialogTitle>
            <DialogDescription>请填写数字钱包信息</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* 微信/支付宝类型不显示类型选择器，区块链类型才显示 */}
            {(walletForm.walletType === "blockchain" || walletForm.walletType === "binance" || walletForm.walletType === "okx") && (
              <div className="space-y-2">
                <Label htmlFor="walletType">钱包类型 *</Label>
                <Select
                  value={walletForm.walletType}
                  onValueChange={(value: any) =>
                    setWalletForm({ ...walletForm, walletType: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blockchain">区块链钱包</SelectItem>
                    <SelectItem value="binance">币安账户</SelectItem>
                    <SelectItem value="okx">欧易账户</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 微信输入字段 */}
            {walletForm.walletType === "wechat" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="account">微信号 *</Label>
                  <Input
                    id="account"
                    value={walletForm.account}
                    onChange={(e) =>
                      setWalletForm({ ...walletForm, account: e.target.value })
                    }
                    placeholder="请输入微信号"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountName">姓名</Label>
                  <Input
                    id="accountName"
                    value={walletForm.accountName}
                    onChange={(e) =>
                      setWalletForm({ ...walletForm, accountName: e.target.value })
                    }
                    placeholder="选填，如：张三"
                  />
                </div>
              </>
            )}

            {/* 支付宝输入字段 */}
            {walletForm.walletType === "alipay" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="account">支付宝账号 *</Label>
                  <Input
                    id="account"
                    value={walletForm.account}
                    onChange={(e) =>
                      setWalletForm({ ...walletForm, account: e.target.value })
                    }
                    placeholder="请输入支付宝账号（手机号或邮筱）"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountName">姓名</Label>
                  <Input
                    id="accountName"
                    value={walletForm.accountName}
                    onChange={(e) =>
                      setWalletForm({ ...walletForm, accountName: e.target.value })
                    }
                    placeholder="选填，如：张三"
                  />
                </div>
              </>
            )}

            {walletForm.walletType === "blockchain" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="network">网络 *</Label>
                  <Select
                    value={walletForm.network}
                    onValueChange={(value) =>
                      setWalletForm({ ...walletForm, network: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="请选择区块链网络" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {BLOCKCHAIN_NETWORKS.map((network) => (
                        <SelectItem key={network.code} value={network.code}>
                          <div className="flex flex-col">
                            <span className="font-medium">{network.name}</span>
                            <span className="text-xs text-gray-500">
                              {network.time} · 最小 {network.minAmount}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="walletAddress">钱包地址 *</Label>
                  <Input
                    id="walletAddress"
                    value={walletForm.walletAddress}
                    onChange={(e) =>
                      setWalletForm({ ...walletForm, walletAddress: e.target.value })
                    }
                    placeholder="请输入钱包地址"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="currency">币种 *</Label>
                  <Select
                    value={walletForm.currency}
                    onValueChange={(value) =>
                      setWalletForm({ ...walletForm, currency: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="请选择加密货币" />
                    </SelectTrigger>
                    <SelectContent>
                      {CRYPTOCURRENCIES.map((crypto) => (
                        <SelectItem key={crypto.code} value={crypto.code}>
                          <div className="flex flex-col">
                            <span className="font-medium">{crypto.name}</span>
                            <span className="text-xs text-gray-500">{crypto.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {walletForm.walletType === "binance" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="account">交易所 ID *</Label>
                  <Input
                    id="account"
                    value={walletForm.account}
                    onChange={(e) =>
                      setWalletForm({ ...walletForm, account: e.target.value })
                    }
                    placeholder="请输入 9 位币安 ID"
                    maxLength={9}
                    inputMode="numeric"
                  />
                  <p className="text-xs text-gray-400">币安 ID 为 9 位纯数字，可在币安 App 个人中心查看</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="accountName">备注名</Label>
                  <Input
                    id="accountName"
                    value={walletForm.accountName}
                    onChange={(e) =>
                      setWalletForm({ ...walletForm, accountName: e.target.value })
                    }
                    placeholder="选填，如：张三的币安"
                  />
                </div>
              </>
            )}

            {walletForm.walletType === "okx" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="account">UID 账号 *</Label>
                  <Input
                    id="account"
                    value={walletForm.account}
                    onChange={(e) =>
                      setWalletForm({ ...walletForm, account: e.target.value })
                    }
                    placeholder="请输入 8～12 位欧易 UID"
                    maxLength={12}
                    inputMode="numeric"
                  />
                  <p className="text-xs text-gray-400">欧易 UID 为 8～12 位纯数字，可在欧易 App 个人中心查看</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="accountName">备注名</Label>
                  <Input
                    id="accountName"
                    value={walletForm.accountName}
                    onChange={(e) =>
                      setWalletForm({ ...walletForm, accountName: e.target.value })
                    }
                    placeholder="选填，如：张三的欧易"
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="walletNotes">备注</Label>
              <Textarea
                id="walletNotes"
                value={walletForm.notes}
                onChange={(e) =>
                  setWalletForm({ ...walletForm, notes: e.target.value })
                }
                placeholder="选填"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsWalletDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              onClick={handleSubmitWallet}
              disabled={addWalletMutation.isPending || updateWalletMutation.isPending}
              className="bg-[#D32F2F] hover:bg-[#B71C1C]"
            >
              {(addWalletMutation.isPending || updateWalletMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editingWallet ? "更新" : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 银行卡确认对话框 */}
      <Dialog open={isBankCardConfirmOpen} onOpenChange={setIsBankCardConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-orange-600">⚠️ 温馨提示</DialogTitle>
            <DialogDescription>
              请仔细核对以下信息，一旦填写错误，可能会造成财物损失！
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4 bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between">
              <span className="text-gray-600">开户行：</span>
              <span className="font-medium">{bankCardForm.bankName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">持卡人：</span>
              <span className="font-medium">{bankCardForm.cardHolder}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">卡号：</span>
              <span className="font-medium font-mono">{bankCardForm.cardNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">卡类型：</span>
              <span className="font-medium">{bankCardForm.cardType === "debit" ? "借记卡" : "信用卡"}</span>
            </div>
            {bankCardForm.notes && (
              <div className="flex justify-between">
                <span className="text-gray-600">备注：</span>
                <span className="font-medium">{bankCardForm.notes}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsBankCardConfirmOpen(false)}
            >
              返回修改
            </Button>
            <Button
              onClick={handleConfirmBankCard}
              disabled={addBankCardMutation.isPending || updateBankCardMutation.isPending}
              className="bg-[#D32F2F] hover:bg-[#B71C1C]"
            >
              {(addBankCardMutation.isPending || updateBankCardMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              确认{editingBankCard ? "更新" : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 数字钱包确认对话框 */}
      <Dialog open={isWalletConfirmOpen} onOpenChange={setIsWalletConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-orange-600">⚠️ 温馨提示</DialogTitle>
            <DialogDescription>
              请仔细核对以下信息，一旦填写错误，可能会造成财物损失！
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4 bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between">
              <span className="text-gray-600">钱包类型：</span>
              <span className="font-medium">
                {walletForm.walletType === "blockchain" && "区块链钱包"}
                {walletForm.walletType === "binance" && "币安账户"}
                {walletForm.walletType === "okx" && "欧易账户"}
              </span>
            </div>
            
            {walletForm.walletType === "blockchain" && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600">网络：</span>
                  <span className="font-medium">{walletForm.network}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">币种：</span>
                  <span className="font-medium">{walletForm.currency}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-gray-600">钱包地址：</span>
                  <span className="font-medium font-mono text-right break-all max-w-[200px]">{walletForm.walletAddress}</span>
                </div>
              </>
            )}
            
            {walletForm.walletType === "binance" && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600">交易所 ID：</span>
                  <span className="font-medium font-mono">{walletForm.account}</span>
                </div>
                {walletForm.accountName && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">备注名：</span>
                    <span className="font-medium">{walletForm.accountName}</span>
                  </div>
                )}
              </>
            )}

            {walletForm.walletType === "okx" && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600">UID 账号：</span>
                  <span className="font-medium font-mono">{walletForm.account}</span>
                </div>
                {walletForm.accountName && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">备注名：</span>
                    <span className="font-medium">{walletForm.accountName}</span>
                  </div>
                )}
              </>
            )}
            
            {walletForm.notes && (
              <div className="flex justify-between">
                <span className="text-gray-600">备注：</span>
                <span className="font-medium">{walletForm.notes}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsWalletConfirmOpen(false)}
            >
              返回修改
            </Button>
            <Button
              onClick={handleConfirmWallet}
              disabled={addWalletMutation.isPending || updateWalletMutation.isPending}
              className="bg-[#D32F2F] hover:bg-[#B71C1C]"
            >
              {(addWalletMutation.isPending || updateWalletMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              确认{editingWallet ? "更新" : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
