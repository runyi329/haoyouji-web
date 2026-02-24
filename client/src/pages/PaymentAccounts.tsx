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

type TabType = "bank" | "wallet";

// 加密货币配置
const CRYPTOCURRENCIES = [
  { code: "USDT", name: "USDT (Tether)", description: "稳定币" },
  { code: "USDC", name: "USDC (USD Coin)", description: "稳定币" },
  { code: "BTC", name: "BTC (Bitcoin)", description: "比特币" },
  { code: "ETH", name: "ETH (Ethereum)", description: "以太币" },
  { code: "SOL", name: "SOL (Solana)", description: "Solana代币" },
];

// 区块链网络配置
const BLOCKCHAIN_NETWORKS = [
  { code: "TRC20", name: "Tron (TRC20)", time: "约1分钟", minAmount: "0.01 USDT" },
  { code: "ERC20", name: "Ethereum (ERC20)", time: "约2-7分钟", minAmount: "0.001 USDT" },
  { code: "BEP20", name: "BNB Smart Chain (BEP20)", time: "约1分钟", minAmount: "0.01 USDT" },
  { code: "POLYGON", name: "Polygon", time: "约3分钟", minAmount: "0.01 USDT" },
  { code: "ARBITRUM", name: "Arbitrum One", time: "约1-18分钟", minAmount: "0.001 USDT" },
  { code: "OPTIMISM", name: "Optimism", time: "约1-25分钟", minAmount: "0.001 USDT" },
  { code: "AVALANCHE", name: "Avalanche C-Chain", time: "约1分钟", minAmount: "0.01 USDT" },
  { code: "SOLANA", name: "Solana", time: "约1分钟", minAmount: "0.001 USDT" },
  { code: "TON", name: "The Open Network (TON)", time: "约1分钟", minAmount: "0.001 USDT" },
  { code: "APTOS", name: "Aptos", time: "约1分钟", minAmount: "0.01 USDT" },
  { code: "NEAR", name: "NEAR Protocol", time: "约1分钟", minAmount: "0.001 USDT" },
  { code: "PLASMA", name: "Plasma", time: "约1分钟", minAmount: "0.000001 USDT" },
  { code: "XLAYER", name: "X Layer", time: "约1分钟", minAmount: "0.01 USDT" },
  { code: "BERACHAIN", name: "Berachain", time: "约2分钟", minAmount: "0.01 USDT" },
  { code: "UNICHAIN", name: "Unichain", time: "约25分钟", minAmount: "0.01 USDT" },
  { code: "OKT", name: "OKT Chain", time: "约2分钟", minAmount: "0.01 USDT" },
  { code: "OPBNB", name: "opBNB", time: "约1分钟", minAmount: "0.001 USDT" },
  { code: "KAIA", name: "Kaia", time: "约1分钟", minAmount: "0.000001 USDT" },
  { code: "SCROLL", name: "Scroll", time: "约1分钟", minAmount: "0.000001 USDT" },
  { code: "DOT", name: "Asset Hub Polkadot", time: "约1分钟", minAmount: "0.02 USDT" },
  { code: "KAVAEVM", name: "KAVAEVM", time: "约1分钟", minAmount: "0.001 USDT" },
  { code: "XTZ", name: "Tezos", time: "约1分钟", minAmount: "0.001 USDT" },
  { code: "AVAXC", name: "AVAX C-Chain", time: "约1分钟", minAmount: "0.001 USDT" },
  { code: "CELO", name: "CELO", time: "约13分钟", minAmount: "0.001 USDT" },
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

export default function PaymentAccounts() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>("bank");
  
  // 银行卡相关状态
  const [isBankCardDialogOpen, setIsBankCardDialogOpen] = useState(false);
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
  const [editingWallet, setEditingWallet] = useState<any>(null);
  const [showWalletAddress, setShowWalletAddress] = useState<Record<string, boolean>>({});
  const [walletForm, setWalletForm] = useState({
    walletType: "blockchain" as "blockchain" | "alipay" | "wechat" | "other",
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

    if (editingBankCard) {
      updateBankCardMutation.mutate({
        cardId: editingBankCard.id,
        ...bankCardForm,
      });
    } else {
      addBankCardMutation.mutate(bankCardForm);
    }
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
    } else if (walletForm.walletType === "alipay" || walletForm.walletType === "wechat") {
      if (!walletForm.account || !walletForm.accountName) {
        toast.error("请填写完整的账户信息");
        return;
      }
    }

    if (editingWallet) {
      updateWalletMutation.mutate({
        walletId: editingWallet.id,
        ...walletForm,
      });
    } else {
      addWalletMutation.mutate(walletForm);
    }
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

        {/* 标签页切换 */}
        <div className="flex border-t border-gray-200">
          <button
            onClick={() => setActiveTab("bank")}
            className={`flex-1 py-3 text-center font-medium transition-colors ${
              activeTab === "bank"
                ? "text-[#D32F2F] border-b-2 border-[#D32F2F]"
                : "text-gray-500"
            }`}
          >
            <CreditCard className="w-5 h-5 inline-block mr-1" />
            银行卡
          </button>
          <button
            onClick={() => setActiveTab("wallet")}
            className={`flex-1 py-3 text-center font-medium transition-colors ${
              activeTab === "wallet"
                ? "text-[#D32F2F] border-b-2 border-[#D32F2F]"
                : "text-gray-500"
            }`}
          >
            <Wallet className="w-5 h-5 inline-block mr-1" />
            数字钱包
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

      {/* 数字钱包列表 */}
      {activeTab === "wallet" && (
        <div className="p-4 space-y-3">
          {digitalWallets.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Wallet className="w-16 h-16 mx-auto mb-3 opacity-30" />
              <p>暂无数字钱包</p>
            </div>
          ) : (
            digitalWallets.map((wallet) => (
              <div
                key={wallet.id}
                className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">
                        {wallet.walletType === "blockchain" && "区块链钱包"}
                        {wallet.walletType === "alipay" && "支付宝"}
                        {wallet.walletType === "wechat" && "微信支付"}
                        {wallet.walletType === "other" && "其他钱包"}
                      </h3>
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
            onClick={handleAddWallet}
            className="w-full bg-[#D32F2F] hover:bg-[#B71C1C] text-white"
          >
            <Plus className="w-5 h-5 mr-1" />
            添加数字钱包
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
                  <SelectItem value="alipay">支付宝</SelectItem>
                  <SelectItem value="wechat">微信支付</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>

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

            {(walletForm.walletType === "alipay" || walletForm.walletType === "wechat") && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="account">账号 *</Label>
                  <Input
                    id="account"
                    value={walletForm.account}
                    onChange={(e) =>
                      setWalletForm({ ...walletForm, account: e.target.value })
                    }
                    placeholder="手机号或账号"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="accountName">账户名 *</Label>
                  <Input
                    id="accountName"
                    value={walletForm.accountName}
                    onChange={(e) =>
                      setWalletForm({ ...walletForm, accountName: e.target.value })
                    }
                    placeholder="真实姓名"
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
    </div>
  );
}
