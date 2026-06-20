import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Check, Crown, Zap } from "lucide-react";

interface MembershipPlan {
  id: string;
  name: string;
  duration: string;
  price: number;
  badge?: string;
  features: string[];
  highlighted?: boolean;
}

const MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    id: "basic-3m",
    name: "基础会员",
    duration: "3个月",
    price: 29,
    features: [
      "无限账本数量",
      "基础统计报表",
      "云端数据同步",
      "标准客户支持",
    ],
  },
  {
    id: "standard-6m",
    name: "标准会员",
    duration: "6个月",
    price: 49,
    features: [
      "多人实时协作",
      "云端自动备份",
      "高级统计分析",
      "优先技术支持",
      "自定义分类",
    ],
  },
  {
    id: "annual",
    name: "年度会员",
    duration: "12个月",
    price: 88,
    badge: "最受欢迎",
    highlighted: true,
    features: [
      "包含所有高级功能",
      "无限云端存储",
      "AI智能对账助手",
      "优先技术支持",
      "自定义报表导出",
      "家庭成员共享",
    ],
  },
  {
    id: "lifetime",
    name: "高级会员",
    duration: "终身",
    price: 198,
    badge: "终身享受",
    features: [
      "永久使用权",
      "所有功能无限制",
      "AI智能对账助手",
      "VIP专属支持",
      "优先新功能体验",
      "家庭成员无限共享",
      "企业级数据安全",
    ],
  },
];

export default function MemberShip() {
  const [, setLocation] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<string>("annual");

  const handlePurchase = (planId: string) => {
    setSelectedPlan(planId);
    // 这里会调用支付接口
    alert(`选择了 ${planId} 套餐，即将跳转到支付页面`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* 顶部导航 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center px-4 py-3">
          <button onClick={() => setLocation("/coupons")} className="mr-3">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold">会员产品</h1>
        </div>
      </div>

      {/* 标题区域 */}
      <div className="px-4 py-8 text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          升级会员，享受更多功能
        </h2>
        <p className="text-gray-600">选择适合您的会员套餐，开启高效记账之旅</p>
      </div>

      {/* 会员套餐卡片 */}
      <div className="px-4 pb-8">
        <div className="space-y-4">
          {MEMBERSHIP_PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl p-6 transition-all duration-300 cursor-pointer ${
                plan.highlighted
                  ? "bg-gradient-to-br from-[#D32F2F] to-[#B71C1C] text-white shadow-xl scale-105"
                  : "bg-white border border-gray-200 text-gray-900 hover:shadow-lg"
              }`}
              onClick={() => handlePurchase(plan.id)}
            >
              {/* 徽章 */}
              {plan.badge && (
                <div
                  className={`absolute -top-3 right-6 px-3 py-1 rounded-full text-xs font-semibold ${
                    plan.highlighted
                      ? "bg-yellow-300 text-gray-900"
                      : "bg-[#D32F2F] text-white"
                  }`}
                >
                  {plan.badge}
                </div>
              )}

              {/* 套餐信息 */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  {plan.highlighted && <Crown className="w-5 h-5" />}
                </div>
                <p
                  className={`text-sm ${
                    plan.highlighted ? "text-gray-100" : "text-gray-500"
                  }`}
                >
                  {plan.duration}
                </p>
              </div>

              {/* 价格 */}
              <div className="mb-6">
                <div className="flex items-baseline">
                  <span className="text-4xl font-bold">¥{plan.price}</span>
                  <span
                    className={`ml-2 text-sm ${
                      plan.highlighted ? "text-gray-100" : "text-gray-500"
                    }`}
                  >
                    {plan.duration}
                  </span>
                </div>
              </div>

              {/* 功能列表 */}
              <div className="space-y-3 mb-6">
                {plan.features.map((feature, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <Check
                      className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                        plan.highlighted ? "text-yellow-300" : "text-[#D32F2F]"
                      }`}
                    />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>

              {/* 购买按钮 */}
              <button
                className={`w-full py-3 rounded-lg font-semibold transition-all duration-300 ${
                  plan.highlighted
                    ? "bg-white text-[#D32F2F] hover:bg-gray-100"
                    : "bg-[#D32F2F] text-white hover:bg-[#B71C1C]"
                }`}
              >
                {selectedPlan === plan.id ? "已选择" : "立即购买"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 常见问题 */}
      <div className="px-4 py-8 bg-white border-t">
        <h3 className="text-lg font-bold text-gray-900 mb-4">常见问题</h3>
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">
              如何升级会员？
            </h4>
            <p className="text-sm text-gray-600">
              选择您想要的会员套餐，点击"立即购买"，通过微信支付完成付款即可。
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">
              可以退款吗？
            </h4>
            <p className="text-sm text-gray-600">
              在购买后7天内，如对服务不满意，可申请全额退款。请联系客服处理。
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">
              会员到期后会怎样？
            </h4>
            <p className="text-sm text-gray-600">
              会员到期后，您的账户将自动降级为免费版本，所有数据保留，但功能会受到限制。
            </p>
          </div>
        </div>
      </div>

      {/* 底部提示 */}
      <div className="px-4 py-6 text-center text-xs text-gray-500">
        <p>
          购买即表示同意我们的
          <a href="#" className="text-[#D32F2F] hover:underline">
            服务协议
          </a>
          和
          <a href="#" className="text-[#D32F2F] hover:underline">
            隐私政策
          </a>
        </p>
      </div>
    </div>
  );
}
