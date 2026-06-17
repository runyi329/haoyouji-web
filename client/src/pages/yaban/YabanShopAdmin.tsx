/**
 * 牙伴齿科管理 - 商城管理菜单页
 * 路由：/yaban/shop/admin
 * 入口：我的 → 商城管理
 * 风格：蓝色系，沿用牙伴整体清爽蓝白风
 */
import { useLocation } from "wouter";
import {
  ChevronLeft,
  Package,
  ClipboardList,
  CreditCard,
  Ticket,
  BarChart3,
  Megaphone,
} from "lucide-react";
import { PageTag } from "@/components/PageTag";
import YabanClinicHeader from "./YabanClinicHeader";

interface AdminEntry {
  key: string;
  title: string;
  desc: string;
  icon: typeof Package;
  path: string;
}

const ENTRIES: AdminEntry[] = [
  {
    key: "dashboard",
    title: "经营数据",
    desc: "今日/累计成交、订单趋势、热销榜",
    icon: BarChart3,
    path: "/yaban/shop/admin/dashboard",
  },
  {
    key: "products",
    title: "商品管理",
    desc: "上下架、改价、编辑与新增商品",
    icon: Package,
    path: "/yaban/shop/admin/products",
  },
  {
    key: "orders",
    title: "订单管理",
    desc: "查看与处理商城订单",
    icon: ClipboardList,
    path: "/yaban/shop/admin/orders",
  },
  {
    key: "verify",
    title: "核销记录",
    desc: "查看商品/券的核销核验记录",
    icon: Ticket,
    path: "/yaban/profile/verify-records",
  },
  {
    key: "coupons",
    title: "优惠券管理",
    desc: "创建满减/折扣券，控制发放与上下架",
    icon: Ticket,
    path: "/yaban/shop/admin/coupons",
  },
  {
    key: "ops",
    title: "运营管理",
    desc: "评价回复、首页 Banner 轮播配置",
    icon: Megaphone,
    path: "/yaban/shop/admin/ops",
  },
  {
    key: "merchant",
    title: "支付设置",
    desc: "配置本店微信/支付宝收款商户",
    icon: CreditCard,
    path: "/yaban/shop/admin/merchant-config",
  },
];

export default function YabanShopAdmin() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <PageTag code="P318" />

      {/* 顶部蓝色头部 */}
      <div className="bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center">
          <button
            onClick={() => navigate("/yaban/profile")}
            className="p-1 -ml-1"
            aria-label="返回"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold ml-1">商城订单管理</span>
          <div className="ml-auto">
            <YabanClinicHeader compact />
          </div>
        </div>
      </div>

      {/* 管理菜单 */}
      <div className="max-w-lg mx-auto px-3 py-3 space-y-2">
        {ENTRIES.map((e) => {
          const Icon = e.icon;
          return (
            <button
              key={e.key}
              onClick={() => navigate(e.path)}
              className="w-full flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm active:scale-[0.98] transition-transform"
            >
              <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2196C8] to-[#3BA9E0] flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-white" />
              </span>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-gray-800">{e.title}</p>
                <p className="text-[11px] text-gray-400">{e.desc}</p>
              </div>
              <ChevronLeft className="w-5 h-5 text-gray-300 rotate-180" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
