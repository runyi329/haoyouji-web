import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calendar, MessageCircle, Heart, ArrowLeft } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

export default function Social() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  // 只有家长角色可以访问人脉管理
  const isParent = user?.role === "parent" || user?.role === "super_admin";

  const features = [
    {
      title: "好友记",
      description: "管理您的社交网络，维护重要关系",
      icon: Users,
      href: "/parent/contacts",
      gradient: "from-green-400 to-green-600",
      available: isParent,
    },
    {
      title: "相册",
      description: "记录美好时光，分享珍贵回忆",
      icon: Calendar,
      href: "/albums",
      gradient: "from-blue-400 to-blue-600",
      available: true,
    },
    {
      title: "家庭圈",
      description: "与家人分享日常动态",
      icon: MessageCircle,
      href: "/family-circle",
      gradient: "from-purple-400 to-purple-600",
      available: false,
      comingSoon: true,
    },
    {
      title: "好友",
      description: "添加好友，互动交流",
      icon: Heart,
      href: "/friends",
      gradient: "from-pink-400 to-pink-600",
      available: false,
      comingSoon: true,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-purple-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>返回首页</span>
          </button>
          <h1 className="text-xl font-bold">社交</h1>
          <div className="w-20"></div>
        </div>
      </div>

      {/* 功能卡片 */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            
            // 没有权限的功能不显示
            if (feature.noPermission) {
              return null;
            }
            
            if (!feature.available) {
              return (
                <Card key={feature.title} className="opacity-50 cursor-not-allowed">
                  <CardHeader>
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4`}>
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <CardTitle>{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {feature.comingSoon && (
                      <p className="text-sm text-muted-foreground">即将上线</p>
                    )}
                  </CardContent>
                </Card>
              );
            }

            return (
              <Link key={feature.title} href={feature.href}>
                <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                  <CardHeader>
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4`}>
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <CardTitle>{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-primary font-medium">立即使用 →</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* 温馨提示 */}
        {!isParent && (
          <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">
              💡 <strong>提示：</strong>部分功能仅对家长开放，如需使用请切换到家长账户。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
