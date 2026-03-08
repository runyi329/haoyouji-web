import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import {
  Notebook, Receipt, Loader2,
  PenLine, Coins, Image, BarChart2, RefreshCw, Layers, HardDrive, Users,
  Calendar, Tag, Shield, Bell, Search, Filter, Download, Upload,
  Lock, Zap, Star, Globe, Clock, FileText, Settings, ChevronRight,
  MessageSquare, CheckCircle, Wallet, TrendingUp, BookOpen, SlidersHorizontal,
} from "lucide-react";
import Autoplay from "embla-carousel-autoplay";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { trpc } from "@/lib/trpc";
import BottomNav from "@/components/BottomNav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { X } from "lucide-react";

function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + "万";
  }
  return num.toLocaleString("zh-CN");
}

// 功能更新列表（30条，按时间倒序）
const FEATURE_UPDATES = [
  { id: 1,  Icon: PenLine,         title: "支持修改记录查询",     desc: "账目详情页可查看完整修改历史，记录每次变更内容",     date: "2026-02-27" },
  { id: 2,  Icon: Coins,           title: "支持多币种记账",       desc: "新增 USD、USDT 等外币币种，支持跨币种账目管理",     date: "2026-02-27" },
  { id: 3,  Icon: PenLine,         title: "金额输入支持光标定位", desc: "点击金额任意位置可定位光标，自由修改数字",           date: "2026-02-27" },
  { id: 4,  Icon: SlidersHorizontal, title: "账本智能排序",       desc: "最近操作的账本自动置顶，使用频率越高越靠前",         date: "2026-02-23" },
  { id: 5,  Icon: HardDrive,       title: "账本定期自动备份",     desc: "账本数据定期自动备份到云端，保障数据安全",           date: "2026-02-22" },
  { id: 6,  Icon: Download,        title: "数据导出为 Excel",     desc: "支持将账目数据导出为 Excel 表格，方便存档和分析",   date: "2026-02-22" },
  { id: 7,  Icon: Layers,          title: "三级分类批量替换",     desc: "支持批量替换账目分类，一键迁移历史数据",             date: "2026-02-22" },
  { id: 8,  Icon: RefreshCw,       title: "报销流程管理",         desc: "支持申请报销、审批通过/拒绝完整流程，附凭证上传",   date: "2026-02-12" },
  { id: 9,  Icon: Image,           title: "图片账单功能",         desc: "账目支持上传图片凭证，方便留存报销单据",             date: "2026-02-12" },
  { id: 10, Icon: Globe,           title: "账本封面样式",         desc: "账本列表以封面卡片样式展示，视觉更直观",             date: "2026-02-11" },
  { id: 11, Icon: Bell,            title: "待结账目提醒",         desc: "代收/代付账目沙漏提醒，避免遗漏待结算项目",         date: "2026-02-25" },
  { id: 12, Icon: Upload,          title: "账单复制粘贴导入",     desc: "支持从剪贴板批量粘贴导入历史账目数据",               date: "2026-02-25" },
  { id: 13, Icon: BarChart2,       title: "数据报表",             desc: "支持按月/年统计收支报表，直观掌握财务状况",           date: "2026-02-02" },
  { id: 14, Icon: Calendar,        title: "日历视图",             desc: "日历视图直观查看每日账目，支持按日期跳转",           date: "2026-02-01" },
  { id: 15, Icon: Shield,          title: "账本权限控制",         desc: "支持设置成员角色权限，区分管理员与普通成员",         date: "2026-02-23" },
  { id: 16, Icon: Search,          title: "账本搜索与排序",       desc: "账本列表支持关键词搜索，按成员数、账目数等排序",     date: "2026-02-23" },
  { id: 17, Icon: CheckCircle,     title: "账目审批功能",         desc: "账目支持待审核/已通过/已拒绝状态流转，规范记账",   date: "2026-01-27" },
  { id: 18, Icon: Users,           title: "多人协作共享",         desc: "支持邀请成员加入账本，多人实时协作记账",             date: "2026-01-26" },
  { id: 19, Icon: Layers,          title: "三级分类体系",         desc: "支持自定义三级分类，账目归类更精细灵活",             date: "2026-01-26" },
  { id: 20, Icon: Filter,          title: "账目多维筛选",         desc: "支持按金额、分类、成员、日期多维度筛选账目",         date: "2026-01-27" },
  { id: 21, Icon: TrendingUp,      title: "收支趋势图",           desc: "可视化展示月度收支趋势，掌握财务走向",               date: "2026-01-26" },
  { id: 22, Icon: Wallet,          title: "多账本管理",           desc: "支持创建并管理多个独立账本，场景分类清晰",           date: "2026-01-26" },
  { id: 23, Icon: Settings,        title: "账本设置",             desc: "支持修改账本名称、货币单位、封面等基本信息",         date: "2026-01-26" },
  { id: 24, Icon: ChevronRight,    title: "账目详情页",           desc: "点击账目可查看完整详情，包括创建人、时间等信息",     date: "2026-01-26" },
  { id: 25, Icon: Tag,             title: "自定义标签",           desc: "账目支持添加自定义标签，方便分类查询",               date: "2026-01-26" },
  { id: 26, Icon: Zap,             title: "快速记账",             desc: "首页一键快速添加账目，减少操作步骤",                 date: "2026-01-26" },
  { id: 27, Icon: Star,            title: "常用分类置顶",         desc: "最近使用的分类自动置顶，提升记账效率",               date: "2026-01-26" },
  { id: 28, Icon: FileText,        title: "账目备注",             desc: "每条账目支持添加文字备注，记录详细说明",             date: "2026-01-26" },
  { id: 29, Icon: Lock,            title: "删除账目找回",         desc: "误删账目可在回收站找回，数据不再丢失",               date: "2026-01-26" },
  { id: 30, Icon: BookOpen,        title: "共享账本正式上线",     desc: "脉动共享账本发布，开启多人协作记账新时代",           date: "2026-01-22" },
];

