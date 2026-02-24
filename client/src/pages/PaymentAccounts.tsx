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
  MoreHorizontal,
} from "lucide-react";

type TabType = "bank" | "wallet";

// 银行配置：微信钱包风格
const BANK_CONFIGS: Record<string, { color: string; logo: string }> = {
  "工商银行": { color: "#C8524D", logo: "🏦" },
  "建设银行": { color: "#2B5F9E", logo: "🏦" },
  "农业银行": { color: "#1E8449", logo: "🌾" },
  "中国银行": { color: "#C8524D", logo: "🏦" },
  "招商银行": { color: "#C8524D", logo: "🏦" },
  "交通银行": { color: "#2B5F9E", logo: "🏦" },
  "邮储银行": { color: "#2E7D32", logo: "📬" },
  "民生银行": { color: "#00897B", logo: "🏦" },
  "中信银行": { color: "#C8524D", logo: "🏦" },
  "浦发银行": { color: "#1565C0", logo: "🏦" },
  "兴业银行": { color: "#1976D2", logo: "🏦" },
  "光大银行": { color: "#7B1FA2", logo: "✨" },
  "平安银行": { color: "#E65100", logo: "🛡️" },
  "华夏银行": { color: "#C62828", logo: "🏦" },
  "广发银行": { color: "#C8524D", logo: "🏦" },
  "北京银行": { color: "#C8524D", logo: "🏦" },
  // 默认样式
  "default": { color: "#757575", logo: "🏦" },
};

