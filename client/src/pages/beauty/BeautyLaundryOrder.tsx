/**
 * 奢贝美容院 - 尤亮洗衣下单页
 * 路径: /beauty/laundry/order
 */
import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { ChevronLeft, MapPin, Clock, MessageSquare, ChevronRight, Shield, Truck } from "lucide-react";

const PACKAGES: Record<string, { label: string; price: number }> = {
  "1": { label: "衣鞋任洗1件", price: 29 },
  "2": { label: "衣鞋任洗2件", price: 49 },
  "3": { label: "衣鞋任洗3件", price: 66 },
  "4": { label: "衣鞋任洗4件", price: 85 },
  "5": { label: "衣鞋任洗5件", price: 99 },
  "6": { label: "衣鞋任洗6件", price: 106 },
  "shoe1": { label: "运动鞋清洗1双", price: 25 },
  "shoe2": { label: "运动鞋清洗2双", price: 45 },
  "shoe3": { label: "运动鞋清洗3双", price: 60 },
};

const CARDS: Record<string, string> = {
  "single": "单次卡",
  "3x": "3次卡",
  "6x": "6次卡",
};

const TIME_SLOTS = [
  "08:00 - 10:00",
  "10:00 - 12:00",
  "12:00 - 14:00",
  "14:00 - 16:00",
  "16:00 - 18:00",
  "18:00 - 20:00",
];

const PROVINCES = ["北京", "上海", "广东", "浙江", "江苏", "四川", "湖北", "湖南", "山东", "河南", "福建", "陕西", "其他"];

