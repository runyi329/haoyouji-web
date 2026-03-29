/**
 * 奢贝美容院 - 尤亮洗衣服务详情页
 * 路径: /beauty/laundry
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Star, Shield, Truck, Clock, Award } from "lucide-react";

const CDN = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb";

const DETAIL_IMAGES = [
  `${CDN}/detail1_youliangxiyi_cb5004c1.png`,
  `${CDN}/jd_detail_2_features_77cf36f8.jpg`,
  `${CDN}/jd_detail_3_4_merged_ed1a3f26.jpg`,
  `${CDN}/jd_detail_5_clean_7ef1e52a.jpg`,
  `${CDN}/jd_detail_6_size_879b8fc1.jpg`,
  `${CDN}/jd_detail_7_tracking_73e2020c.jpg`,
  `${CDN}/jd_detail_8_guarantee_ab80401b.jpg`,
  `${CDN}/jd_detail_9_promise_75154a34.jpg`,
  `${CDN}/jd_detail_10_process_09618528.jpg`,
  `${CDN}/jd_detail_11_scope_6ee8ef43.jpg`,
  `${CDN}/jd_detail_12_scope2_4ebeb1f3.jpg`,
];

const BANNER_IMAGES = [
  `${CDN}/banner1_3d_c91a06c5.png`,
];

const PACKAGES = [
  { id: "3", label: "衣鞋任洗3件", price: 66, hot: true },
];

const CARDS = [
  { id: "single", label: "单次卡" },
];

export default function BeautyLaundry() {
  const [, navigate] = useLocation();
  const [bannerIndex, setBannerIndex] = useState(0);
  const [selectedPkg, setSelectedPkg] = useState("3");
  const [selectedCard, setSelectedCard] = useState("single");
  const [activeTab, setActiveTab] = useState<"detail" | "scope" | "guarantee">("detail");

  const currentPkg = PACKAGES.find(p => p.id === selectedPkg)!;

  const handleOrder = () => {
    navigate(`/beauty/laundry/order?pkg=${selectedPkg}&card=${selectedCard}`);
  };

  return (
    <div className="min-h-screen bg-white pb-24" style={{ fontFamily: "'PingFang SC', 'Helvetica Neue', sans-serif" }}>
      {/* 顶部导航 */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-100 flex items-center px-4 py-3">
        <button onClick={() => navigate("/beauty")} className="mr-3 p-1">
          <ChevronLeft size={22} className="text-gray-700" />
        </button>
        <span className="text-base font-medium text-gray-800 flex-1">尤亮洗衣服务</span>
        <div className="flex items-center gap-1 text-xs text-red-500 bg-red-50 px-2 py-1 rounded-full">
          <Award size={12} />
          <span>洗护热卖榜第1名</span>
        </div>
      </div>

      {/* 主图轮播 */}
      <div className="relative w-full aspect-square bg-gray-50 overflow-hidden">
        <img
          src={BANNER_IMAGES[bannerIndex]}
          alt="尤亮洗衣"
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
          {BANNER_IMAGES.map((_, i) => (
            <button
              key={i}
              onClick={() => setBannerIndex(i)}
              className={`h-1.5 rounded-full transition-all ${i === bannerIndex ? "bg-red-500 w-4" : "bg-white/70 w-1.5"}`}
            />
          ))}
        </div>
      </div>

      {/* 价格区 */}
      <div className="px-4 pt-4 pb-3 bg-gradient-to-r from-red-50 to-pink-50">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-xs text-red-500">到手价</span>
          <span className="text-3xl font-bold text-red-500">¥{currentPkg.price}</span>
          <span className="text-sm text-gray-400 line-through">¥{Math.round(currentPkg.price * 1.5)}</span>
        </div>
        <div className="text-base font-medium text-gray-800 mb-1">
          尤亮洗衣服务 {currentPkg.label} 上门取送 去渍整形
        </div>
        <div className="text-xs text-gray-500">价值2000元内衣服鞋子均可洗</div>
        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Star size={12} className="text-yellow-400 fill-yellow-400" />
            <span>300万+好评</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Shield size={12} className="text-green-500" />
            <span>洗坏赔 · 超时赔 · 丢失赔</span>
          </div>
        </div>
      </div>

      {/* 服务特点横条 */}
      <div className="flex items-center justify-around px-4 py-3 bg-white border-b border-gray-100">
        {[
          { icon: <Truck size={14} />, text: "免费取送" },
          { icon: <Shield size={14} />, text: "洗坏赔" },
          { icon: <Clock size={14} />, text: "全程可视" },
          { icon: <Award size={14} />, text: "专业洗护" },
        ].map((item, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="text-red-500">{item.icon}</div>
            <span className="text-xs text-gray-600">{item.text}</span>
          </div>
        ))}
      </div>

      {/* 套餐选择 */}
      <div className="px-4 py-4 bg-white border-b border-gray-100">
        <div className="text-sm font-medium text-gray-700 mb-3">选择套餐</div>
        <div className="flex flex-wrap gap-2">
          {PACKAGES.map(pkg => (
            <button
              key={pkg.id}
              onClick={() => setSelectedPkg(pkg.id)}
              className={`relative px-3 py-2 rounded-lg text-xs border transition-all ${
                selectedPkg === pkg.id
                  ? "border-red-500 bg-red-50 text-red-600 font-medium"
                  : "border-gray-200 text-gray-600"
              }`}
            >
              {(pkg as { hot?: boolean }).hot && (
                <span className="absolute -top-1.5 -right-1 bg-red-500 text-white text-[9px] px-1 rounded-full">热销</span>
              )}
              <div>{pkg.label}</div>
              <div className={`text-[11px] mt-0.5 ${selectedPkg === pkg.id ? "text-red-500" : "text-gray-400"}`}>
                ¥{pkg.price}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 次数卡选择 */}
      <div className="px-4 py-4 bg-white border-b border-gray-100">
        <div className="text-sm font-medium text-gray-700 mb-3">次数卡</div>
        <div className="flex gap-2">
          {CARDS.map(card => (
            <button
              key={card.id}
              onClick={() => setSelectedCard(card.id)}
              className={`px-4 py-2 rounded-lg text-sm border transition-all ${
                selectedCard === card.id
                  ? "border-red-500 bg-red-50 text-red-600 font-medium"
                  : "border-gray-200 text-gray-600"
              }`}
            >
              {card.label}
            </button>
          ))}
        </div>
      </div>

      {/* 配送信息 */}
      <div className="px-4 py-3 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Truck size={14} className="text-red-500 flex-shrink-0" />
          <span>免费上门取送 · 支持收寄异地 · 7天无理由退款</span>
        </div>
      </div>

      {/* 商品详情 Tab */}
      <div className="bg-white mt-2">
        <div className="flex border-b border-gray-100">
          {[
            { key: "detail", label: "商品详情" },
            { key: "scope", label: "清洗范围" },
            { key: "guarantee", label: "售后保障" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-red-500 text-red-500"
                  : "border-transparent text-gray-500"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "detail" && (
          <div>
            <div className="bg-gradient-to-br from-red-500 to-pink-600 text-white text-center py-8 px-4">
              <div className="text-2xl font-bold mb-2">尤亮洗衣</div>
              <div className="text-sm opacity-90">洗衣用尤亮，方便又轻松</div>
            </div>
            {DETAIL_IMAGES.slice(0, 9).map((src, i) => (
              <img key={i} src={src} alt={`详情图${i + 1}`} className="w-full block" loading="lazy" />
            ))}
          </div>
        )}

        {activeTab === "scope" && (
          <div>
            {DETAIL_IMAGES.slice(9).map((src, i) => (
              <img key={i} src={src} alt={`范围图${i + 1}`} className="w-full block" loading="lazy" />
            ))}
            <div className="px-4 py-4 text-sm text-gray-600 leading-relaxed">
              <div className="font-medium text-gray-800 mb-2">清洗范围内</div>
              <p className="mb-3">羽绒/棉服、毛呢大衣、毛衣、休闲外套、西装、衬衫、T恤、裤装；布面、网面、革面等普通材质且价值2000元以内的运动鞋。</p>
              <div className="font-medium text-gray-800 mb-2">清洗范围外</div>
              <ul className="space-y-1 text-gray-500 text-xs">
                <li>· 皮革类、真丝类、绒面类材质或带电子元件的鞋服</li>
                <li>· 旗袍、婚纱、礼服、演出服等特殊服装</li>
                <li>· 购买价值超过2000元的鞋服、奢侈品</li>
                <li>· 宠物衣物、湿的衣物、大面积血迹衣物</li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === "guarantee" && (
          <div className="px-4 py-4 space-y-4">
            {[
              {
                num: "01",
                title: "洗坏赔承诺",
                desc: "根据实际物损情况判定赔付金额，轻微损坏赔付1-5倍实付单件清洗费，赔付金额根据损伤情况判定。",
              },
              {
                num: "02",
                title: "超时赔承诺",
                desc: "6-11月全程时效7日，其余时间9日。超时24小时未送回，给予10元可叠加优惠券作超时赔。",
              },
              {
                num: "03",
                title: "丢失赔承诺",
                desc: "无购买凭证赔付上限为40倍单件清洗费；有购买凭证按凭证价格赔付，不折旧，赔付上限2000元。",
              },
              {
                num: "04",
                title: "未洗净赔付",
                desc: "订单中未洗净（无法去除的污渍除外）的衣物，予以等额优惠券作为补偿。",
              },
            ].map(item => (
              <div key={item.num} className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-red-500 font-bold text-lg">{item.num}</span>
                  <span className="font-medium text-gray-800">{item.title}</span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部购买栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-3 z-50">
        <div className="flex-1">
          <div className="text-xs text-gray-500">已选：{currentPkg.label} · {CARDS.find(c => c.id === selectedCard)?.label}</div>
          <div className="text-lg font-bold text-red-500">¥{currentPkg.price}</div>
        </div>
        <button
          onClick={handleOrder}
          className="bg-gradient-to-r from-red-500 to-pink-500 text-white px-8 py-3 rounded-full text-base font-medium shadow-lg active:scale-95 transition-transform"
        >
          立即预约
        </button>
      </div>
    </div>
  );
}