// 获取银行配置
const getBankConfig = (bankName: string) => {
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

  // 脱敏显示卡号（只显示后4位）
  const maskCardNumber = (cardNumber: string) => {
    if (cardNumber.length <= 4) return cardNumber;
    return cardNumber.slice(-4);
  };

  // 脱敏显示钱包地址（显示前6位和后4位）
  const maskWalletAddress = (address: string, show: boolean) => {
    if (show) return address;
    if (address.length <= 10) return "******";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate("/parent/profile")}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">
            {activeTab === "bank" ? "银行卡" : "数字钱包"}
          </h1>
          <button className="p-2 -mr-2 hover:bg-gray-100 rounded-full transition-colors">
            <MoreHorizontal className="w-5 h-5 text-gray-700" />
          </button>
        </div>

        {/* 标签页切换 */}
        <div className="flex border-t border-gray-200">
          <button
            onClick={() => setActiveTab("bank")}
            className={`flex-1 py-3 text-center font-medium transition-colors ${
              activeTab === "bank"
                ? "text-[#576B95] border-b-2 border-[#576B95]"
                : "text-gray-500"
            }`}
          >
            银行卡
          </button>
          <button
            onClick={() => setActiveTab("wallet")}
            className={`flex-1 py-3 text-center font-medium transition-colors ${
              activeTab === "wallet"
                ? "text-[#576B95] border-b-2 border-[#576B95]"
                : "text-gray-500"
            }`}
          >
            数字钱包
          </button>
        </div>
      </div>

      {/* 银行卡列表 - 微信钱包风格 */}
      {activeTab === "bank" && (
        <div className="p-4 space-y-3 pb-24">
          {bankCards.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <CreditCard className="w-16 h-16 mx-auto mb-3 opacity-30" />
              <p>暂无银行卡</p>
            </div>
          ) : (
            bankCards.map((card) => {
              const bankConfig = getBankConfig(card.bankName);
              const last4 = maskCardNumber(card.cardNumber);
              
              return (
                <div
                  key={card.id}
                  onClick={() => handleEditBankCard(card)}
                  className="relative overflow-hidden rounded-xl cursor-pointer active:opacity-90 transition-opacity"
                  style={{ backgroundColor: bankConfig.color }}
                >
                  {/* 背景水印 */}
                  <div 
                    className="absolute inset-0 flex items-center justify-center opacity-10"
                    style={{ fontSize: "180px" }}
                  >
                    {bankConfig.logo}
                  </div>

                  {/* 卡片内容 */}
                  <div className="relative p-5">
                    {/* 顶部：银行logo和名称 */}
                    <div className="flex items-center gap-3 mb-8">
                      <div className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center text-xl">
                        {bankConfig.logo}
                      </div>
                      <div>
                        <h3 className="text-white font-medium text-base">
                          {card.bankName}{card.cardType === "debit" ? "储蓄卡" : "信用卡"}
                        </h3>
                        {card.notes && (
                          <p className="text-white/70 text-xs mt-0.5">{card.notes}</p>
                        )}
                      </div>
                    </div>

                    {/* 卡号 */}
                    <div className="text-white text-2xl font-medium tracking-widest">
                      •••• •••• •••• {last4}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* 添加银行卡按钮 - 固定在底部 */}
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200">
            <Button
              onClick={handleAddBankCard}
              className="w-full bg-[#576B95] hover:bg-[#485A8C] text-white h-12 text-base"
            >
              <Plus className="w-5 h-5 mr-1" />
              添加银行卡
            </Button>
          </div>
        </div>
      )}

      {/* 数字钱包列表 */}
      {activeTab === "wallet" && (
        <div className="p-4 space-y-3 pb-24">
          {digitalWallets.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Wallet className="w-16 h-16 mx-auto mb-3 opacity-30" />
              <p>暂无数字钱包</p>
            </div>
          ) : (
            digitalWallets.map((wallet) => (
              <div
                key={wallet.id}
                onClick={() => handleEditWallet(wallet)}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 cursor-pointer active:bg-gray-50 transition-colors"
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
                        <span className="text-xs bg-[#576B95] text-white px-2 py-0.5 rounded">
                          默认
                        </span>
                      )}
                    </div>
                    {wallet.walletType === "blockchain" && wallet.network && (
                      <p className="text-sm text-gray-500">{wallet.network} · {wallet.currency}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {wallet.walletType === "blockchain" && wallet.walletAddress && (
                    <div className="text-sm text-gray-600 font-mono">
                      {maskWalletAddress(wallet.walletAddress, showWalletAddress[wallet.id])}
                    </div>
                  )}
                  {(wallet.walletType === "alipay" || wallet.walletType === "wechat") && (
                    <>
                      {wallet.account && (
                        <div className="text-sm text-gray-600">账号: {wallet.account}</div>
                      )}
                      {wallet.accountName && (
                        <div className="text-sm text-gray-600">姓名: {wallet.accountName}</div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))
          )}

          {/* 添加数字钱包按钮 - 固定在底部 */}
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200">
            <Button
              onClick={handleAddWallet}
              className="w-full bg-[#576B95] hover:bg-[#485A8C] text-white h-12 text-base"
            >
              <Plus className="w-5 h-5 mr-1" />
              添加数字钱包
            </Button>
          </div>
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

          <DialogFooter className="gap-2">
            {editingBankCard && (
              <Button
                variant="outline"
                onClick={() => handleDeleteBankCard(editingBankCard.id)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                删除
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setIsBankCardDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              onClick={handleSubmitBankCard}
              disabled={addBankCardMutation.isPending || updateBankCardMutation.isPending}
              className="bg-[#576B95] hover:bg-[#485A8C]"
            >
              {(addBankCardMutation.isPending || updateBankCardMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editingBankCard ? "保存" : "添加"}
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
                  <Input
                    id="network"
                    value={walletForm.network}
                    onChange={(e) =>
                      setWalletForm({ ...walletForm, network: e.target.value })
                    }
                    placeholder="例如：TRC20, ERC20, BEP20"
                  />
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
                  <Input
                    id="currency"
                    value={walletForm.currency}
                    onChange={(e) =>
                      setWalletForm({ ...walletForm, currency: e.target.value })
                    }
                    placeholder="例如：USDT, USDC, ETH, BTC"
                  />
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

          <DialogFooter className="gap-2">
            {editingWallet && (
              <Button
                variant="outline"
                onClick={() => handleDeleteWallet(editingWallet.id)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                删除
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setIsWalletDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              onClick={handleSubmitWallet}
              disabled={addWalletMutation.isPending || updateWalletMutation.isPending}
              className="bg-[#576B95] hover:bg-[#485A8C]"
            >
              {(addWalletMutation.isPending || updateWalletMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editingWallet ? "保存" : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
