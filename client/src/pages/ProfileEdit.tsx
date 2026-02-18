import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Upload, X } from "lucide-react";

type PaymentMethod = "bank_card" | "digital_wallet" | "alipay" | "wechat" | null;

export default function ProfileEdit() {
  const [, setLocation] = useLocation();
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
    // 支付宝
    alipayAccount: "",
    alipayAccountName: "",
    alipayQrCode: null as File | null,
    alipayQrCodeUrl: "",
    alipayInputMethod: "account" as "account" | "qrcode",
    // 微信
    wechatQrCode: null as File | null,
    wechatQrCodeUrl: "",
    wechatAccountName: "",
  });

  // 收件地址列表
  const [addresses, setAddresses] = useState<any[]>([]);
  const [editingAddress, setEditingAddress] = useState<any | null>(null);
  const [newAddress, setNewAddress] = useState({
    recipientName: "",
    recipientPhone: "",
    province: "",
    city: "",
    district: "",
    detailedAddress: "",
    postalCode: "",
    label: "家",
    isDefault: false,
  });

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
        if (data.payment) {
          setPaymentMethod(data.payment.paymentMethod);
          setPaymentForm({
            ...paymentForm,
            ...data.payment,
          });
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

  const renderPaymentMethodSelector = () => (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700">选择支付方式</label>
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setPaymentMethod("bank_card")}
          className={`p-4 border-2 rounded-lg transition-all ${
            paymentMethod === "bank_card"
              ? "border-[#A80000] bg-red-50"
              : "border-gray-200 hover:border-gray-300"
          }`}
        >
          <div className="text-center">
            <div className="text-2xl mb-2">🏦</div>
            <div className="font-medium">银行卡</div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setPaymentMethod("digital_wallet")}
          className={`p-4 border-2 rounded-lg transition-all ${
            paymentMethod === "digital_wallet"
              ? "border-[#A80000] bg-red-50"
              : "border-gray-200 hover:border-gray-300"
          }`}
        >
          <div className="text-center">
            <div className="text-2xl mb-2">💰</div>
            <div className="font-medium">数字钱包</div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setPaymentMethod("alipay")}
          className={`p-4 border-2 rounded-lg transition-all ${
            paymentMethod === "alipay"
              ? "border-[#A80000] bg-red-50"
              : "border-gray-200 hover:border-gray-300"
          }`}
        >
          <div className="text-center">
            <div className="text-2xl mb-2">💳</div>
            <div className="font-medium">支付宝</div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setPaymentMethod("wechat")}
          className={`p-4 border-2 rounded-lg transition-all ${
            paymentMethod === "wechat"
              ? "border-[#A80000] bg-red-50"
              : "border-gray-200 hover:border-gray-300"
          }`}
        >
          <div className="text-center">
            <div className="text-2xl mb-2">💬</div>
            <div className="font-medium">微信</div>
          </div>
        </button>
      </div>
    </div>
  );

  const renderBankCardForm = () => (
    <div className="space-y-4 mt-6 p-4 bg-gray-50 rounded-lg">
      <h3 className="font-medium text-gray-900">银行卡信息</h3>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">银行名称</label>
        <input
          type="text"
          value={paymentForm.bankName}
          onChange={(e) => setPaymentForm({ ...paymentForm, bankName: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
          placeholder="例如：中国工商银行"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">银行卡号</label>
        <input
          type="text"
          value={paymentForm.bankAccountNumber}
          onChange={(e) => setPaymentForm({ ...paymentForm, bankAccountNumber: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
          placeholder="请输入银行卡号"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">持卡人姓名</label>
        <input
          type="text"
          value={paymentForm.bankAccountName}
          onChange={(e) => setPaymentForm({ ...paymentForm, bankAccountName: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
          placeholder="请输入持卡人姓名"
        />
      </div>
    </div>
  );

  const renderDigitalWalletForm = () => (
    <div className="space-y-4 mt-6 p-4 bg-gray-50 rounded-lg">
      <h3 className="font-medium text-gray-900">数字钱包信息</h3>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">收款网络</label>
        <select
          value={paymentForm.walletNetwork}
          onChange={(e) => setPaymentForm({ ...paymentForm, walletNetwork: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
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
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
          placeholder="请输入钱包地址"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">或上传收款二维码</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => handleFileChange(e, "walletQrCode")}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
        />
        {paymentForm.walletQrCode && (
          <p className="mt-2 text-sm text-gray-600">已选择: {paymentForm.walletQrCode.name}</p>
        )}
      </div>
    </div>
  );

  const renderAlipayForm = () => (
    <div className="space-y-4 mt-6 p-4 bg-gray-50 rounded-lg">
      <h3 className="font-medium text-gray-900">支付宝信息</h3>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">选择输入方式</label>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setPaymentForm({ ...paymentForm, alipayInputMethod: "account" })}
            className={`flex-1 px-4 py-2 rounded-lg border-2 transition-all ${
              paymentForm.alipayInputMethod === "account"
                ? "border-[#A80000] bg-red-50"
                : "border-gray-200"
            }`}
          >
            输入账号
          </button>
          <button
            type="button"
            onClick={() => setPaymentForm({ ...paymentForm, alipayInputMethod: "qrcode" })}
            className={`flex-1 px-4 py-2 rounded-lg border-2 transition-all ${
              paymentForm.alipayInputMethod === "qrcode"
                ? "border-[#A80000] bg-red-50"
                : "border-gray-200"
            }`}
          >
            上传收款码
          </button>
        </div>
      </div>
      
      {paymentForm.alipayInputMethod === "account" ? (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">支付宝账号</label>
            <input
              type="text"
              value={paymentForm.alipayAccount}
              onChange={(e) => setPaymentForm({ ...paymentForm, alipayAccount: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
              placeholder="请输入支付宝账号"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">收款人姓名</label>
            <input
              type="text"
              value={paymentForm.alipayAccountName}
              onChange={(e) => setPaymentForm({ ...paymentForm, alipayAccountName: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
              placeholder="请输入收款人姓名"
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">上传收款码</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleFileChange(e, "alipayQrCode")}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
            />
            {paymentForm.alipayQrCode && (
              <p className="mt-2 text-sm text-gray-600">已选择: {paymentForm.alipayQrCode.name}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">收款人姓名</label>
            <input
              type="text"
              value={paymentForm.alipayAccountName}
              onChange={(e) => setPaymentForm({ ...paymentForm, alipayAccountName: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
              placeholder="请输入收款人姓名"
            />
          </div>
        </>
      )}
    </div>
  );

  const renderWechatForm = () => (
    <div className="space-y-4 mt-6 p-4 bg-gray-50 rounded-lg">
      <h3 className="font-medium text-gray-900">微信信息</h3>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">上传微信收款码</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => handleFileChange(e, "wechatQrCode")}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
        />
        {paymentForm.wechatQrCode && (
          <p className="mt-2 text-sm text-gray-600">已选择: {paymentForm.wechatQrCode.name}</p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">收款人姓名</label>
        <input
          type="text"
          value={paymentForm.wechatAccountName}
          onChange={(e) => setPaymentForm({ ...paymentForm, wechatAccountName: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
          placeholder="请输入收款人姓名"
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/profile">
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">编辑资料</h1>
          </div>
          <button
            onClick={handleSaveProfile}
            disabled={saving || activeTab === "address"}
            className="px-4 py-2 bg-[#A80000] text-white rounded-lg hover:bg-[#800000] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      {/* 消息提示 */}
      {message && (
        <div
          className={`fixed top-20 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg z-50 ${
            message.type === "success" ? "bg-green-500" : "bg-red-500"
          } text-white`}
        >
          {message.text}
        </div>
      )}

      {/* 标签页导航 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveTab("basic")}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === "basic"
                  ? "border-[#A80000] text-[#A80000]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              基本信息
            </button>
            <button
              onClick={() => setActiveTab("verification")}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === "verification"
                  ? "border-[#A80000] text-[#A80000]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              实名认证
            </button>
            <button
              onClick={() => setActiveTab("payment")}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === "payment"
                  ? "border-[#A80000] text-[#A80000]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              支付账号
            </button>
            <button
              onClick={() => setActiveTab("address")}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === "address"
                  ? "border-[#A80000] text-[#A80000]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              收件地址
            </button>
          </div>
        </div>
      </div>

      {/* 表单内容 */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          {activeTab === "basic" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">姓名</label>
                <input
                  type="text"
                  value={basicForm.name}
                  onChange={(e) => setBasicForm({ ...basicForm, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">昵称</label>
                <input
                  type="text"
                  value={basicForm.nickname}
                  onChange={(e) => setBasicForm({ ...basicForm, nickname: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">邮箱</label>
                <input
                  type="email"
                  value={basicForm.email}
                  onChange={(e) => setBasicForm({ ...basicForm, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">手机号</label>
                <input
                  type="tel"
                  value={basicForm.phone}
                  onChange={(e) => setBasicForm({ ...basicForm, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                />
              </div>
            </div>
          )}

          {activeTab === "verification" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">真实姓名</label>
                <input
                  type="text"
                  value={verificationForm.realName}
                  onChange={(e) => setVerificationForm({ ...verificationForm, realName: e.target.value })}
                  disabled={verificationForm.verificationStatus === "verified"}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">身份证号</label>
                <input
                  type="text"
                  value={verificationForm.idCardNumber}
                  onChange={(e) => setVerificationForm({ ...verificationForm, idCardNumber: e.target.value })}
                  disabled={verificationForm.verificationStatus === "verified"}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">认证状态</label>
                <div
                  className={`px-4 py-2 rounded-lg inline-block ${
                    verificationForm.verificationStatus === "verified"
                      ? "bg-green-100 text-green-800"
                      : verificationForm.verificationStatus === "rejected"
                      ? "bg-red-100 text-red-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {verificationForm.verificationStatus === "verified"
                    ? "已认证"
                    : verificationForm.verificationStatus === "rejected"
                    ? "已拒绝"
                    : "待审核"}
                </div>
              </div>
            </div>
          )}

          {activeTab === "payment" && (
            <div>
              {renderPaymentMethodSelector()}
              {paymentMethod === "bank_card" && renderBankCardForm()}
              {paymentMethod === "digital_wallet" && renderDigitalWalletForm()}
              {paymentMethod === "alipay" && renderAlipayForm()}
              {paymentMethod === "wechat" && renderWechatForm()}
            </div>
          )}

          {activeTab === "address" && (
            <div className="space-y-4">
              <p className="text-gray-600">收件地址管理功能开发中...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
