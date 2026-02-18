import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

type PaymentMethod = "bank_card" | "digital_wallet" | "alipay" | "wechat" | null;

export default function ProfileEdit() {
  const [activeTab, setActiveTab] = useState<"basic" | "verification" | "payment" | "address">("basic");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 基本信息表单
  const [basicForm, setBasicForm] = useState({
    name: "",
    nickname: "",
    email: "",
    phone: "",
  });

  // 实名认证表单
  const [verificationForm, setVerificationForm] = useState({
    realName: "",
    idCardNumber: "",
    verificationStatus: "pending" as "pending" | "verified" | "rejected",
  });

  // 支付账号表单
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null);
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [hasSavedPayment, setHasSavedPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    // 银行卡
    bankName: "",
    bankAccountNumber: "",
    bankAccountName: "",
    // 数字钱包
    walletNetwork: "TRC20",
    digitalWalletAddress: "",
    walletQrCode: null as File | null,
    walletQrCodeUrl: "",
    // 数字钱包
    wechatQrCode: null as File | null,
    wechatQrCodeUrl: "",
    wechatAccountName: "",
  });

  // 收件地址列表
  const [addresses, setAddresses] = useState<any[]>([]);
  const [editingAddress, setEditingAddress] = useState<any | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);

  // 加载用户资料
  useEffect(() => {
    loadProfile();
    loadAddresses();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await fetch("/api/user/profile", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.basic) {
          setBasicForm(data.basic);
        }
        if (data.verification) {
          setVerificationForm(data.verification);
        }
        if (data.payment && data.payment.paymentMethod) {
          setPaymentMethod(data.payment.paymentMethod);
          setPaymentForm({
            ...paymentForm,
            ...data.payment,
          });
          setHasSavedPayment(true);
          setIsEditingPayment(false);
        }
      }
    } catch (error) {
      console.error("加载资料失败:", error);
    }
  };

  const loadAddresses = async () => {
    try {
      const res = await fetch("/api/user/addresses", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setAddresses(data.addresses || []);
      }
    } catch (error) {
      console.error("加载地址失败:", error);
    }
  };

  const handleSaveProfile = async () => {
    if (activeTab === "address") return;

    setSaving(true);
    try {
      const formData = new FormData();

      if (activeTab === "basic") {
        formData.append("data", JSON.stringify(basicForm));
      } else if (activeTab === "verification") {
        formData.append("data", JSON.stringify(verificationForm));
      } else if (activeTab === "payment") {
        const paymentData: any = { paymentMethod };
        
        if (paymentMethod === "bank_card") {
          paymentData.bankName = paymentForm.bankName;
          paymentData.bankAccountNumber = paymentForm.bankAccountNumber;
          paymentData.bankAccountName = paymentForm.bankAccountName;
        } else if (paymentMethod === "digital_wallet") {
          paymentData.walletNetwork = paymentForm.walletNetwork;
          paymentData.digitalWalletAddress = paymentForm.digitalWalletAddress;
          if (paymentForm.walletQrCode) {
            formData.append("walletQrCode", paymentForm.walletQrCode);
          }
        } else if (paymentMethod === "alipay") {
          if (paymentForm.alipayInputMethod === "account") {
            paymentData.alipayAccount = paymentForm.alipayAccount;
            paymentData.alipayAccountName = paymentForm.alipayAccountName;
          } else {
            paymentData.alipayAccountName = paymentForm.alipayAccountName;
            if (paymentForm.alipayQrCode) {
              formData.append("alipayQrCode", paymentForm.alipayQrCode);
            }
          }
        } else if (paymentMethod === "wechat") {
          paymentData.wechatAccountName = paymentForm.wechatAccountName;
          if (paymentForm.wechatQrCode) {
            formData.append("wechatQrCode", paymentForm.wechatQrCode);
          }
        }

        formData.append("data", JSON.stringify(paymentData));
      }

      const res = await fetch("/api/user/profile", {
        method: "PUT",
        credentials: "include",
        body: formData,
      });

      if (res.ok) {
        setMessage({ type: "success", text: "保存成功" });
        setTimeout(() => setMessage(null), 2000);
        
        // 如果是支付账号，保存成功后切换到只读模式
        if (activeTab === "payment") {
          setHasSavedPayment(true);
          setIsEditingPayment(false);
        }
      } else {
        setMessage({ type: "error", text: "保存失败" });
        setTimeout(() => setMessage(null), 2000);
      }
    } catch (error) {
      setMessage({ type: "error", text: "保存失败" });
      setTimeout(() => setMessage(null), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0];
    if (file) {
      setPaymentForm({
        ...paymentForm,
        [field]: file,
      });
    }
  };

  const handleEditPayment = () => {
    setIsEditingPayment(true);
  };

  const handleDeletePayment = async () => {
    if (!confirm("确定要删除支付账号信息吗？")) return;

    try {
      const res = await fetch("/api/user/profile/payment", {
        method: "DELETE",
        credentials: "include",
      });

      if (res.ok) {
        setPaymentMethod(null);
        setPaymentForm({
          bankName: "",
          bankAccountNumber: "",
          bankAccountName: "",
          walletNetwork: "TRC20",
          digitalWalletAddress: "",
          walletQrCode: null,
          walletQrCodeUrl: "",
          alipayAccount: "",
          alipayAccountName: "",
          alipayQrCode: null,
          alipayQrCodeUrl: "",
          alipayInputMethod: "account",
          wechatQrCode: null,
          wechatQrCodeUrl: "",
          wechatAccountName: "",
        });
        setHasSavedPayment(false);
        setIsEditingPayment(false);
        setMessage({ type: "success", text: "删除成功" });
        setTimeout(() => setMessage(null), 2000);
      }
    } catch (error) {
      setMessage({ type: "error", text: "删除失败" });
      setTimeout(() => setMessage(null), 2000);
    }
  };

  const handleSaveAddress = async () => {
    if (!editingAddress) return;

    try {
      const endpoint = editingAddress.id
        ? `/api/user/profile/address/${editingAddress.id}`
        : "/api/user/profile/address";
      const method = editingAddress.id ? "PUT" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(editingAddress),
      });

      if (res.ok) {
        await loadAddresses();
        setEditingAddress(null);
        setShowAddressForm(false);
        setMessage({ type: "success", text: "地址保存成功" });
        setTimeout(() => setMessage(null), 2000);
      }
    } catch (error) {
      setMessage({ type: "error", text: "保存失败" });
    }
  };

  const handleDeleteAddress = async (id: number) => {
    if (!confirm("确定要删除这个地址吗？")) return;

    try {
      const res = await fetch(`/api/user/profile/address/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.ok) {
        await loadAddresses();
        setMessage({ type: "success", text: "删除成功" });
        setTimeout(() => setMessage(null), 2000);
      }
    } catch (error) {
      setMessage({ type: "error", text: "删除失败" });
    }
  };

  // 渲染已保存的支付信息
  const renderSavedPaymentInfo = () => {
    if (!hasSavedPayment || !paymentMethod) return null;

    return (
      <div className="px-5 py-4 border border-gray-200 rounded-lg bg-white">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-medium text-gray-500">支付方式</span>
              <span className="px-2.5 py-0.5 bg-[#A80000] text-white text-xs font-medium rounded">
                {paymentMethod === "bank_card" && "银行卡"}
                {paymentMethod === "digital_wallet" && "数字钱包"}
                {paymentMethod === "alipay" && "支付宝"}
                {paymentMethod === "wechat" && "微信"}
              </span>
            </div>

            {/* 银行卡信息 */}
            {paymentMethod === "bank_card" && (
              <div className="space-y-2">
                <div className="flex items-center text-sm">
                  <span className="text-gray-500 w-24">银行名称：</span>
                  <span className="text-gray-900 font-medium">{paymentForm.bankName}</span>
                </div>
                <div className="flex items-center text-sm">
                  <span className="text-gray-500 w-24">银行卡号：</span>
                  <span className="text-gray-900 font-medium">{paymentForm.bankAccountNumber}</span>
                </div>
                <div className="flex items-center text-sm">
                  <span className="text-gray-500 w-24">持卡人：</span>
                  <span className="text-gray-900 font-medium">{paymentForm.bankAccountName}</span>
                </div>
              </div>
            )}

            {/* 数字钱包信息 */}
            {paymentMethod === "digital_wallet" && (
              <div className="space-y-2">
                <div className="flex items-center text-sm">
                  <span className="text-gray-500 w-24">收款网络：</span>
                  <span className="text-gray-900 font-medium">{paymentForm.walletNetwork}</span>
                </div>
                {paymentForm.digitalWalletAddress && (
                  <div className="flex items-center text-sm">
                    <span className="text-gray-500 w-24">钱包地址：</span>
                    <span className="text-gray-900 font-medium font-mono text-xs break-all">
                      {paymentForm.digitalWalletAddress}
                    </span>
                  </div>
                )}
                {paymentForm.walletQrCodeUrl && (
                  <div className="flex items-center text-sm">
                    <span className="text-gray-500 w-24">收款码：</span>
                    <span className="text-blue-600 text-xs">已上传</span>
                  </div>
                )}
              </div>
            )}

            {/* 支付宝信息 */}
            {paymentMethod === "alipay" && (
              <div className="space-y-2">
                {paymentForm.alipayAccount && (
                  <div className="flex items-center text-sm">
                    <span className="text-gray-500 w-24">支付宝账号：</span>
                    <span className="text-gray-900 font-medium">{paymentForm.alipayAccount}</span>
                  </div>
                )}
                {paymentForm.alipayQrCodeUrl && (
                  <div className="flex items-center text-sm">
                    <span className="text-gray-500 w-24">收款码：</span>
                    <span className="text-blue-600 text-xs">已上传</span>
                  </div>
                )}
                <div className="flex items-center text-sm">
                  <span className="text-gray-500 w-24">收款人：</span>
                  <span className="text-gray-900 font-medium">{paymentForm.alipayAccountName}</span>
                </div>
              </div>
            )}

            {/* 微信信息 */}
            {paymentMethod === "wechat" && (
              <div className="space-y-2">
                {paymentForm.wechatQrCodeUrl && (
                  <div className="flex items-center text-sm">
                    <span className="text-gray-500 w-24">收款码：</span>
                    <span className="text-blue-600 text-xs">已上传</span>
                  </div>
                )}
                <div className="flex items-center text-sm">
                  <span className="text-gray-500 w-24">收款人：</span>
                  <span className="text-gray-900 font-medium">{paymentForm.wechatAccountName}</span>
                </div>
              </div>
            )}
          </div>

          {/* 编辑和删除按钮 */}
          <div className="flex gap-3 ml-6">
            <button
              onClick={handleEditPayment}
              className="text-sm text-[#A80000] hover:text-[#800000] font-medium transition-colors"
            >
              编辑
            </button>
            <button
              onClick={handleDeletePayment}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
            >
              删除
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/profile">
              <a className="text-gray-600 hover:text-gray-900 transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </a>
            </Link>
            <h1 className="text-base font-semibold text-gray-900">编辑资料</h1>
          </div>
          {(activeTab !== "payment" || (activeTab === "payment" && isEditingPayment)) && (
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="px-5 py-1.5 bg-[#A80000] text-white text-sm font-medium rounded-md hover:bg-[#800000] disabled:opacity-50 transition-colors"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          )}
        </div>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className="max-w-4xl mx-auto px-4 pt-3">
          <div
            className={`px-4 py-2.5 rounded-lg text-sm font-medium ${
              message.type === "success"
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        </div>
      )}

      {/* 主内容区域 */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        {/* 标签页导航 */}
        <div className="bg-white rounded-t-xl overflow-hidden shadow-sm">
          <div className="flex border-b border-gray-100">
            {[
              { key: "basic", label: "基本信息" },
              { key: "verification", label: "实名认证" },
              { key: "payment", label: "支付账号" },
              { key: "address", label: "收件地址" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex-1 py-3.5 text-sm font-medium transition-all ${
                  activeTab === tab.key
                    ? "text-[#A80000] border-b-2 border-[#A80000] bg-red-50/30"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 表单内容区域 */}
          <div className="p-6">
            {/* 基本信息 */}
            {activeTab === "basic" && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">姓名</label>
                  <input
                    type="text"
                    value={basicForm.name}
                    onChange={(e) => setBasicForm({ ...basicForm, name: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all"
                    placeholder="请输入姓名"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">昵称</label>
                  <input
                    type="text"
                    value={basicForm.nickname}
                    onChange={(e) => setBasicForm({ ...basicForm, nickname: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all"
                    placeholder="请输入昵称"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">邮箱</label>
                  <input
                    type="email"
                    value={basicForm.email}
                    onChange={(e) => setBasicForm({ ...basicForm, email: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all"
                    placeholder="请输入邮箱"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">手机号</label>
                  <input
                    type="tel"
                    value={basicForm.phone}
                    onChange={(e) => setBasicForm({ ...basicForm, phone: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all"
                    placeholder="请输入手机号"
                  />
                </div>
              </div>
            )}

            {/* 实名认证 */}
            {activeTab === "verification" && (
              <div className="space-y-5">
                {verificationForm.verificationStatus === "verified" && (
                  <div className="px-4 py-3 bg-green-50 rounded-lg text-sm text-green-700">
                    您已通过实名认证，信息不可修改
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">真实姓名</label>
                  <input
                    type="text"
                    value={verificationForm.realName}
                    onChange={(e) => setVerificationForm({ ...verificationForm, realName: e.target.value })}
                    disabled={verificationForm.verificationStatus === "verified"}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                    placeholder="请输入真实姓名"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">身份证号</label>
                  <input
                    type="text"
                    value={verificationForm.idCardNumber}
                    onChange={(e) => setVerificationForm({ ...verificationForm, idCardNumber: e.target.value })}
                    disabled={verificationForm.verificationStatus === "verified"}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                    placeholder="请输入身份证号"
                  />
                </div>
              </div>
            )}

            {/* 支付账号 */}
            {activeTab === "payment" && (
              <div className="space-y-6">
                {/* 如果已保存且不在编辑状态，显示已保存的信息 */}
                {hasSavedPayment && !isEditingPayment ? (
                  renderSavedPaymentInfo()
                ) : (
                  <>
                    {/* 支付方式选择 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">选择支付方式</label>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { value: "bank_card", label: "银行卡" },
                          { value: "digital_wallet", label: "数字钱包" },
                          { value: "alipay", label: "支付宝" },
                          { value: "wechat", label: "微信" },
                        ].map((method) => (
                          <button
                            key={method.value}
                            type="button"
                            onClick={() => setPaymentMethod(method.value as any)}
                            className={`px-4 py-3.5 border-2 rounded-lg text-sm font-medium transition-all ${
                              paymentMethod === method.value
                                ? "border-[#A80000] bg-red-50 text-[#A80000]"
                                : "border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            {method.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 银行卡表单 */}
                    {paymentMethod === "bank_card" && (
                      <div className="space-y-4 pt-4 border-t border-gray-100">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">银行名称</label>
                          <input
                            type="text"
                            value={paymentForm.bankName}
                            onChange={(e) => setPaymentForm({ ...paymentForm, bankName: e.target.value })}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all"
                            placeholder="例如：中国工商银行"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">银行卡号</label>
                          <input
                            type="text"
                            value={paymentForm.bankAccountNumber}
                            onChange={(e) => setPaymentForm({ ...paymentForm, bankAccountNumber: e.target.value })}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all"
                            placeholder="请输入银行卡号"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">持卡人姓名</label>
                          <input
                            type="text"
                            value={paymentForm.bankAccountName}
                            onChange={(e) => setPaymentForm({ ...paymentForm, bankAccountName: e.target.value })}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all"
                            placeholder="请输入持卡人姓名"
                          />
                        </div>
                      </div>
                    )}

                    {/* 数字钱包表单 */}
                    {paymentMethod === "digital_wallet" && (
                      <div className="space-y-4 pt-4 border-t border-gray-100">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">收款网络</label>
                          <select
                            value={paymentForm.walletNetwork}
                            onChange={(e) => setPaymentForm({ ...paymentForm, walletNetwork: e.target.value })}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all"
                          >
                            <option value="TRC20">TRC20 (USDT-Tron)</option>
                            <option value="ERC20">ERC20 (USDT-Ethereum)</option>
                            <option value="BEP20">BEP20 (USDT-BSC)</option>
                            <option value="BTC">Bitcoin (BTC)</option>
                            <option value="ETH">Ethereum (ETH)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">钱包地址</label>
                          <input
                            type="text"
                            value={paymentForm.digitalWalletAddress}
                            onChange={(e) => setPaymentForm({ ...paymentForm, digitalWalletAddress: e.target.value })}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all"
                            placeholder="请输入钱包地址"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">或上传收款二维码</label>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileChange(e, "walletQrCode")}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-[#A80000] file:text-white hover:file:bg-[#800000] transition-all"
                          />
                          {paymentForm.walletQrCode && (
                            <p className="mt-2 text-xs text-gray-500">已选择: {paymentForm.walletQrCode.name}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 支付宝表单 */}
                    {paymentMethod === "alipay" && (
                      <div className="space-y-4 pt-4 border-t border-gray-100">
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => setPaymentForm({ ...paymentForm, alipayInputMethod: "account" })}
                            className={`flex-1 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                              paymentForm.alipayInputMethod === "account"
                                ? "border-[#A80000] bg-red-50 text-[#A80000]"
                                : "border-gray-200 text-gray-700 hover:border-gray-300"
                            }`}
                          >
                            输入账号
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentForm({ ...paymentForm, alipayInputMethod: "qrcode" })}
                            className={`flex-1 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                              paymentForm.alipayInputMethod === "qrcode"
                                ? "border-[#A80000] bg-red-50 text-[#A80000]"
                                : "border-gray-200 text-gray-700 hover:border-gray-300"
                            }`}
                          >
                            上传收款码
                          </button>
                        </div>

                        {paymentForm.alipayInputMethod === "account" ? (
                          <>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">支付宝账号</label>
                              <input
                                type="text"
                                value={paymentForm.alipayAccount}
                                onChange={(e) => setPaymentForm({ ...paymentForm, alipayAccount: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all"
                                placeholder="手机号或邮箱"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">收款人姓名</label>
                              <input
                                type="text"
                                value={paymentForm.alipayAccountName}
                                onChange={(e) => setPaymentForm({ ...paymentForm, alipayAccountName: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all"
                                placeholder="请输入收款人姓名"
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">上传支付宝收款码</label>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleFileChange(e, "alipayQrCode")}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-[#A80000] file:text-white hover:file:bg-[#800000] transition-all"
                              />
                              {paymentForm.alipayQrCode && (
                                <p className="mt-2 text-xs text-gray-500">已选择: {paymentForm.alipayQrCode.name}</p>
                              )}
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">收款人姓名</label>
                              <input
                                type="text"
                                value={paymentForm.alipayAccountName}
                                onChange={(e) => setPaymentForm({ ...paymentForm, alipayAccountName: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all"
                                placeholder="请输入收款人姓名"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* 微信表单 */}
                    {paymentMethod === "wechat" && (
                      <div className="space-y-4 pt-4 border-t border-gray-100">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">上传微信收款码</label>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileChange(e, "wechatQrCode")}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-[#A80000] file:text-white hover:file:bg-[#800000] transition-all"
                          />
                          {paymentForm.wechatQrCode && (
                            <p className="mt-2 text-xs text-gray-500">已选择: {paymentForm.wechatQrCode.name}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">收款人姓名</label>
                          <input
                            type="text"
                            value={paymentForm.wechatAccountName}
                            onChange={(e) => setPaymentForm({ ...paymentForm, wechatAccountName: e.target.value })}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all"
                            placeholder="请输入收款人姓名"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 收件地址 */}
            {activeTab === "address" && (
              <div className="space-y-4">
                {/* 地址列表 */}
                {addresses.length > 0 && (
                  <div className="space-y-3">
                    {addresses.map((addr) => (
                      <div key={addr.id} className="px-4 py-3.5 border border-gray-200 rounded-lg hover:border-gray-300 transition-all">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="font-medium text-gray-900">{addr.recipientName}</span>
                              <span className="text-sm text-gray-600">{addr.phone}</span>
                              {addr.isDefault && (
                                <span className="px-2 py-0.5 bg-[#A80000] text-white text-xs rounded">默认</span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 leading-relaxed">
                              {addr.province} {addr.city} {addr.district} {addr.detailAddress}
                            </p>
                            {addr.label && (
                              <span className="inline-block mt-2 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                                {addr.label}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-3 ml-4">
                            <button
                              onClick={() => {
                                setEditingAddress(addr);
                                setShowAddressForm(true);
                              }}
                              className="text-sm text-[#A80000] hover:text-[#800000] font-medium transition-colors"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => handleDeleteAddress(addr.id)}
                              className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 添加新地址按钮 */}
                {!showAddressForm ? (
                  <button
                    onClick={() => {
                      setEditingAddress({
                        recipientName: "",
                        phone: "",
                        province: "",
                        city: "",
                        district: "",
                        detailAddress: "",
                        postalCode: "",
                        label: "家",
                        isDefault: addresses.length === 0,
                      });
                      setShowAddressForm(true);
                    }}
                    className="w-full py-3.5 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-[#A80000] hover:text-[#A80000] transition-all"
                  >
                    + 添加新地址
                  </button>
                ) : (
                  /* 地址编辑表单 */
                  <div className="space-y-4 p-5 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">收件人</label>
                        <input
                          type="text"
                          value={editingAddress?.recipientName || ""}
                          onChange={(e) => setEditingAddress({ ...editingAddress, recipientName: e.target.value })}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all"
                          placeholder="姓名"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">电话</label>
                        <input
                          type="tel"
                          value={editingAddress?.phone || ""}
                          onChange={(e) => setEditingAddress({ ...editingAddress, phone: e.target.value })}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all"
                          placeholder="手机号"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <input
                        type="text"
                        value={editingAddress?.province || ""}
                        onChange={(e) => setEditingAddress({ ...editingAddress, province: e.target.value })}
                        className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all"
                        placeholder="省"
                      />
                      <input
                        type="text"
                        value={editingAddress?.city || ""}
                        onChange={(e) => setEditingAddress({ ...editingAddress, city: e.target.value })}
                        className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all"
                        placeholder="市"
                      />
                      <input
                        type="text"
                        value={editingAddress?.district || ""}
                        onChange={(e) => setEditingAddress({ ...editingAddress, district: e.target.value })}
                        className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all"
                        placeholder="区"
                      />
                    </div>
                    <div>
                      <textarea
                        value={editingAddress?.detailAddress || ""}
                        onChange={(e) => setEditingAddress({ ...editingAddress, detailAddress: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all resize-none"
                        rows={2}
                        placeholder="详细地址"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        value={editingAddress?.label || "家"}
                        onChange={(e) => setEditingAddress({ ...editingAddress, label: e.target.value })}
                        className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all"
                      >
                        <option value="家">家</option>
                        <option value="公司">公司</option>
                        <option value="学校">学校</option>
                        <option value="其他">其他</option>
                      </select>
                      <label className="flex items-center px-4 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingAddress?.isDefault || false}
                          onChange={(e) => setEditingAddress({ ...editingAddress, isDefault: e.target.checked })}
                          className="mr-2 w-4 h-4 text-[#A80000] border-gray-300 rounded focus:ring-[#A80000]"
                        />
                        <span className="text-sm text-gray-700">设为默认</span>
                      </label>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={handleSaveAddress}
                        className="flex-1 py-2.5 bg-[#A80000] text-white text-sm font-medium rounded-lg hover:bg-[#800000] transition-colors"
                      >
                        保存地址
                      </button>
                      <button
                        onClick={() => {
                          setEditingAddress(null);
                          setShowAddressForm(false);
                        }}
                        className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
