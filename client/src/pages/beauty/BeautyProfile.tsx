/**
 * 奢贝美容院 - 专属个人中心
 * 红金白色系，仅有积分管理权限的用户可见
 * 路径: /beauty/profile
 */
import { useLocation, Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, Users, Star, Calendar, ChevronRight, Gift, ClipboardList, Settings
} from "lucide-react";
import BottomNav from "@/components/BottomNav";

export default function BeautyProfile() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const pointsQuery = trpc.beauty.points.getMyBalance.useQuery(undefined, {
    refetchOnMount: 'always',
  });
  const canManageQuery = trpc.beauty.points.canManage.useQuery(undefined, {
    refetchOnMount: 'always',
  });
  const clientsQuery = trpc.beauty.points.getMyClients.useQuery(undefined, {
    refetchOnMount: 'always',
  });

  const myPoints = pointsQuery.data?.balance ?? 0;
  const canManage = canManageQuery.data?.canManage ?? false;
  const clientCount = clientsQuery.data?.length ?? 0;


  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* 顶部红金渐变区域 */}
      <div className="relative bg-gradient-to-br from-rose-500 via-red-400 to-rose-400 text-white overflow-hidden">
        {/* 装饰圆 */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-amber-300" />
          <div className="absolute bottom-4 left-8 w-20 h-20 rounded-full bg-amber-200" />
        </div>

        <div className="relative px-5 pt-12 pb-8">
          {/* 返回按钮 */}
          <button
            onClick={() => setLocation('/beauty')}
            className="flex items-center gap-1 text-white/80 text-sm mb-5 active:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            返回首页
          </button>

          {/* 用户信息 */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full border-2 border-amber-300/60 overflow-hidden bg-white/20 flex items-center justify-center flex-shrink-0">
              {user?.avatar ? (
                <img src={user.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-2xl font-bold">
                  {user?.username ? user.username.charAt(0).toUpperCase() : '?'}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold truncate">{user?.name || user?.username || '用户'}</h2>
              <p className="text-white/60 text-xs mt-0.5">ID: {user?.id}</p>
            </div>
          </div>

          {/* 数据统计栏 */}
          <div className="mt-6 bg-white/15 rounded-2xl p-4 grid grid-cols-3 gap-2 text-center backdrop-blur-sm">
            <div>
              <p className="text-xl font-bold text-amber-200">{myPoints}</p>
              <p className="text-white/70 text-xs mt-0.5">奢贝积分</p>
            </div>
            {canManage && (
              <div
                className="cursor-pointer active:opacity-70"
                onClick={() => setLocation('/beauty/clients')}
              >
                <p className="text-xl font-bold text-amber-200">{clientCount}</p>
                <p className="text-white/70 text-xs mt-0.5">我的客户</p>
              </div>
            )}
            <div>
              <p className="text-xl font-bold text-amber-200">0</p>
              <p className="text-white/70 text-xs mt-0.5">养护次数</p>
            </div>
          </div>
        </div>
      </div>

      {/* 功能入口区域 */}
      <div className="px-4 mt-4 space-y-3">
        {/* 我的订单 */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 flex items-center justify-between border-b border-gray-50">
            <h3 className="font-bold text-gray-800 text-sm">我的订单</h3>
            <button
              onClick={() => setLocation('/beauty/appointments')}
              className="text-xs text-gray-400 flex items-center gap-0.5"
            >
              全部 <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-4 py-4 px-2">
            {[
              { icon: <ClipboardList className="w-5 h-5" />, label: "待付款" },
              { icon: <Calendar className="w-5 h-5" />, label: "待服务" },
              { icon: <Star className="w-5 h-5" />, label: "已完成" },
              { icon: <Gift className="w-5 h-5" />, label: "售后" },
            ].map((item) => (
              <button
                key={item.label}
                className="flex flex-col items-center gap-1.5 text-gray-600 active:text-rose-500 transition-colors"
                onClick={() => setLocation('/beauty/appointments')}
              >
                <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-400">
                  {item.icon}
                </div>
                <span className="text-xs">{item.label}</span>
              </button>
            ))}
          </div>
        </div>


      </div>

      {/* 管理员专属：商户设置 */}
      {user?.username === 'liulifan' && (
        <div className="px-4 mt-3">
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-50">
              <h3 className="font-bold text-gray-800 text-sm">商家管理</h3>
            </div>
            <button
              onClick={() => setLocation('/beauty/settings')}
              className="w-full px-5 py-4 flex items-center gap-3 active:bg-gray-50 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-rose-50 flex items-center justify-center text-rose-400 flex-shrink-0">
                <Settings className="w-4.5 h-4.5" />
              </div>
              <span className="flex-1 text-left text-sm text-gray-700">商户设置</span>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