export default function BeautyLaundryOrder() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const pkgId = params.get("pkg") || "3";
  const cardId = params.get("card") || "single";

  const pkg = PACKAGES[pkgId] || PACKAGES["3"];
  const cardLabel = CARDS[cardId] || "单次卡";

  // 表单状态
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [sameReturn, setSameReturn] = useState(true);
  const [returnAddress, setReturnAddress] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 获取明天起7天的日期选项
  const getDateOptions = () => {
    const dates = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const label = `${d.getMonth() + 1}月${d.getDate()}日（${["日","一","二","三","四","五","六"][d.getDay()]}）`;
      const value = d.toISOString().split("T")[0];
      dates.push({ label, value });
    }
    return dates;
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "请填写姓名";
    if (!phone.trim() || !/^1\d{10}$/.test(phone)) errs.phone = "请填写正确的手机号";
    if (!province) errs.province = "请选择省份";
    if (!city.trim()) errs.city = "请填写城市";
    if (!address.trim()) errs.address = "请填写详细地址";
    if (!sameReturn && !returnAddress.trim()) errs.returnAddress = "请填写送回地址";
    if (!pickupDate) errs.pickupDate = "请选择取件日期";
    if (!pickupTime) errs.pickupTime = "请选择取件时间段";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    setSubmitting(true);
    const subject = encodeURIComponent(`尤亮洗衣-${pkg.label}-${cardLabel}`);
    const url = `https://jiangyuchen.cn/api/alipay/quick-pay?amount=${pkg.price}&subject=${subject}`;
    window.location.href = url;
  };

  const inputClass = (field: string) =>
    `w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition-colors ${
      errors[field] ? "border-red-400 bg-red-50" : "border-gray-200 bg-white focus:border-red-400"
    }`;

  return (
    <div className="min-h-screen bg-gray-50 pb-28" style={{ fontFamily: "'PingFang SC', 'Helvetica Neue', sans-serif" }}>
      {/* 顶部导航 */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-100 flex items-center px-4 py-3">
        <button onClick={() => navigate(`/beauty/laundry`)} className="mr-3 p-1">
          <ChevronLeft size={22} className="text-gray-700" />
        </button>
        <span className="text-base font-medium text-gray-800 flex-1">填写订单信息</span>
        <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
          <Shield size={12} />
          <span>安全支付</span>
        </div>
      </div>

      {/* 订单摘要 */}
      <div className="mx-4 mt-4 bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-800">尤亮洗衣服务</span>
          <span className="text-lg font-bold text-red-500">¥{pkg.price}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="bg-gray-100 px-2 py-0.5 rounded">{pkg.label}</span>
          <span className="bg-gray-100 px-2 py-0.5 rounded">{cardLabel}</span>
        </div>
        <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
          <Truck size={11} />
          <span>免费上门取送 · 洗坏赔 · 超时赔</span>
        </div>
      </div>

      {/* 联系信息 */}
      <div className="mx-4 mt-3 bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-4 bg-red-500 rounded-full" />
          <span className="text-sm font-medium text-gray-800">联系信息</span>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">姓名 *</label>
            <input
              className={inputClass("name")}
              placeholder="请填写真实姓名"
              value={name}
              onChange={e => setName(e.target.value)}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">手机号 *</label>
            <input
              className={inputClass("phone")}
              placeholder="请填写手机号"
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
            {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
          </div>
        </div>
      </div>

      {/* 取件地址 */}
      <div className="mx-4 mt-3 bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <MapPin size={14} className="text-red-500" />
          <span className="text-sm font-medium text-gray-800">上门取件地址 *</span>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">省份 *</label>
              <select
                className={`${inputClass("province")} appearance-none`}
                value={province}
                onChange={e => setProvince(e.target.value)}
              >
                <option value="">请选择</option>
                {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {errors.province && <p className="text-xs text-red-500 mt-1">{errors.province}</p>}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">城市 *</label>
              <input
                className={inputClass("city")}
                placeholder="城市/区县"
                value={city}
                onChange={e => setCity(e.target.value)}
              />
              {errors.city && <p className="text-xs text-red-500 mt-1">{errors.city}</p>}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">详细地址 *</label>
            <input
              className={inputClass("address")}
              placeholder="街道、楼栋、门牌号"
              value={address}
              onChange={e => setAddress(e.target.value)}
            />
            {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address}</p>}
          </div>
        </div>
      </div>

      {/* 送回地址 */}
      <div className="mx-4 mt-3 bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Truck size={14} className="text-red-500" />
            <span className="text-sm font-medium text-gray-800">洗完送回地址</span>
          </div>
          <button
            onClick={() => setSameReturn(!sameReturn)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors ${
              sameReturn ? "border-red-400 text-red-500 bg-red-50" : "border-gray-200 text-gray-500"
            }`}
          >
            <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${sameReturn ? "border-red-500" : "border-gray-300"}`}>
              {sameReturn && <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />}
            </div>
            同取件地址
          </button>
        </div>
        {!sameReturn && (
          <div>
            <input
              className={inputClass("returnAddress")}
              placeholder="省市区 + 详细地址（支持异地送回）"
              value={returnAddress}
              onChange={e => setReturnAddress(e.target.value)}
            />
            {errors.returnAddress && <p className="text-xs text-red-500 mt-1">{errors.returnAddress}</p>}
          </div>
        )}
        {sameReturn && (
          <p className="text-xs text-gray-400">洗净后送回取件地址</p>
        )}
      </div>

      {/* 预约取件时间 */}
      <div className="mx-4 mt-3 bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={14} className="text-red-500" />
          <span className="text-sm font-medium text-gray-800">预约取件时间 *</span>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">取件日期</label>
            <select
              className={`${inputClass("pickupDate")} appearance-none`}
              value={pickupDate}
              onChange={e => setPickupDate(e.target.value)}
            >
              <option value="">请选择日期</option>
              {getDateOptions().map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
            {errors.pickupDate && <p className="text-xs text-red-500 mt-1">{errors.pickupDate}</p>}
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-2 block">取件时间段</label>
            <div className="grid grid-cols-3 gap-2">
              {TIME_SLOTS.map(slot => (
                <button
                  key={slot}
                  onClick={() => setPickupTime(slot)}
                  className={`py-2 rounded-lg text-xs border transition-all ${
                    pickupTime === slot
                      ? "border-red-500 bg-red-50 text-red-600 font-medium"
                      : "border-gray-200 text-gray-600"
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
            {errors.pickupTime && <p className="text-xs text-red-500 mt-1">{errors.pickupTime}</p>}
          </div>
        </div>
      </div>

      {/* 备注 */}
      <div className="mx-4 mt-3 bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={14} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-800">备注（选填）</span>
        </div>
        <textarea
          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-red-400 resize-none bg-white"
          placeholder="如有特殊要求请在此说明，例如：衣物材质、特殊污渍位置等"
          rows={3}
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      {/* 服务承诺 */}
      <div className="mx-4 mt-3 bg-gradient-to-r from-red-50 to-pink-50 rounded-xl p-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { icon: "🛡️", text: "洗坏赔" },
            { icon: "⏰", text: "超时赔" },
            { icon: "📦", text: "丢失赔" },
          ].map((item, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="text-lg">{item.icon}</span>
              <span className="text-xs text-red-500 font-medium">{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 底部结算栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 z-50">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-xs text-gray-500 mb-0.5">实付金额</div>
            <div className="flex items-baseline gap-1">
              <span className="text-xs text-red-500">¥</span>
              <span className="text-2xl font-bold text-red-500">{pkg.price}</span>
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-gradient-to-r from-red-500 to-pink-500 text-white px-8 py-3.5 rounded-full text-base font-medium shadow-lg active:scale-95 transition-transform disabled:opacity-60 flex items-center gap-2"
          >
            {submitting ? "跳转中..." : "确认支付"}
            {!submitting && <ChevronRight size={16} />}
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-2">点击确认支付将跳转支付宝完成付款</p>
      </div>
    </div>
  );
}
