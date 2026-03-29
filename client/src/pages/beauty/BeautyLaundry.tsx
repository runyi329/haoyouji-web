/**
 * 奢贝美容院 - 洗衣服务（占位页面）
 * 路径: /beauty/laundry
 */
import { Link } from "wouter";
import { ArrowLeft, WashingMachine, Clock, MapPin, Phone, ChevronRight, Sparkles } from "lucide-react";
import BeautyTabBar from "./BeautyTabBar";

const SERVICES = [
  { name: "上门取送洗", desc: "专业师傅上门取件，洗净后送回", price: "¥29起", icon: "🚗" },
  { name: "精洗护理", desc: "高档衣物专业护理，还原如新", price: "¥59起", icon: "✨" },
  { name: "皮草羽绒", desc: "皮草、羽绒专项护理清洗", price: "¥99起", icon: "🧥" },
  { name: "窗帘床品", desc: "大件床品、窗帘专业清洗", price: "¥49起", icon: "🛏️" },
];

export default function BeautyLaundry() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-rose-500 to-pink-500 px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/beauty">
            <button className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center active:scale-90 transition-transform">
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
          </Link>
          <h1 className="text-white text-lg font-bold">洗衣服务</h1>
        </div>
        {/* 即将上线提示 */}
        <div className="bg-white/20 rounded-2xl px-4 py-3 flex items-center gap-3">
          <WashingMachine className="w-8 h-8 text-white flex-shrink-0" />
          <div>
            <p className="text-white font-semibold text-sm">上门洗衣服务</p>
            <p className="text-white/80 text-xs mt-0.5">功能即将上线，敬请期待</p>
          </div>
          <span className="ml-auto bg-amber-400 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">即将上线</span>
        </div>
      </div>

      {/* 服务介绍 */}
      <div className="flex-1 px-4 py-4 space-y-3">
        <p className="text-gray-500 text-xs text-center mb-2">以下为预期服务项目，正式上线后可在线预约</p>

        {SERVICES.map((s, i) => (
          <div key={i} className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-xl flex-shrink-0">
              {s.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-gray-800 font-semibold text-sm">{s.name}</p>
              <p className="text-gray-400 text-xs mt-0.5 truncate">{s.desc}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-rose-500 font-bold text-sm">{s.price}</span>
              <span className="text-gray-300 text-[10px]">暂未开放</span>
            </div>
          </div>
        ))}

        {/* 合作说明 */}
        <div className="bg-white rounded-2xl px-4 py-4 shadow-sm mt-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-rose-400" />
            <span className="text-gray-700 font-semibold text-sm">服务说明</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <Clock className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
              <p className="text-gray-500 text-xs">预约后 2 小时内上门取件，24-48 小时洗净送回</p>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
              <p className="text-gray-500 text-xs">服务范围：门店周边 5 公里内，支持上门取送</p>
            </div>
            <div className="flex items-start gap-2">
              <Phone className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
              <p className="text-gray-500 text-xs">如需提前咨询，可联系门店客服预登记</p>
            </div>
          </div>
        </div>

        {/* 预登记按钮（占位） */}
        <button
          className="w-full bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-2xl py-3.5 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform mt-2"
          onClick={() => {
            const el = document.createElement('div');
            el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.75);color:white;padding:12px 24px;border-radius:12px;font-size:14px;z-index:9999;';
            el.textContent = '功能即将上线，敬请期待';
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 2000);
          }}
        >
          <WashingMachine className="w-4 h-4" />
          预约登记（即将开放）
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <BeautyTabBar active="home" />
    </div>
  );
}
