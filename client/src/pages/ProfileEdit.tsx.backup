import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, CreditCard, Wallet, QrCode, X, ChevronDown, ChevronUp, Image as ImageIcon } from "lucide-react";

type PaymentType = "bank_card" | "digital_wallet" | "alipay" | "wechat";

interface PaymentData {
  bank_card?: {
    bankName: string;
    bankAccountNumber: string;
    bankAccountName: string;
  };
  digital_wallet?: {
    walletNetwork: string;
    digitalWalletAddress: string;
    walletQrCodeUrl: string;
  };
  alipay?: {
    alipayAccount: string;
    alipayAccountName: string;
    alipayQrCodeUrl: string;
  };
  wechat?: {
    wechatAccountName: string;
    wechatQrCodeUrl: string;
  };
}

const PAYMENT_LABELS: Record<PaymentType, string> = {
  bank_card: "银行卡",
  digital_wallet: "数字钱包",
  alipay: "支付宝",
  wechat: "微信",
};

const PAYMENT_ICONS: Record<PaymentType, string> = {
  bank_card: "🏦",
  digital_wallet: "💰",
  alipay: "💙",
  wechat: "💚",
};

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

  // ==================== 支付账号状态 ====================
  const [payments, setPayments] = useState<PaymentData>({});
  const [editingType, setEditingType] = useState<PaymentType | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 银行卡表单
  const [bankForm, setBankForm] = useState({
    bankName: "",
    bankAccountNumber: "",
    bankAccountName: "",
  });

  // 数字钱包表单
  const [walletForm, setWalletForm] = useState({
    walletNetwork: "TRC20",
    digitalWalletAddress: "",
    qrCodeFile: null as File | null,
    qrCodePreview: "",
  });

  // 支付宝表单
  const [alipayForm, setAlipayForm] = useState({
    alipayAccount: "",
    alipayAccountName: "",
    inputMethod: "account" as "account" | "qrcode",
    qrCodeFile: null as File | null,
    qrCodePreview: "",
  });

  // 微信表单
  const [wechatForm, setWechatForm] = useState({
    wechatAccountName: "",
    qrCodeFile: null as File | null,
    qrCodePreview: "",
  });

  // 收件地址列表
  const [addresses, setAddresses] = useState<any[]>([]);
  const [editingAddress, setEditingAddress] = useState<any | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);

  // ==================== 加载数据 ====================

  useEffect(() => {
    loadProfile();
    loadPayments();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await fetch("/api/user/profile", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setBasicForm({
            name: data.user.displayName || "",
            nickname: data.user.username || "",
            email: data.user.email || "",
            phone: data.profile?.phone || "",
          });
        }
        if (data.profile) {
          setVerificationForm({
            realName: data.profile.realName || "",
            idCardNumber: data.profile.idCardNumber || "",
            verificationStatus: data.profile.verificationStatus || "pending",
          });
        }
        if (data.addresses) {
          setAddresses(data.addresses);
        }
      }
    } catch (error) {
      console.error("加载资料失败:", error);
    }
  };

  const loadPayments = async () => {
    try {
      const res = await fetch("/api/user/profile/payment", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments || {});
      }
    } catch (error) {
      console.error("加载支付信息失败:", error);
    }
  };

  const reloadAddresses = async () => {
    try {
      const res = await fetch("/api/user/profile", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.addresses) {
          setAddresses(data.addresses);
        }
      }
    } catch (error) {
      console.error("加载地址失败:", error);
    }
  };

  // ==================== 基本信息/实名认证保存 ====================

  const handleSaveProfile = async () => {
    if (activeTab === "address" || activeTab === "payment") return;

    setSaving(true);
    try {
      let endpoint = "";
      let body: any = {};

      if (activeTab === "basic") {
        endpoint = "/api/user/profile/basic";
        body = {
          displayName: basicForm.name,
          email: basicForm.email,
          phone: basicForm.phone,
        };
      } else if (activeTab === "verification") {
        endpoint = "/api/user/profile/verification";
        body = {
          realName: verificationForm.realName,
          idNumber: verificationForm.idCardNumber,
        };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (res.ok) {
        showMsg("success", "保存成功");
      } else {
        showMsg("error", "保存失败");
      }
    } catch (error) {
      showMsg("error", "保存失败");
    } finally {
      setSaving(false);
    }
  };

  // ==================== 支付账号操作 ====================

  const startEditPayment = (type: PaymentType) => {
    const existing = payments[type];
    
    if (type === "bank_card") {
      const data = existing as PaymentData["bank_card"];
      setBankForm({
        bankName: data?.bankName || "",
        bankAccountNumber: data?.bankAccountNumber || "",
        bankAccountName: data?.bankAccountName || "",
      });
    } else if (type === "digital_wallet") {
      const data = existing as PaymentData["digital_wallet"];
      setWalletForm({
        walletNetwork: data?.walletNetwork || "TRC20",
        digitalWalletAddress: data?.digitalWalletAddress || "",
        qrCodeFile: null,
        qrCodePreview: data?.walletQrCodeUrl || "",
      });
    } else if (type === "alipay") {
      const data = existing as PaymentData["alipay"];
      setAlipayForm({
        alipayAccount: data?.alipayAccount || "",
        alipayAccountName: data?.alipayAccountName || "",
        inputMethod: data?.alipayAccount ? "account" : (data?.alipayQrCodeUrl ? "qrcode" : "account"),
        qrCodeFile: null,
        qrCodePreview: data?.alipayQrCodeUrl || "",
      });
    } else if (type === "wechat") {
      const data = existing as PaymentData["wechat"];
      setWechatForm({
        wechatAccountName: data?.wechatAccountName || "",
        qrCodeFile: null,
        qrCodePreview: data?.wechatQrCodeUrl || "",
      });
    }

    setEditingType(type);
  };

  const cancelEditPayment = () => {
    setEditingType(null);
  };

  const savePayment = async (type: PaymentType) => {
    setSavingPayment(true);
    try {
      let res: Response;

      if (type === "bank_card") {
        // 银行卡使用JSON格式发送（不需要文件上传）
        res = await fetch(`/api/user/profile/payment/bank_card`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(bankForm),
        });
      } else {
        // 其他支付方式使用FormData（支持文件上传）
        const formData = new FormData();
        let data: any = {};

        if (type === "digital_wallet") {
          data = {
            walletNetwork: walletForm.walletNetwork,
            digitalWalletAddress: walletForm.digitalWalletAddress,
          };
          if (walletForm.qrCodeFile) {
            formData.append("qrcode", walletForm.qrCodeFile);
          }
        } else if (type === "alipay") {
          data = {
            alipayAccount: alipayForm.inputMethod === "account" ? alipayForm.alipayAccount : "",
            alipayAccountName: alipayForm.alipayAccountName,
          };
          if (alipayForm.qrCodeFile) {
            formData.append("qrcode", alipayForm.qrCodeFile);
          }
        } else if (type === "wechat") {
          data = {
            wechatAccountName: wechatForm.wechatAccountName,
          };
          if (wechatForm.qrCodeFile) {
            formData.append("qrcode", wechatForm.qrCodeFile);
          }
        }

        formData.append("data", JSON.stringify(data));

        res = await fetch(`/api/user/profile/payment/${type}`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });
      }

      if (res.ok) {
        showMsg("success", "保存成功");
        setEditingType(null);
        await loadPayments();
      } else {
        const errData = await res.json().catch(() => ({}));
        showMsg("error", errData.error || "保存失败");
      }
    } catch (error) {
      console.error("保存支付方式失败:", error);
      showMsg("error", "保存失败");
    } finally {
      setSavingPayment(false);
    }
  };

  const deletePayment = async (type: PaymentType) => {
    if (!confirm(`确定要删除${PAYMENT_LABELS[type]}信息吗？`)) return;

    try {
      const res = await fetch(`/api/user/profile/payment/${type}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.ok) {
        showMsg("success", "删除成功");
        await loadPayments();
      } else {
        showMsg("error", "删除失败");
      }
    } catch (error) {
      showMsg("error", "删除失败");
    }
  };

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: any) => void,
    current: any
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const preview = URL.createObjectURL(file);
      setter({ ...current, qrCodeFile: file, qrCodePreview: preview });
    }
  };

  // ==================== 收件地址操作 ====================

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
        await reloadAddresses();
        setEditingAddress(null);
        setShowAddressForm(false);
        showMsg("success", "地址保存成功");
      }
    } catch (error) {
      showMsg("error", "保存失败");
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
        await reloadAddresses();
        showMsg("success", "删除成功");
      }
    } catch (error) {
      showMsg("error", "删除失败");
    }
  };

  // ==================== 工具函数 ====================

  const showMsg = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 2000);
  };

  // 隐藏银行卡号中间部分
  const maskCardNumber = (num: string) => {
    if (num.length <= 8) return num;
    return num.slice(0, 4) + " **** **** " + num.slice(-4);
  };

  // ==================== 渲染已绑定的支付方式卡片 ====================

  const renderBoundCard = (type: PaymentType) => {
    const data = payments[type];
    if (!data) return null;

    return (
      <div key={type} className="border border-gray-200 rounded-xl bg-white overflow-hidden">
        {/* 卡片头部 */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-lg">{PAYMENT_ICONS[type]}</span>
            <span className="text-sm font-semibold text-gray-800">{PAYMENT_LABELS[type]}</span>
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">已绑定</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => startEditPayment(type)}
              className="text-xs text-[#A80000] hover:text-[#800000] font-medium"
            >
              编辑
            </button>
            <button
              onClick={() => deletePayment(type)}
              className="text-xs text-gray-400 hover:text-gray-600 font-medium"
            >
              删除
            </button>
          </div>
        </div>

        {/* 卡片内容 */}
        <div className="px-4 py-3">
          {type === "bank_card" && (() => {
            const d = data as PaymentData["bank_card"];
            return (
              <div className="space-y-1.5">
                <div className="flex items-center text-sm">
                  <span className="text-gray-500 w-20 flex-shrink-0">银行名称</span>
                  <span className="text-gray-900 font-medium">{d?.bankName}</span>
                </div>
                <div className="flex items-center text-sm">
                  <span className="text-gray-500 w-20 flex-shrink-0">银行卡号</span>
                  <span className="text-gray-900 font-medium font-mono tracking-wide">{maskCardNumber(d?.bankAccountNumber || "")}</span>
                </div>
                <div className="flex items-center text-sm">
                  <span className="text-gray-500 w-20 flex-shrink-0">持卡人</span>
                  <span className="text-gray-900 font-medium">{d?.bankAccountName}</span>
                </div>
              </div>
            );
          })()}

          {type === "digital_wallet" && (() => {
            const d = data as PaymentData["digital_wallet"];
            return (
              <div className="space-y-2">
                <div className="flex items-center text-sm">
                  <span className="text-gray-500 w-20 flex-shrink-0">收款网络</span>
                  <span className="text-gray-900 font-medium">{d?.walletNetwork}</span>
                </div>
                {d?.digitalWalletAddress && (
                  <div className="flex items-start text-sm">
                    <span className="text-gray-500 w-20 flex-shrink-0 pt-0.5">钱包地址</span>
                    <span className="text-gray-900 font-medium font-mono text-xs break-all leading-5">{d.digitalWalletAddress}</span>
                  </div>
                )}
                {d?.walletQrCodeUrl && (
                  <div className="flex items-start text-sm">
                    <span className="text-gray-500 w-20 flex-shrink-0 pt-0.5">收款码</span>
                    <img
                      src={d.walletQrCodeUrl}
                      alt="钱包收款码"
                      className="w-24 h-24 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => setPreviewImage(d.walletQrCodeUrl)}
                    />
                  </div>
                )}
              </div>
            );
          })()}

          {type === "alipay" && (() => {
            const d = data as PaymentData["alipay"];
            return (
              <div className="space-y-2">
                {d?.alipayAccount && (
                  <div className="flex items-center text-sm">
                    <span className="text-gray-500 w-20 flex-shrink-0">支付宝账号</span>
                    <span className="text-gray-900 font-medium">{d.alipayAccount}</span>
                  </div>
                )}
                {d?.alipayAccountName && (
                  <div className="flex items-center text-sm">
                    <span className="text-gray-500 w-20 flex-shrink-0">收款人</span>
                    <span className="text-gray-900 font-medium">{d.alipayAccountName}</span>
                  </div>
                )}
                {d?.alipayQrCodeUrl && (
                  <div className="flex items-start text-sm">
                    <span className="text-gray-500 w-20 flex-shrink-0 pt-0.5">收款码</span>
                    <img
                      src={d.alipayQrCodeUrl}
                      alt="支付宝收款码"
                      className="w-24 h-24 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => setPreviewImage(d.alipayQrCodeUrl)}
                    />
                  </div>
                )}
              </div>
            );
          })()}

          {type === "wechat" && (() => {
            const d = data as PaymentData["wechat"];
            return (
              <div className="space-y-2">
                {d?.wechatAccountName && (
                  <div className="flex items-center text-sm">
                    <span className="text-gray-500 w-20 flex-shrink-0">收款人</span>
                    <span className="text-gray-900 font-medium">{d.wechatAccountName}</span>
                  </div>
                )}
                {d?.wechatQrCodeUrl && (
                  <div className="flex items-start text-sm">
                    <span className="text-gray-500 w-20 flex-shrink-0 pt-0.5">收款码</span>
                    <img
                      src={d.wechatQrCodeUrl}
                      alt="微信收款码"
                      className="w-24 h-24 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => setPreviewImage(d.wechatQrCodeUrl)}
                    />
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  // ==================== 渲染编辑表单 ====================

  const renderEditForm = (type: PaymentType) => {
    const isNew = !payments[type];
    const inputClass = "w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000] focus:border-transparent transition-all";
    const fileInputClass = "w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#A80000] file:text-white hover:file:bg-[#800000] file:cursor-pointer cursor-pointer";

    return (
      <div className="border-2 border-[#A80000]/30 rounded-xl bg-white overflow-hidden">
        {/* 表单头部 */}
        <div className="flex items-center justify-between px-4 py-3 bg-red-50 border-b border-red-100">
          <div className="flex items-center gap-2">
            <span className="text-lg">{PAYMENT_ICONS[type]}</span>
            <span className="text-sm font-semibold text-gray-800">
              {isNew ? `绑定${PAYMENT_LABELS[type]}` : `编辑${PAYMENT_LABELS[type]}`}
            </span>
          </div>
          <button onClick={cancelEditPayment} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 表单内容 */}
        <div className="p-4 space-y-4">
          {type === "bank_card" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">银行名称</label>
                <input
                  type="text"
                  value={bankForm.bankName}
                  onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                  className={inputClass}
                  placeholder="例如：中国工商银行"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">银行卡号</label>
                <input
                  type="text"
                  value={bankForm.bankAccountNumber}
                  onChange={(e) => setBankForm({ ...bankForm, bankAccountNumber: e.target.value })}
                  className={inputClass}
                  placeholder="请输入银行卡号"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">持卡人姓名</label>
                <input
                  type="text"
                  value={bankForm.bankAccountName}
                  onChange={(e) => setBankForm({ ...bankForm, bankAccountName: e.target.value })}
                  className={inputClass}
                  placeholder="请输入持卡人姓名"
                />
              </div>
            </>
          )}

          {type === "digital_wallet" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">收款网络</label>
                <select
                  value={walletForm.walletNetwork}
                  onChange={(e) => setWalletForm({ ...walletForm, walletNetwork: e.target.value })}
                  className={inputClass}
                >
                  <option value="TRC20">TRC20 (USDT-Tron)</option>
                  <option value="ERC20">ERC20 (USDT-Ethereum)</option>
                  <option value="BEP20">BEP20 (USDT-BSC)</option>
                  <option value="BTC">Bitcoin (BTC)</option>
                  <option value="ETH">Ethereum (ETH)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">钱包地址</label>
                <input
                  type="text"
                  value={walletForm.digitalWalletAddress}
                  onChange={(e) => setWalletForm({ ...walletForm, digitalWalletAddress: e.target.value })}
                  className={inputClass}
                  placeholder="请输入钱包地址"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">收款二维码（可选）</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileSelect(e, setWalletForm, walletForm)}
                  className={fileInputClass}
                />
                {walletForm.qrCodePreview && (
                  <div className="mt-2 relative inline-block">
                    <img src={walletForm.qrCodePreview} alt="预览" className="w-24 h-24 object-cover rounded-lg border border-gray-200" />
                    <button
                      onClick={() => setWalletForm({ ...walletForm, qrCodeFile: null, qrCodePreview: "" })}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {type === "alipay" && (
            <>
              {/* 输入方式切换 */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAlipayForm({ ...alipayForm, inputMethod: "account" })}
                  className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                    alipayForm.inputMethod === "account"
                      ? "border-[#A80000] bg-red-50 text-[#A80000]"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  输入账号
                </button>
                <button
                  type="button"
                  onClick={() => setAlipayForm({ ...alipayForm, inputMethod: "qrcode" })}
                  className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                    alipayForm.inputMethod === "qrcode"
                      ? "border-[#A80000] bg-red-50 text-[#A80000]"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  上传收款码
                </button>
              </div>

              {alipayForm.inputMethod === "account" ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">支付宝账号</label>
                  <input
                    type="text"
                    value={alipayForm.alipayAccount}
                    onChange={(e) => setAlipayForm({ ...alipayForm, alipayAccount: e.target.value })}
                    className={inputClass}
                    placeholder="手机号或邮箱"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">支付宝收款码</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileSelect(e, setAlipayForm, alipayForm)}
                    className={fileInputClass}
                  />
                  {alipayForm.qrCodePreview && (
                    <div className="mt-2 relative inline-block">
                      <img src={alipayForm.qrCodePreview} alt="预览" className="w-24 h-24 object-cover rounded-lg border border-gray-200" />
                      <button
                        onClick={() => setAlipayForm({ ...alipayForm, qrCodeFile: null, qrCodePreview: "" })}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">收款人姓名</label>
                <input
                  type="text"
                  value={alipayForm.alipayAccountName}
                  onChange={(e) => setAlipayForm({ ...alipayForm, alipayAccountName: e.target.value })}
                  className={inputClass}
                  placeholder="请输入收款人姓名"
                />
              </div>
            </>
          )}

          {type === "wechat" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">微信收款码</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileSelect(e, setWechatForm, wechatForm)}
                  className={fileInputClass}
                />
                {wechatForm.qrCodePreview && (
                  <div className="mt-2 relative inline-block">
                    <img src={wechatForm.qrCodePreview} alt="预览" className="w-24 h-24 object-cover rounded-lg border border-gray-200" />
                    <button
                      onClick={() => setWechatForm({ ...wechatForm, qrCodeFile: null, qrCodePreview: "" })}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">收款人姓名</label>
                <input
                  type="text"
                  value={wechatForm.wechatAccountName}
                  onChange={(e) => setWechatForm({ ...wechatForm, wechatAccountName: e.target.value })}
                  className={inputClass}
                  placeholder="请输入收款人姓名"
                />
              </div>
            </>
          )}

          {/* 保存/取消按钮 */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => savePayment(type)}
              disabled={savingPayment}
              className="flex-1 py-2.5 bg-[#A80000] text-white text-sm font-medium rounded-lg hover:bg-[#800000] disabled:opacity-50 transition-colors"
            >
              {savingPayment ? "保存中..." : "保存"}
            </button>
            <button
              onClick={cancelEditPayment}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ==================== 渲染支付账号标签页 ====================

  const renderPaymentTab = () => {
    const allTypes: PaymentType[] = ["bank_card", "digital_wallet", "alipay", "wechat"];
    const boundTypes = allTypes.filter((t) => payments[t]);
    const unboundTypes = allTypes.filter((t) => !payments[t]);

    return (
      <div className="space-y-4">
        {/* 已绑定的支付方式 */}
        {boundTypes.map((type) =>
          editingType === type ? renderEditForm(type) : renderBoundCard(type)
        )}

        {/* 正在添加的新支付方式 */}
        {editingType && !payments[editingType] && renderEditForm(editingType)}

        {/* 未绑定的支付方式 - 添加按钮 */}
        {unboundTypes.length > 0 && !editingType && (
          <div>
            {boundTypes.length > 0 && (
              <p className="text-xs text-gray-400 mb-3">添加其他支付方式</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {unboundTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => startEditPayment(type)}
                  className="flex items-center justify-center gap-2 px-4 py-3.5 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 hover:border-[#A80000] hover:text-[#A80000] hover:bg-red-50/30 transition-all"
                >
                  <span className="text-base">{PAYMENT_ICONS[type]}</span>
                  <span>绑定{PAYMENT_LABELS[type]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 空状态 */}
        {boundTypes.length === 0 && !editingType && (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">💳</div>
            <p className="text-sm text-gray-500 mb-4">还没有绑定任何支付方式</p>
            <p className="text-xs text-gray-400">请选择下方的支付方式进行绑定</p>
          </div>
        )}
      </div>
    );
  };

  // ==================== 主渲染 ====================

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
          {(activeTab === "basic" || activeTab === "verification") && (
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
        <div className="bg-white rounded-t-xl overflow-hidden shadow-sm">
          {/* 标签页导航 */}
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
            {activeTab === "payment" && renderPaymentTab()}

            {/* 收件地址 */}
            {activeTab === "address" && (
              <div className="space-y-4">
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

      {/* 图片预览弹窗 */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-sm w-full">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewImage}
              alt="收款码预览"
              className="w-full rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
