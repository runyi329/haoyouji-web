import { Link } from "wouter";
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

function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + "万";
  }
  return num.toLocaleString("zh-CN");
}

// 功能更新列表（30条，按时间倒序）
const FEATURE_UPDATES = [
  { id: 1,  Icon: PenLine,         title: "支持修改记录查询",     desc: "账目详情页可查看完整修改历史，记录每次变更内容",     date: "2026-02" },
  { id: 2,  Icon: Coins,           title: "支持多币种记账",       desc: "新增 USD、USDT 等外币币种，支持跨币种账目管理",     date: "2026-02" },
  { id: 3,  Icon: PenLine,         title: "金额输入支持光标定位", desc: "点击金额任意位置可定位光标，自由修改数字",           date: "2026-02" },
  { id: 4,  Icon: Image,           title: "图片账单功能",         desc: "账目支持上传图片凭证，方便留存报销单据",             date: "2026-01" },
  { id: 5,  Icon: BarChart2,       title: "数据报表",             desc: "支持按月/年统计收支报表，直观掌握财务状况",         date: "2026-01" },
  { id: 6,  Icon: Calendar,        title: "日历视图",             desc: "日历视图直观查看每日账目，支持按日期跳转",         date: "2026-01" },
  { id: 7,  Icon: RefreshCw,       title: "报销流程管理",         desc: "支持申请报销、审批通过/拒绝完整流程，附凭证上传",   date: "2026-01" },
  { id: 8,  Icon: Layers,          title: "三级分类体系",         desc: "支持自定义三级分类，账目归类更精细灵活",           date: "2025-12" },
  { id: 9,  Icon: HardDrive,       title: "定期备份功能",         desc: "账本数据定期自动备份，保障数据安全",               date: "2025-12" },
  { id: 10, Icon: Users,           title: "多人协作共享",         desc: "支持邀请成员加入账本，多人实时协作记账",           date: "2025-11" },
  { id: 11, Icon: Shield,          title: "审批权限管理",         desc: "账本管理员可设置账目审批流程，规范团队记账",       date: "2025-11" },
  { id: 12, Icon: Tag,             title: "自定义标签",           desc: "账目支持添加自定义标签，方便分类查询",             date: "2025-11" },
  { id: 13, Icon: Bell,            title: "待结账目提醒",         desc: "代收/代付账目沙漏提醒，避免遗漏待结算项目",       date: "2025-11" },
  { id: 14, Icon: Search,          title: "账目搜索过滤",         desc: "支持按金额、分类、成员、日期多维度筛选账目",       date: "2025-10" },
  { id: 15, Icon: Filter,          title: "账本排序筛选",         desc: "账本列表支持按成员数、账目数、日期排序",           date: "2025-10" },
  { id: 16, Icon: Download,        title: "数据导出",             desc: "支持将账目数据导出为 Excel 表格",                  date: "2025-10" },
  { id: 17, Icon: Upload,          title: "数据导入",             desc: "支持从 Excel 批量导入历史账目数据",                date: "2025-10" },
  { id: 18, Icon: Lock,            title: "账本权限控制",         desc: "支持设置成员角色权限，区分管理员与普通成员",       date: "2025-09" },
  { id: 19, Icon: Zap,             title: "快速记账",             desc: "首页一键快速添加账目，减少操作步骤",               date: "2025-09" },
  { id: 20, Icon: Star,            title: "常用分类置顶",         desc: "最近使用的分类自动置顶，提升记账效率",             date: "2025-09" },
  { id: 21, Icon: Globe,           title: "账本封面自定义",       desc: "支持为账本设置封面图片，个性化管理",               date: "2025-08" },
  { id: 22, Icon: Clock,           title: "账目时间轴",           desc: "按时间线展示账目流水，历史记录一目了然",           date: "2025-08" },
  { id: 23, Icon: FileText,        title: "账目备注",             desc: "每条账目支持添加文字备注，记录详细说明",           date: "2025-08" },
  { id: 24, Icon: Settings,        title: "账本设置",             desc: "支持修改账本名称、货币单位、封面等基本信息",       date: "2025-07" },
  { id: 25, Icon: ChevronRight,    title: "账目详情页",           desc: "点击账目可查看完整详情，包括创建人、时间等信息",   date: "2025-07" },
  { id: 26, Icon: MessageSquare,   title: "账目评论",             desc: "成员可对账目发表评论，方便团队沟通确认",           date: "2025-07" },
  { id: 27, Icon: CheckCircle,     title: "账目审核状态",         desc: "账目支持待审核/已通过/已拒绝状态流转",             date: "2025-06" },
  { id: 28, Icon: Wallet,          title: "多账本管理",           desc: "支持创建并管理多个独立账本，场景分类清晰",         date: "2025-06" },
  { id: 29, Icon: TrendingUp,      title: "收支趋势图",           desc: "可视化展示月度收支趋势，掌握财务走向",             date: "2025-05" },
  { id: 30, Icon: BookOpen,        title: "共享账本上线",         desc: "好友记账正式发布，开启多人协作共享账本新时代",     date: "2025-05" },
];

export default function LedgerOverview() {
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
    <div className="min-h-screen bg-[#FAF3ED] pb-20 max-w-md mx-auto relative shadow-2xl">
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

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
