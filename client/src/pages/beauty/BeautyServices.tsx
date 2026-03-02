/**
 * 奢贝美容院 - 美容项目
 * 路径: /beauty/services
 */
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, Clock, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import BeautyTabBar from "./BeautyTabBar";
import BottomNav from "@/components/BottomNav";

export default function BeautyServices() {
  const { user } = useAuth();
  const { data: services, isLoading } = trpc.beauty.service.list.useQuery();

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <div className="sticky top-0 z-10">
        <div className="bg-white border-b border-gray-100">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Link href="/beauty">
                <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
              </Link>
              <h1 className="font-semibold text-gray-800">美容项目</h1>
            </div>
            {user?.username && (
              <span className="text-xs text-gray-300 pr-1 select-none">{user.username}</span>
            )}
          </div>
        </div>
        <BeautyTabBar />
      </div>

      <div className="px-4 py-4 space-y-3 max-w-lg mx-auto">
        {isLoading ? (
          <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
        ) : !services || services.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">暂无项目</div>
        ) : (
          services.map((s) => (
            <Link key={s.id} href={`/beauty/booking?service=${s.id}`}>
              <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-0">
                  <div className="flex gap-3 p-3">
                    <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-rose-100 to-pink-50 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-7 h-7 text-rose-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <h3 className="font-semibold text-gray-800 text-sm">{s.name}</h3>
                        <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                      </div>
                      {s.description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.description}</p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-baseline gap-2">
                          <span className="text-rose-500 font-bold text-sm">¥{s.price}</span>
                          {s.originalPrice && s.originalPrice > s.price && (
                            <span className="text-xs text-gray-300 line-through">¥{s.originalPrice}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <Clock className="w-3 h-3" />
                          {s.duration}分钟
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}

        {/* 温馨提示 */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <h4 className="font-semibold text-gray-700 text-sm mb-2">温馨提示</h4>
            <div className="space-y-1.5 text-xs text-gray-500">
              <p>• 所有项目均由专业美容师操作，安全有保障</p>
              <p>• 首次体验可享受新客专属优惠</p>
              <p>• 充值会员卡可享受更多折扣</p>
              <p>• 预约后请准时到店，如需改约请提前联系</p>
            </div>
          </CardContent>
        </Card>
      </div>
      <BottomNav />
    </div>
  );
}
