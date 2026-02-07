import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  ChevronRight, 
  Shield, 
  Smartphone, 
  Mail, 
  Lock,
  Key,
  Globe,
  DollarSign,
  Palette,
  Bell,
  MessageSquare,
  TrendingUp,
  Pencil,
  Copy,
  Share2
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

export default function ProfileSettings() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"profile" | "security" | "preferences">("profile");
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // 计算动画进度 (0-1)
  const progress = Math.min(scrollY / 100, 1);
  
  // 计算头像大小 (96px -> 48px)
  const avatarSize = 96 - progress * 48;
  
  // 计算字体大小
  const nameSize = 20 - progress * 4; // 20px -> 16px
  
  // 计算透明度
  const secondaryOpacity = 1 - progress;
  
  // 计算容器高度 (200px -> 80px)
  const containerHeight = 200 - progress * 120;

  // 判断是否使用水平布局
  const isHorizontal = progress > 0.5;

  // 复制UID
  const copyUID = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id.toString());
      toast.success("UID已复制");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 pb-20">
      {/* 用户信息卡片 - 动态布局 */}
      <div 
        className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white relative overflow-hidden transition-all duration-300"
        style={{ height: `${containerHeight}px` }}
      >
        {/* 返回按钮 */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 left-4 text-white hover:bg-white/20 z-10"
          onClick={() => setLocation("/parent/profile")}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>

        {/* 用户信息 - 动态布局 */}
        <div 
          className={`absolute inset-0 flex items-center justify-center px-4 transition-all duration-300 ${
            isHorizontal ? 'flex-row gap-4' : 'flex-col gap-3'
          }`}
          style={{
            paddingTop: isHorizontal ? '0' : '20px',
          }}
        >
          {/* 头像 */}
          <div 
            className="relative transition-all duration-300"
            style={{
              width: `${avatarSize}px`,
              height: `${avatarSize}px`,
            }}
          >
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.name || "用户"}
                className="w-full h-full rounded-full object-cover border-4 border-white/30"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-white/20 flex items-center justify-center border-4 border-white/30">
                <span className="text-white font-bold" style={{ fontSize: `${avatarSize * 0.4}px` }}>
                  {user?.name?.[0] || "U"}
                </span>
              </div>
            )}
            
            {/* 编辑按钮 - 只在初始状态显示 */}
            <button
              className="absolute bottom-0 right-0 bg-white text-indigo-600 rounded-full p-2 shadow-lg hover:bg-gray-100 transition-all"
              style={{
                opacity: secondaryOpacity,
                transform: `scale(${secondaryOpacity})`,
                pointerEvents: secondaryOpacity > 0.5 ? 'auto' : 'none',
              }}
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>

          {/* 用户信息文字 */}
          <div className={`text-center transition-all duration-300 ${isHorizontal ? 'text-left' : ''}`}>
            <h2 
              className="font-bold text-white transition-all duration-300"
              style={{ fontSize: `${nameSize}px` }}
            >
              {user?.name || "未命名用户"}
            </h2>
            
            {/* 邮箱 - 渐隐 */}
            <p 
              className="text-white/90 text-sm mt-1 transition-all duration-300"
              style={{
                opacity: secondaryOpacity,
                height: secondaryOpacity > 0 ? 'auto' : '0',
                overflow: 'hidden',
              }}
            >
              {user?.email || "未设置邮箱"}
            </p>
          </div>
        </div>
      </div>

      {/* 标签页导航 - 固定在顶部 */}
      <div className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex">
          <button
            onClick={() => setActiveTab("profile")}
            className={`flex-1 py-4 text-center font-medium transition-colors relative ${
              activeTab === "profile"
                ? "text-indigo-600 dark:text-indigo-400"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            }`}
          >
            个人资料
            {activeTab === "profile" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("security")}
            className={`flex-1 py-4 text-center font-medium transition-colors relative ${
              activeTab === "security"
                ? "text-indigo-600 dark:text-indigo-400"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            }`}
          >
            安全设置
            {activeTab === "security" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("preferences")}
            className={`flex-1 py-4 text-center font-medium transition-colors relative ${
              activeTab === "preferences"
                ? "text-indigo-600 dark:text-indigo-400"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            }`}
          >
            偏好设置
            {activeTab === "preferences" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
            )}
          </button>
        </div>
      </div>

      {/* 标签页内容 */}
      <div className="container max-w-2xl mx-auto px-4 py-6">
        {activeTab === "profile" && (
          <div className="space-y-4">
            {/* 账号信息 */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold text-lg mb-4">账号信息</h3>
                <div className="space-y-3">
                  <SettingItem
                    icon={<Key className="w-5 h-5" />}
                    label="UID"
                    value={user?.id?.toString() || "未知"}
                    showArrow={false}
                    onCopy={copyUID}
                  />
                  <SettingItem
                    icon={<Shield className="w-5 h-5" />}
                    label="身份认证"
                    value="已认证"
                    badge="verified"
                  />
                  <SettingItem
                    icon={<Globe className="w-5 h-5" />}
                    label="国家或地区"
                    value="中国"
                  />
                  <SettingItem
                    icon={<DollarSign className="w-5 h-5" />}
                    label="手续费等级"
                    value="VIP 1"
                  />
                  <SettingItem
                    icon={<Share2 className="w-5 h-5" />}
                    label="邀请码"
                    value="查看我的邀请"
                    onClick={() => setLocation("/parent/profile/invite")}
                  />
                </div>
              </CardContent>
            </Card>

            {/* 关联账号 */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold text-lg mb-4">关联账号</h3>
                <div className="space-y-3">
                  <SettingItem
                    icon={<Mail className="w-5 h-5" />}
                    label="Google"
                    value="已绑定"
                    badge="connected"
                  />
                  <SettingItem
                    icon={<MessageSquare className="w-5 h-5" />}
                    label="微信"
                    value="未绑定"
                  />
                  <SettingItem
                    icon={<Smartphone className="w-5 h-5" />}
                    label="Apple ID"
                    value="未绑定"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "security" && (
          <div className="space-y-4">
            {/* 安全等级 */}
            <Card className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 border-orange-200 dark:border-orange-800">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">安全等级</h3>
                    <p className="text-sm text-muted-foreground mt-1">中级 - 4/5</p>
                  </div>
                  <div className="relative w-20 h-20">
                    <svg className="transform -rotate-90 w-20 h-20">
                      <circle
                        cx="40"
                        cy="40"
                        r="32"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="none"
                        className="text-gray-200 dark:text-gray-700"
                      />
                      <circle
                        cx="40"
                        cy="40"
                        r="32"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 32}`}
                        strokeDashoffset={`${2 * Math.PI * 32 * (1 - 0.8)}`}
                        className="text-orange-500 transition-all duration-500"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-bold text-orange-600 dark:text-orange-400">4/5</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 验证方式 */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold text-lg mb-4">验证方式</h3>
                <div className="space-y-3">
                  <SettingItem
                    icon={<Key className="w-5 h-5" />}
                    label="通行密钥"
                    value="已启用"
                    badge="enabled"
                  />
                  <SettingItem
                    icon={<Shield className="w-5 h-5" />}
                    label="身份验证App"
                    value="已启用"
                    badge="enabled"
                  />
                  <SettingItem
                    icon={<Smartphone className="w-5 h-5" />}
                    label="手机号验证"
                    value="未设置"
                  />
                  <SettingItem
                    icon={<Mail className="w-5 h-5" />}
                    label="邮箱验证"
                    value="已设置"
                    badge="enabled"
                  />
                  <SettingItem
                    icon={<Lock className="w-5 h-5" />}
                    label="登录密码"
                    value="已设置"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "preferences" && (
          <div className="space-y-4">
            {/* 通用设置 */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold text-lg mb-4">通用设置</h3>
                <div className="space-y-3">
                  <SettingItem
                    icon={<Globe className="w-5 h-5" />}
                    label="语言"
                    value="简体中文"
                  />
                  <SettingItem
                    icon={<DollarSign className="w-5 h-5" />}
                    label="计价货币"
                    value="CNY"
                  />
                  <SettingItem
                    icon={<Palette className="w-5 h-5" />}
                    label="主题模式"
                    value="跟随系统"
                  />
                  <SettingItem
                    icon={<Bell className="w-5 h-5" />}
                    label="消息通知"
                    value="已开启"
                    badge="enabled"
                  />
                </div>
              </CardContent>
            </Card>

            {/* 显示设置 */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold text-lg mb-4">显示设置</h3>
                <div className="space-y-3">
                  <SettingItem
                    icon={<Palette className="w-5 h-5" />}
                    label="颜色设置"
                    value="默认"
                  />
                  <SettingItem
                    icon={<TrendingUp className="w-5 h-5" />}
                    label="涨跌幅周期"
                    value="24小时"
                  />
                  <SettingItem
                    icon={<TrendingUp className="w-5 h-5" />}
                    label="K线时间"
                    value="1分钟"
                  />
                </div>
              </CardContent>
            </Card>

            {/* 聊天设置 */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold text-lg mb-4">聊天偏好</h3>
                <div className="space-y-3">
                  <SettingItem
                    icon={<MessageSquare className="w-5 h-5" />}
                    label="消息预览"
                    value="已开启"
                    badge="enabled"
                  />
                  <SettingItem
                    icon={<Bell className="w-5 h-5" />}
                    label="消息提示音"
                    value="已开启"
                    badge="enabled"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// 设置项组件
function SettingItem({
  icon,
  label,
  value,
  badge,
  showArrow = true,
  onCopy,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  badge?: "verified" | "connected" | "enabled";
  showArrow?: boolean;
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg px-2 -mx-2 transition-colors cursor-pointer">
      <div className="flex items-center gap-3">
        <div className="text-gray-600 dark:text-gray-400">{icon}</div>
        <span className="font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{value}</span>
        {badge && (
          <Badge
            variant={badge === "verified" || badge === "enabled" ? "default" : "secondary"}
            className="text-xs"
          >
            {badge === "verified" && "✓"}
            {badge === "connected" && "●"}
            {badge === "enabled" && "✓"}
          </Badge>
        )}
        {onCopy && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <Copy className="w-4 h-4 text-gray-400" />
          </button>
        )}
        {showArrow && <ChevronRight className="w-4 h-4 text-gray-400" />}
      </div>
    </div>
  );
}
