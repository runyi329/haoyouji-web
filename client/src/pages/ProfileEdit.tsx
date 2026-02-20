import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, X, ChevronDown, ChevronUp } from "lucide-react";
import { trpc } from "../lib/trpc";

export default function ProfileEdit() {
  const [activeTab, setActiveTab] = useState<"basic" | "verification" | "address">("basic");
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

  // 收件地址列表
  const [addresses, setAddresses] = useState<any[]>([]);
  const [editingAddress, setEditingAddress] = useState<any | null>(null);
  const [addressForm, setAddressForm] = useState({
    recipientName: "",
    recipientPhone: "",
    province: "",
    city: "",
    district: "",
    detailedAddress: "",
    postalCode: "",
    isDefault: false,
    label: "",
  });

  // 使用tRPC获取用户信息
  const { data: user, isLoading } = trpc.auth.me.useQuery();

  // 当用户数据加载完成后，填充表单
  useEffect(() => {
    if (user) {
      setBasicForm({
        name: user.username || "",
        nickname: user.name || "",
        email: user.email || "",
        phone: "", // 暂时为空，等后端添加phone字段
      });
    }
  }, [user]);

  const loadProfile = async () => {
    // 这个函数现在主要用于重新加载地址等其他信息
    // 用户基本信息通过trpc.auth.me获取
  };

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // 使用tRPC更新用户信息
  const updateProfileMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      showMessage("success", "保存成功");
    },
    onError: (error) => {
      console.error("保存失败:", error);
      showMessage("error", "保存失败");
    },
  });

  // 保存基本信息和实名认证
  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateProfileMutation.mutateAsync({
        name: basicForm.nickname, // nickname对应后端的name字段
        phone: basicForm.phone,
        realName: verificationForm.realName,
        idCardNumber: verificationForm.idCardNumber,
      });
    } finally {
      setSaving(false);
    }
  };

  // ==================== 收件地址管理 ====================

  const handleAddAddress = () => {
    setEditingAddress({});
    setAddressForm({
      recipientName: "",
      recipientPhone: "",
      province: "",
      city: "",
      district: "",
      detailedAddress: "",
      postalCode: "",
      isDefault: false,
      label: "",
    });
  };

  const handleEditAddress = (address: any) => {
    setEditingAddress(address);
    setAddressForm({
      recipientName: address.recipientName || "",
      recipientPhone: address.recipientPhone || "",
      province: address.province || "",
      city: address.city || "",
      district: address.district || "",
      detailedAddress: address.detailedAddress || "",
      postalCode: address.postalCode || "",
      isDefault: address.isDefault === 1,
      label: address.label || "",
    });
  };

  const handleSaveAddress = async () => {
    try {
      const method = editingAddress?.id ? "PUT" : "POST";
      const url = editingAddress?.id
        ? `/api/user/address/${editingAddress.id}`
        : "/api/user/address";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addressForm),
      });

      if (!res.ok) throw new Error("保存地址失败");
      
      showMessage("success", "地址保存成功");
      setEditingAddress(null);
      await loadProfile();
    } catch (error) {
      console.error("保存地址失败:", error);
      showMessage("error", "保存地址失败");
    }
  };

  const handleDeleteAddress = async (addressId: number) => {
    if (!confirm("确定要删除这个地址吗？")) return;

    try {
      const res = await fetch(`/api/user/address/${addressId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("删除地址失败");
      
      showMessage("success", "地址删除成功");
      await loadProfile();
    } catch (error) {
      console.error("删除地址失败:", error);
      showMessage("error", "删除地址失败");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center">
          <Link href="/">
            <a className="text-gray-600 hover:text-gray-900">
              <ArrowLeft className="w-6 h-6" />
            </a>
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex-1 text-center">编辑资料</h1>
          <div className="w-6"></div>
        </div>
      </div>

      {/* 消息提示 */}
      {message && (
        <div
          className={`fixed top-16 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg z-50 ${
            message.type === "success" ? "bg-[#4CAF50]" : "bg-[#D32F2F]"
          } text-white`}
        >
          {message.text}
        </div>
      )}

      {/* 标签页导航 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 flex space-x-6">
          <button
            onClick={() => setActiveTab("basic")}
            className={`py-3 px-2 border-b-2 transition-colors ${
              activeTab === "basic"
                ? "border-[#D32F2F] text-[#D32F2F] font-medium"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            基本信息
          </button>
          <button
            onClick={() => setActiveTab("verification")}
            className={`py-3 px-2 border-b-2 transition-colors ${
              activeTab === "verification"
                ? "border-[#D32F2F] text-[#D32F2F] font-medium"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            实名认证
          </button>
          <button
            onClick={() => setActiveTab("address")}
            className={`py-3 px-2 border-b-2 transition-colors ${
              activeTab === "address"
                ? "border-[#D32F2F] text-[#D32F2F] font-medium"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            收件地址
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* 基本信息标签页 */}
        {activeTab === "basic" && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">基本信息</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  用户名
                </label>
                <input
                  type="text"
                  value={basicForm.name}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  昵称
                </label>
                <input
                  type="text"
                  value={basicForm.nickname}
                  onChange={(e) => setBasicForm({ ...basicForm, nickname: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                  placeholder="请输入昵称"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  邮箱
                </label>
                <input
                  type="email"
                  value={basicForm.email}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  手机号
                </label>
                <input
                  type="tel"
                  value={basicForm.phone}
                  onChange={(e) => setBasicForm({ ...basicForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                  placeholder="请输入手机号"
                />
              </div>
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="mt-6 w-full bg-[#D32F2F] text-white py-2 rounded-lg hover:bg-[#D32F2F]-dark transition-colors disabled:bg-gray-400"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        )}

        {/* 实名认证标签页 */}
        {activeTab === "verification" && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">实名认证</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  真实姓名
                </label>
                <input
                  type="text"
                  value={verificationForm.realName}
                  onChange={(e) =>
                    setVerificationForm({ ...verificationForm, realName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                  placeholder="请输入真实姓名"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  身份证号
                </label>
                <input
                  type="text"
                  value={verificationForm.idCardNumber}
                  onChange={(e) =>
                    setVerificationForm({ ...verificationForm, idCardNumber: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                  placeholder="请输入身份证号"
                  maxLength={18}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  认证状态
                </label>
                <div
                  className={`px-3 py-2 rounded-lg ${
                    verificationForm.verificationStatus === "verified"
                      ? "bg-[#E8F5E9] text-green-700"
                      : verificationForm.verificationStatus === "rejected"
                      ? "bg-[#FFEBEE] text-[#D32F2F]"
                      : "bg-[#FAF3ED] text-[#CBA471]"
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
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="mt-6 w-full bg-[#D32F2F] text-white py-2 rounded-lg hover:bg-[#D32F2F]-dark transition-colors disabled:bg-gray-400"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        )}

        {/* 收件地址标签页 */}
        {activeTab === "address" && (
          <div className="space-y-4">
            {/* 地址列表 */}
            {addresses.map((address) => (
              <div key={address.id} className="bg-white rounded-lg shadow-sm p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-medium text-gray-900">{address.recipientName}</span>
                      <span className="text-gray-600">{address.recipientPhone}</span>
                      {address.isDefault === 1 && (
                        <span className="px-2 py-0.5 text-xs bg-[#D32F2F] text-white rounded">
                          默认
                        </span>
                      )}
                      {address.label && (
                        <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                          {address.label}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">
                      {address.province} {address.city} {address.district}
                    </p>
                    <p className="text-sm text-gray-600">{address.detailedAddress}</p>
                    {address.postalCode && (
                      <p className="text-sm text-gray-500">邮编: {address.postalCode}</p>
                    )}
                  </div>
                  <div className="flex space-x-2 ml-4">
                    <button
                      onClick={() => handleEditAddress(address)}
                      className="text-[#D32F2F] hover:text-[#D32F2F]-dark text-sm"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDeleteAddress(address.id)}
                      className="text-[#D32F2F] hover:text-[#D32F2F] text-sm"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* 添加地址按钮 */}
            {!editingAddress && (
              <button
                onClick={handleAddAddress}
                className="w-full bg-white border-2 border-dashed border-gray-300 rounded-lg py-4 text-gray-600 hover:border-[#D32F2F] hover:text-[#D32F2F] transition-colors"
              >
                + 添加新地址
              </button>
            )}

            {/* 地址编辑表单 */}
            {editingAddress && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900">
                    {editingAddress.id ? "编辑地址" : "添加地址"}
                  </h3>
                  <button
                    onClick={() => setEditingAddress(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        收件人 <span className="text-[#D32F2F]">*</span>
                      </label>
                      <input
                        type="text"
                        value={addressForm.recipientName}
                        onChange={(e) =>
                          setAddressForm({ ...addressForm, recipientName: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                        placeholder="请输入收件人姓名"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        手机号 <span className="text-[#D32F2F]">*</span>
                      </label>
                      <input
                        type="tel"
                        value={addressForm.recipientPhone}
                        onChange={(e) =>
                          setAddressForm({ ...addressForm, recipientPhone: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                        placeholder="请输入手机号"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        省份
                      </label>
                      <input
                        type="text"
                        value={addressForm.province}
                        onChange={(e) =>
                          setAddressForm({ ...addressForm, province: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                        placeholder="省份"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        城市
                      </label>
                      <input
                        type="text"
                        value={addressForm.city}
                        onChange={(e) =>
                          setAddressForm({ ...addressForm, city: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                        placeholder="城市"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        区县
                      </label>
                      <input
                        type="text"
                        value={addressForm.district}
                        onChange={(e) =>
                          setAddressForm({ ...addressForm, district: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                        placeholder="区县"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      详细地址 <span className="text-[#D32F2F]">*</span>
                    </label>
                    <textarea
                      value={addressForm.detailedAddress}
                      onChange={(e) =>
                        setAddressForm({ ...addressForm, detailedAddress: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                      placeholder="请输入详细地址"
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        邮政编码
                      </label>
                      <input
                        type="text"
                        value={addressForm.postalCode}
                        onChange={(e) =>
                          setAddressForm({ ...addressForm, postalCode: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                        placeholder="邮政编码"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        地址标签
                      </label>
                      <input
                        type="text"
                        value={addressForm.label}
                        onChange={(e) =>
                          setAddressForm({ ...addressForm, label: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                        placeholder="如：家、公司"
                      />
                    </div>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="isDefault"
                      checked={addressForm.isDefault}
                      onChange={(e) =>
                        setAddressForm({ ...addressForm, isDefault: e.target.checked })
                      }
                      className="w-4 h-4 text-[#D32F2F] border-gray-300 rounded focus:ring-[#A80000]"
                    />
                    <label htmlFor="isDefault" className="ml-2 text-sm text-gray-700">
                      设为默认地址
                    </label>
                  </div>
                </div>
                <div className="flex space-x-3 mt-6">
                  <button
                    onClick={() => setEditingAddress(null)}
                    className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveAddress}
                    className="flex-1 bg-[#D32F2F] text-white py-2 rounded-lg hover:bg-[#D32F2F]-dark transition-colors"
                  >
                    保存
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
