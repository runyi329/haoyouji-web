import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Save, Plus, Trash2, Check } from "lucide-react";

interface UserProfile {
  // 基本信息
  name: string;
  nickname: string;
  email: string;
  phone: string;
  
  // 实名认证
  realName: string;
  idCardNumber: string;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  
  // 支付账号
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
  digitalWalletAddress: string;
  alipayAccount: string;
  wechatAccount: string;
}

interface ShippingAddress {
  id?: number;
  recipientName: string;
  recipientPhone: string;
  province: string;
  city: string;
  district: string;
  detailedAddress: string;
  postalCode: string;
  isDefault: boolean;
  label: string;
}

export default function ProfileEdit() {
  const [activeTab, setActiveTab] = useState<'basic' | 'verification' | 'payment' | 'address'>('basic');
  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    nickname: '',
    email: '',
    phone: '',
    realName: '',
    idCardNumber: '',
    verificationStatus: 'pending',
    bankName: '',
    bankAccountNumber: '',
    bankAccountName: '',
    digitalWalletAddress: '',
    alipayAccount: '',
    wechatAccount: '',
  });
  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<ShippingAddress | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // 加载用户资料
  useEffect(() => {
    loadProfile();
    loadAddresses();
  }, []);

  const loadProfile = async () => {
    try {
      const response = await fetch('/api/user/profile');
      if (response.ok) {
        const data = await response.json();
        setProfile(data);
      }
    } catch (error) {
      console.error('加载资料失败:', error);
    }
  };

  const loadAddresses = async () => {
    try {
      const response = await fetch('/api/user/addresses');
      if (response.ok) {
        const data = await response.json();
        setAddresses(data);
      }
    } catch (error) {
      console.error('加载地址失败:', error);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      
      if (response.ok) {
        setMessage({ type: 'success', text: '保存成功' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: '保存失败' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '保存失败' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAddress = async (address: ShippingAddress) => {
    try {
      const method = address.id ? 'PUT' : 'POST';
      const url = address.id ? `/api/user/addresses/${address.id}` : '/api/user/addresses';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(address),
      });
      
      if (response.ok) {
        await loadAddresses();
        setShowAddressForm(false);
        setEditingAddress(null);
        setMessage({ type: 'success', text: '地址保存成功' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      setMessage({ type: 'error', text: '地址保存失败' });
    }
  };

  const handleDeleteAddress = async (id: number) => {
    if (!confirm('确定要删除这个地址吗？')) return;
    
    try {
      const response = await fetch(`/api/user/addresses/${id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        await loadAddresses();
        setMessage({ type: 'success', text: '地址删除成功' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      setMessage({ type: 'error', text: '地址删除失败' });
    }
  };

  const tabs = [
    { key: 'basic', label: '基本信息' },
    { key: 'verification', label: '实名认证' },
    { key: 'payment', label: '支付账号' },
    { key: 'address', label: '收件地址' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">编辑资料</h1>
          </div>
          <button
            onClick={handleSaveProfile}
            disabled={saving || activeTab === 'address'}
            className="px-4 py-2 bg-[#A80000] text-white rounded-lg hover:bg-[#800000] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`max-w-4xl mx-auto px-4 mt-4`}>
          <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {message.text}
          </div>
        </div>
      )}

      {/* 标签页导航 */}
      <div className="max-w-4xl mx-auto px-4 mt-6">
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-200">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'text-[#A80000] border-b-2 border-[#A80000] bg-red-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 内容区域 */}
          <div className="p-6">
            {/* 基本信息 */}
            {activeTab === 'basic' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">姓名</label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                    placeholder="请输入姓名"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">昵称</label>
                  <input
                    type="text"
                    value={profile.nickname}
                    onChange={(e) => setProfile({ ...profile, nickname: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                    placeholder="请输入昵称"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">邮箱</label>
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                    placeholder="请输入邮箱"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">手机号</label>
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                    placeholder="请输入手机号"
                  />
                </div>
              </div>
            )}

            {/* 实名认证 */}
            {activeTab === 'verification' && (
              <div className="space-y-6">
                {profile.verificationStatus === 'verified' && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-600" />
                    <span className="text-green-800 font-medium">已完成实名认证</span>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">真实姓名</label>
                  <input
                    type="text"
                    value={profile.realName}
                    onChange={(e) => setProfile({ ...profile, realName: e.target.value })}
                    disabled={profile.verificationStatus === 'verified'}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent disabled:bg-gray-100"
                    placeholder="请输入真实姓名"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">身份证号</label>
                  <input
                    type="text"
                    value={profile.idCardNumber}
                    onChange={(e) => setProfile({ ...profile, idCardNumber: e.target.value })}
                    disabled={profile.verificationStatus === 'verified'}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent disabled:bg-gray-100"
                    placeholder="请输入身份证号"
                    maxLength={18}
                  />
                </div>
                {profile.verificationStatus === 'pending' && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-yellow-800 text-sm">实名认证审核中，请耐心等待</p>
                  </div>
                )}
              </div>
            )}

            {/* 支付账号 */}
            {activeTab === 'payment' && (
              <div className="space-y-6">
                <div className="border-b border-gray-200 pb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">银行卡</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">银行名称</label>
                      <input
                        type="text"
                        value={profile.bankName}
                        onChange={(e) => setProfile({ ...profile, bankName: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                        placeholder="如：中国工商银行"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">银行卡号</label>
                      <input
                        type="text"
                        value={profile.bankAccountNumber}
                        onChange={(e) => setProfile({ ...profile, bankAccountNumber: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                        placeholder="请输入银行卡号"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">持卡人姓名</label>
                      <input
                        type="text"
                        value={profile.bankAccountName}
                        onChange={(e) => setProfile({ ...profile, bankAccountName: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                        placeholder="请输入持卡人姓名"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-b border-gray-200 pb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">数字钱包</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">钱包地址</label>
                    <input
                      type="text"
                      value={profile.digitalWalletAddress}
                      onChange={(e) => setProfile({ ...profile, digitalWalletAddress: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                      placeholder="请输入数字钱包地址"
                    />
                  </div>
                </div>

                <div className="border-b border-gray-200 pb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">支付宝</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">支付宝账号</label>
                    <input
                      type="text"
                      value={profile.alipayAccount}
                      onChange={(e) => setProfile({ ...profile, alipayAccount: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                      placeholder="手机号或邮箱"
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">微信</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">微信号</label>
                    <input
                      type="text"
                      value={profile.wechatAccount}
                      onChange={(e) => setProfile({ ...profile, wechatAccount: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                      placeholder="请输入微信号"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 收件地址 */}
            {activeTab === 'address' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">我的地址</h3>
                  <button
                    onClick={() => {
                      setEditingAddress({
                        recipientName: '',
                        recipientPhone: '',
                        province: '',
                        city: '',
                        district: '',
                        detailedAddress: '',
                        postalCode: '',
                        isDefault: false,
                        label: '家',
                      });
                      setShowAddressForm(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-[#A80000] text-white rounded-lg hover:bg-[#800000] transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    添加地址
                  </button>
                </div>

                {/* 地址列表 */}
                {addresses.length === 0 && !showAddressForm && (
                  <div className="text-center py-12 text-gray-500">
                    暂无收件地址
                  </div>
                )}

                {addresses.map(address => (
                  <div key={address.id} className="border border-gray-200 rounded-lg p-4 hover:border-[#A80000] transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{address.recipientName}</span>
                        <span className="text-gray-600">{address.recipientPhone}</span>
                        {address.isDefault && (
                          <span className="px-2 py-0.5 bg-[#A80000] text-white text-xs rounded">默认</span>
                        )}
                        {address.label && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">{address.label}</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingAddress(address);
                            setShowAddressForm(true);
                          }}
                          className="text-[#A80000] hover:text-[#800000] text-sm"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => address.id && handleDeleteAddress(address.id)}
                          className="text-red-600 hover:text-red-700 text-sm"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    <p className="text-gray-600 text-sm">
                      {address.province} {address.city} {address.district} {address.detailedAddress}
                    </p>
                    {address.postalCode && (
                      <p className="text-gray-500 text-xs mt-1">邮编：{address.postalCode}</p>
                    )}
                  </div>
                ))}

                {/* 地址表单 */}
                {showAddressForm && editingAddress && (
                  <div className="border-2 border-[#A80000] rounded-lg p-6 bg-red-50">
                    <h4 className="text-lg font-medium text-gray-900 mb-4">
                      {editingAddress.id ? '编辑地址' : '新增地址'}
                    </h4>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">收件人</label>
                          <input
                            type="text"
                            value={editingAddress.recipientName}
                            onChange={(e) => setEditingAddress({ ...editingAddress, recipientName: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                            placeholder="请输入收件人姓名"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">手机号</label>
                          <input
                            type="tel"
                            value={editingAddress.recipientPhone}
                            onChange={(e) => setEditingAddress({ ...editingAddress, recipientPhone: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                            placeholder="请输入手机号"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">省份</label>
                          <input
                            type="text"
                            value={editingAddress.province}
                            onChange={(e) => setEditingAddress({ ...editingAddress, province: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                            placeholder="省份"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">城市</label>
                          <input
                            type="text"
                            value={editingAddress.city}
                            onChange={(e) => setEditingAddress({ ...editingAddress, city: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                            placeholder="城市"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">区/县</label>
                          <input
                            type="text"
                            value={editingAddress.district}
                            onChange={(e) => setEditingAddress({ ...editingAddress, district: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                            placeholder="区/县"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">详细地址</label>
                        <textarea
                          value={editingAddress.detailedAddress}
                          onChange={(e) => setEditingAddress({ ...editingAddress, detailedAddress: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                          rows={3}
                          placeholder="街道、楼栋号、单元室等"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">邮编（选填）</label>
                          <input
                            type="text"
                            value={editingAddress.postalCode}
                            onChange={(e) => setEditingAddress({ ...editingAddress, postalCode: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                            placeholder="邮政编码"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">标签（选填）</label>
                          <select
                            value={editingAddress.label}
                            onChange={(e) => setEditingAddress({ ...editingAddress, label: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A80000] focus:border-transparent"
                          >
                            <option value="家">家</option>
                            <option value="公司">公司</option>
                            <option value="学校">学校</option>
                            <option value="其他">其他</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="isDefault"
                          checked={editingAddress.isDefault}
                          onChange={(e) => setEditingAddress({ ...editingAddress, isDefault: e.target.checked })}
                          className="w-4 h-4 text-[#A80000] border-gray-300 rounded focus:ring-[#A80000]"
                        />
                        <label htmlFor="isDefault" className="text-sm text-gray-700">设为默认地址</label>
                      </div>
                      <div className="flex gap-3 pt-4">
                        <button
                          onClick={() => handleSaveAddress(editingAddress)}
                          className="flex-1 px-4 py-2 bg-[#A80000] text-white rounded-lg hover:bg-[#800000] transition-colors"
                        >
                          保存地址
                        </button>
                        <button
                          onClick={() => {
                            setShowAddressForm(false);
                            setEditingAddress(null);
                          }}
                          className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                        >
                          取消
                        </button>
                      </div>
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