export default function LedgerOverview() {
  const [, setLocation] = useLocation();
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [joinSecretKey, setJoinSecretKey] = useState("");

  const joinMutation = trpc.ledger.joinBySecretKey.useMutation({
    onSuccess: (data) => {
      toast.success('成功加入账本！');
      setShowJoinDialog(false);
      setJoinSecretKey("");
      setLocation(`/ledger/${data.ledgerId}`);
    },
    onError: (err) => {
      toast.error(err.message || '加入失败，请检查密钥是否正确');
    },
  });

  const handleJoinConfirm = () => {
    if (joinSecretKey.trim()) {
      joinMutation.mutate({ secretKey: joinSecretKey.trim() });
    }
  };

  // 获取账本统计数据
  const { data: ledgerStats, isLoading } = trpc.ledger.stats.useQuery();
  
  // 获取全站最近活动动态（滚动排行榜）
  const { data: recentActivities } = trpc.ledger.recentActivity.useQuery(undefined, {
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const banners = [
    {
      id: 1,
      image: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/carousel/shared-ledger.webp",
      title: "共享账本试用版上线"
    },
  ];

  // 每条活动行高约48px，3条 = 144px
  const ACTIVITY_ROW_HEIGHT = 48;
  const VISIBLE_ROWS = 3;
  const activityBoxHeight = ACTIVITY_ROW_HEIGHT * VISIBLE_ROWS;

  // 功能更新行高约56px，3条 = 168px
  const FEATURE_ROW_HEIGHT = 56;
  const featureBoxHeight = FEATURE_ROW_HEIGHT * VISIBLE_ROWS;

  return (
    <div className="min-h-screen bg-[#FAF3ED] pb-16 max-w-md mx-auto relative shadow-2xl">
      {/* Header Banner Carousel */}
      <div className="relative">
        <Carousel 
          className="w-full"
          opts={{
            loop: true,
            align: "start",
          }}
          plugins={[
            Autoplay({
              delay: 5000,
              stopOnInteraction: false,
            }),
          ]}
        >
          <CarouselContent>
            {banners.map((banner) => (
              <CarouselItem key={banner.id}>
                <div className="relative w-full aspect-[16/9] overflow-hidden">
                  <img
                    src={banner.image}
                    alt={banner.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>

      {/* Stats Cards */}
      <div className="px-4 mt-2 grid grid-cols-2 gap-2">
        <Link href="/ledger/list">
          <a className="block">
            <Card className="bg-gradient-to-br from-[#A80000] to-[#d44] text-white p-3 rounded-2xl shadow-lg border-none flex flex-col items-center justify-center space-y-0.5 cursor-pointer hover:shadow-xl transition-shadow">
              <div className="flex items-center space-x-2 opacity-90">
                <Notebook className="w-5 h-5" />
                <span className="text-sm font-medium">账本总数</span>
              </div>
              <div className="flex items-baseline space-x-1">
                {isLoading ? (
                  <Loader2 className="w-8 h-8 animate-spin opacity-60" />
                ) : (
                  <>
                    <span className="text-2xl font-bold">{ledgerStats ? formatNumber(ledgerStats.totalLedgers) : "—"}</span>
                    <span className="text-sm opacity-80">本</span>
                  </>
                )}
              </div>
            </Card>
          </a>
        </Link>
        
        <Card className="bg-white text-[#222222] p-3 rounded-2xl shadow-lg border-none flex flex-col items-center justify-center space-y-0.5 cursor-pointer hover:shadow-xl transition-shadow">
          <div className="flex items-center space-x-2 text-gray-500">
            <Receipt className="w-5 h-5" />
            <span className="text-sm font-medium">账目总数</span>
          </div>
          <div className="flex items-baseline space-x-1">
            {isLoading ? (
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            ) : (
              <>
                <span className="text-2xl font-bold text-[#D32F2F]">{ledgerStats ? formatNumber(ledgerStats.totalEntries) : "—"}</span>
                <span className="text-sm text-gray-400">条</span>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* 滚动排行榜 - 最近活动动态（3条高度，不暂停） */}
      {recentActivities && recentActivities.length > 0 && (
        <div className="px-4 mt-3">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <span className="w-1.5 h-4 bg-[#D32F2F] rounded-full"></span>
                <span className="text-sm font-semibold text-[#333]">实时动态</span>
              </div>
              <span className="text-xs text-gray-400">全站用户活动</span>
            </div>
            {/* 滚动区域 - 固定3条高度，始终滚动不暂停 */}
            <div className="relative overflow-hidden" style={{ height: `${activityBoxHeight}px` }}>
              <style>{`
                @keyframes scrollUpActivity {
                  0% { transform: translateY(0); }
                  100% { transform: translateY(-50%); }
                }
                .scroll-activity {
                  animation: scrollUpActivity ${Math.max(15, (recentActivities?.length || 10) * 2)}s linear infinite;
                }
              `}</style>
              <div className="scroll-activity">
                {/* 复制两份实现无缝滚动 */}
                {[...recentActivities, ...recentActivities].map((activity, index) => {
                  const raw = activity.createdAt || '';
                  const timeStr_raw = raw.includes('T') ? raw : raw.replace(' ', 'T') + '+08:00';
                  const time = new Date(timeStr_raw);
                  const now = new Date();
                  const diffMs = now.getTime() - time.getTime();
                  const diffMin = Math.floor(diffMs / 60000);
                  const diffHour = Math.floor(diffMs / 3600000);
                  const diffDay = Math.floor(diffMs / 86400000);
                  let timeStr = '';
                  if (diffMin < 1) timeStr = '刚刚';
                  else if (diffMin < 60) timeStr = `${diffMin}分钟前`;
                  else if (diffHour < 24) timeStr = `${diffHour}小时前`;
                  else if (diffDay < 7) timeStr = `${diffDay}天前`;
                  else timeStr = `${time.getMonth() + 1}/${time.getDate()}`;
                  
                  const isLedger = activity.type === 'new_ledger';
                  
                  return (
                    <div
                      key={`activity-${index}`}
                      className="flex items-center px-4 border-b border-gray-50 last:border-b-0"
                      style={{ height: `${ACTIVITY_ROW_HEIGHT}px` }}
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isLedger ? 'bg-[#FFF5F5] text-[#D32F2F]' : 'bg-[#FFF8E1] text-[#F59E0B]'
                      }`}>
                        {isLedger ? (
                          <Notebook className="w-3.5 h-3.5" strokeWidth={2} />
                        ) : (
                          <Receipt className="w-3.5 h-3.5" strokeWidth={2} />
                        )}
                      </div>
                      <div className="ml-3 flex-1 min-w-0">
                        <p className="text-sm text-[#333] truncate">
                          <span className="font-medium text-[#D32F2F]">{activity.username}</span>
                          <span className="text-gray-500 ml-1">{activity.detail}</span>
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{timeStr}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 功能更新滚动展示区（3条高度，30条内容循环，不暂停） */}
      <div className="px-4 mt-3">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <div className="flex items-center space-x-2">
              <span className="w-1.5 h-4 bg-[#F59E0B] rounded-full"></span>
              <span className="text-sm font-semibold text-[#333]">功能更新</span>
            </div>
            <span className="text-xs text-gray-400">持续迭代升级</span>
          </div>
          {/* 滚动区域 - 固定3条高度，始终滚动不暂停 */}
          <div className="relative overflow-hidden" style={{ height: `${featureBoxHeight}px` }}>
            <style>{`
              @keyframes scrollUpFeature {
                0% { transform: translateY(0); }
                100% { transform: translateY(-50%); }
              }
              .scroll-feature {
                animation: scrollUpFeature ${FEATURE_UPDATES.length * 3}s linear infinite;
              }
            `}</style>
            <div className="scroll-feature">
              {/* 复制两份实现无缝滚动 */}
              {[...FEATURE_UPDATES, ...FEATURE_UPDATES].map((feature, index) => {
                const { Icon } = feature;
                return (
                  <div
                    key={`feature-${index}`}
                    className="flex items-center px-4 border-b border-gray-50 last:border-b-0"
                    style={{ height: `${FEATURE_ROW_HEIGHT}px` }}
                  >
                    <div className="w-8 h-8 rounded-full bg-[#FFF8E1] flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-[#F59E0B]" strokeWidth={1.8} />
                    </div>
                    <div className="ml-3 flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#333] truncate">{feature.title}</p>
                      <p className="text-xs text-gray-400 truncate">{feature.desc}</p>
                    </div>
                    <span className="text-xs text-gray-300 flex-shrink-0 ml-2">{feature.date}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 加入他人账本弹出面板 */}
      {showJoinDialog && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setShowJoinDialog(false); setJoinSecretKey(""); }} />
          <div className="fixed left-0 right-0 z-50" style={{ bottom: '70px' }}>
            <div className="max-w-md mx-auto px-4">
              <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-gray-900">加入他人账本</h3>
                  <button onClick={() => { setShowJoinDialog(false); setJoinSecretKey(""); }} className="p-1 hover:bg-gray-100 rounded-full">
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-3">请输入密钥（66位）以加入共享账本。密钥可从账本管理员处获取。</p>
                <div className="mb-3">
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">账本密钥</label>
                  <Input
                    placeholder="请输入密钥"
                    value={joinSecretKey}
                    onChange={(e) => setJoinSecretKey(e.target.value)}
                    className="font-mono text-xs h-9"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 border-[#D32F2F] text-[#D32F2F]"
                    onClick={() => { setShowJoinDialog(false); setJoinSecretKey(""); }}
                  >
                    取消
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 h-8 bg-[#D32F2F] hover:bg-[#B71C1C] text-white"
                    onClick={handleJoinConfirm}
                    disabled={!joinSecretKey.trim() || joinMutation.isPending}
                  >
                    {joinMutation.isPending ? '加入中...' : '确认加入'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Bottom Navigation */}
      <BottomNav
        onJoinLedger={() => setShowJoinDialog(!showJoinDialog)}
        onCreateLedger={() => setLocation('/ledger/create-type')}
      />
    </div>
  );
}
