import { lazy, Suspense, useEffect } from "react";
// App v2.1 - 强制重新构建
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ColorThemeProvider } from "./contexts/ColorThemeContext";
import { Loader2 } from "lucide-react";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { useTokenPersistence } from "@/hooks/useTokenPersistence";
import { SuperViewBanner } from "@/components/SuperViewBanner";


// HMR 热更新提示音模块
let hmrAudioContext: AudioContext | null = null;
let hmrAudioUnlocked = false;

const initHmrAudio = () => {
  if (!hmrAudioContext) {
    hmrAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (hmrAudioContext.state === 'suspended') {
    hmrAudioContext.resume();
  }
  hmrAudioUnlocked = true;
};

const playHmrSound = () => {
  if (!hmrAudioUnlocked || !hmrAudioContext) return;
  try {
    if (hmrAudioContext.state === 'suspended') {
      hmrAudioContext.resume();
    }
    const now = hmrAudioContext.currentTime;
    // 清脆的叮咚声
    [880, 1100].forEach((freq, i) => {
      const osc = hmrAudioContext!.createOscillator();
      const gain = hmrAudioContext!.createGain();
      osc.connect(gain);
      gain.connect(hmrAudioContext!.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.12);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.12);
    });
    console.log('[HMR] 提示音已播放');
  } catch (e) {
    console.error('[HMR] 音频播放失败', e);
  }
};

// 监听 Vite HMR 事件
if (import.meta.hot) {
  import.meta.hot.on('vite:afterUpdate', () => {
    console.log('[HMR] 代码更新完成');
    playHmrSound();
  });
}

// 登录页直接加载
import Login from "./pages/Login";

// 首页Dashboard改为懒加载，避免在其他页面执行不必要的查询
// const ContactsManagement = lazy(() => import("./pages/ContactsManagement")); - 已废弃

// 其他页面懒加载
const Admin = lazy(() => import("./pages/Admin"));
const ContactsList = lazy(() => import("./pages/ContactsList"));
const RegionMap = lazy(() => import("./pages/RegionMap"));
const TagSearch = lazy(() => import("./pages/TagSearch"));
const DataComparison = lazy(() => import("./pages/DataComparison"));
const ContactDetail = lazy(() => import("./pages/ContactDetail"));
const AddContact = lazy(() => import("./pages/AddContact"));
const ExportContacts = lazy(() => import("./pages/ExportContacts"));
const ReferralChainVisualization = lazy(() => import("./pages/ReferralChainVisualization"));
const ReferralList = lazy(() => import("./pages/ReferralList"));
const TagsManagement = lazy(() => import("./pages/TagsManagement"));
const TagAnalytics = lazy(() => import("./pages/TagAnalytics"));
const SharingSettings = lazy(() => import("./pages/parent/contacts/SharingSettings"));
const ThemeSettings = lazy(() => import("./pages/parent/ThemeSettings"));
const Profile = lazy(() => import("./pages/Profile"));
const ProfileEdit = lazy(() => import("./pages/ProfileEdit"));
const ManusChat = lazy(() => import("./pages/ManusChat"));
const PointsDetail = lazy(() => import("./pages/PointsDetail"));
const InviteCode = lazy(() => import("./pages/InviteCode"));
const InvitedFriendsList = lazy(() => import("./pages/InvitedFriendsList"));
const Academy = lazy(() => import("./pages/Academy"));
const AIManagement = lazy(() => import("./pages/AIManagement"));
const Moments = lazy(() => import("./pages/Moments"));
const AIChat = lazy(() => import("./pages/AIChat"));
const Ledger = lazy(() => import("./pages/Ledger"));
const LedgerOverview = lazy(() => import("./pages/LedgerOverview"));
const LedgerDetail = lazy(() => import("./pages/LedgerDetail"));
const AddTransaction = lazy(() => import("./pages/AddTransaction"));
const LedgerCategories = lazy(() => import("./pages/LedgerCategories"));
const LedgerFeatures = lazy(() => import("./pages/LedgerFeatures"));
const LedgerGuide = lazy(() => import("./pages/LedgerGuide"));
const DeletedRecords = lazy(() => import("./pages/DeletedRecords"));
const PendingOverview = lazy(() => import("./pages/PendingOverview"));
const CreateLedgerType = lazy(() => import("./pages/CreateLedgerType"));
const CreateLedger = lazy(() => import("./pages/CreateLedger"));
const LedgerSettings = lazy(() => import("./pages/LedgerSettings"));
const PptGuide = lazy(() => import("./pages/PptGuide"));
const PptPromptLibrary = lazy(() => import("./pages/PptPromptLibrary"));
const AgDataSources = lazy(() => import("./pages/AgDataSources"));
const AfRechargeManage = lazy(() => import("./pages/AfRechargeManage"));
const AfOrderManage = lazy(() => import("./pages/AfOrderManage"));
const AfFeeDetail = lazy(() => import("./pages/AfFeeDetail"));
const AfPayoutManage = lazy(() => import("./pages/AfPayoutManage"));
const LedgerEquityManage = lazy(() => import("./pages/LedgerEquityManage"));
const LedgerMemberManage = lazy(() => import("./pages/LedgerMemberManage"));
const EquityWeightManage = lazy(() => import("./pages/EquityWeightManage"));
const FunderManagement = lazy(() => import("./pages/FunderManagement"));
const FinanceManagement = lazy(() => import("./pages/FinanceManagement"));
const AhCompanyWorkspace = lazy(() => import("./pages/AhCompanyWorkspace"));
const AiCompanyWorkspace = lazy(() => import("./pages/AiCompanyWorkspace"));
const MarketEvalSettings = lazy(() => import("./pages/MarketEvalSettings"));
const QQOnlinePage = lazy(() => import("./pages/QQOnlinePage"));
const QQOnlineHistory = lazy(() => import("./pages/QQOnlineHistory"));
const QQTradeRecords = lazy(() => import("./pages/QQTradeRecords"));
const QQSettings = lazy(() => import("./pages/QQSettings"));
// 石油业务页面
const OilBusinessPage = lazy(() => import("./pages/OilBusinessPage"));
// 黄金行情页面
const GoldTrackerPage = lazy(() => import("./pages/GoldTrackerPage"));
const FundingHistoryPage = lazy(() => import("./pages/FundingHistoryPage"));
const CryptoFundingHistoryPage = lazy(() => import("./pages/CryptoFundingHistoryPage"));
const OilPricesPage = lazy(() => import("./pages/OilPricesPage"));
const OilTradesPage = lazy(() => import("./pages/OilTradesPage"));
const LedgerAAInitialBalance = lazy(() => import("./pages/LedgerAAInitialBalance"));
const LedgerAADividendManage = lazy(() => import("./pages/LedgerAADividendManage"));
const LedgerAIDatabase = lazy(() => import("./pages/LedgerAIDatabase"));
const RetailInvestor = lazy(() => import("./pages/RetailInvestor"));
const StockLifecycle = lazy(() => import("./pages/StockLifecycle"));
const StockDetail = lazy(() => import("./pages/StockDetail"));
const AdminTransactionList = lazy(() => import("./pages/AdminTransactionList"));
const LedgerImport = lazy(() => import("./pages/LedgerImport"));
const EditLedgerName = lazy(() => import("./pages/EditLedgerName"));
const EditNickname = lazy(() => import("./pages/EditNickname"));
const LedgerInvite = lazy(() => import("./pages/LedgerInvite"));
const AfLedgerInvite = lazy(() => import("./pages/AfLedgerInvite"));
const JoinLedger = lazy(() => import("./pages/JoinLedger"));
const TransactionDetail = lazy(() => import("./pages/TransactionDetail"));
const RecordLogs = lazy(() => import("./pages/RecordLogs"));
const LedgerFilter = lazy(() => import("./pages/LedgerFilter"));
const LedgerPermissions = lazy(() => import("./pages/LedgerPermissions"));
const LedgerApprovalSettings = lazy(() => import("./pages/LedgerApprovalSettings"));
const LedgerPendingApprovals = lazy(() => import("./pages/LedgerPendingApprovals"));
const LedgerAIEmployees = lazy(() => import("./pages/LedgerAIEmployees"));
const LedgerAdminManagement = lazy(() => import("./pages/LedgerAdminManagement"));
const LedgerReport = lazy(() => import("./pages/LedgerReport"));
const LedgerCalendar = lazy(() => import("./pages/LedgerCalendar"));
const LedgerImages = lazy(() => import("./pages/LedgerImages"));
const DietAdd = lazy(() => import("./pages/DietAdd"));
const DietConfig = lazy(() => import("./pages/DietConfig"));
const DietMeal = lazy(() => import("./pages/DietMeal"));
const DietMembers = lazy(() => import("./pages/DietMembers"));
const DietCheckIn = lazy(() => import("./pages/DietCheckIn"));
const MemberInfoSettings = lazy(() => import("./pages/MemberInfoSettings"));

const BannerConfig = lazy(() => import("./pages/admin/BannerConfig"));
const PointsManagement = lazy(() => import("./pages/admin/PointsManagement"));
const PointRulesManagement = lazy(() => import("./pages/PointRulesManagement"));
const MyEquity = lazy(() => import("./pages/MyEquity"));
const MyEquityRedWhite = lazy(() => import("./pages/MyEquity_RedWhite"));
const EquityHistoryArchive = lazy(() => import("./pages/EquityHistoryArchive"));
const EquityHistoryPage = lazy(() => import("./pages/EquityHistoryPage"));
const WeeklyReportDetail = lazy(() => import("./pages/WeeklyReportDetail"));
const EquityManagement = lazy(() => import("./pages/admin/EquityManagement"));
const ValuationManagement = lazy(() => import("./pages/admin/ValuationManagement"));
const RechargeMonitor = lazy(() => import("./pages/admin/RechargeMonitor"));
const WalletAddressManager = lazy(() => import("./pages/admin/WalletAddressManager"));
const RechargeManualConfirm = lazy(() => import("./pages/admin/RechargeManualConfirm"));
const RechargeUnmatched = lazy(() => import("./pages/admin/RechargeUnmatched"));
const RechargeOrders = lazy(() => import("./pages/admin/RechargeOrders"));
const SuperViewUserList = lazy(() => import("./pages/admin/SuperViewUserList"));
const SuperViewContacts = lazy(() => import("./pages/admin/SuperViewContacts"));
const AssetReport = lazy(() => import("./pages/AssetReport"));
const ArticleDetail = lazy(() => import("./pages/ArticleDetail"));
const PromotionRules = lazy(() => import("./pages/PromotionRules"));
const BusinessPlan = lazy(() => import("./pages/BusinessPlan"));
const CapitalMultiplierTable = lazy(() => import("./pages/CapitalMultiplierTable"));
const PosterFavorites = lazy(() => import("./pages/PosterFavorites"));
const WorkGroupList = lazy(() => import("./pages/WorkGroupList"));
const WorkGroupDetail = lazy(() => import("./pages/WorkGroupDetail"));
const WorkGroupMembers = lazy(() => import("./pages/WorkGroupMembers"));
const WorkGroupMemberDetail = lazy(() => import("./pages/WorkGroupMemberDetail"));
const WorkGroupActivityDetail = lazy(() => import("./pages/WorkGroupActivityDetail"));
const AddWorkGroupActivity = lazy(() => import("./pages/AddWorkGroupActivity"));
const NodeGrowthGuide = lazy(() => import("./pages/NodeGrowthGuide"));
const PartnershipDashboardManage = lazy(() => import("./pages/PartnershipDashboardManage"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const UserAgreement = lazy(() => import("./pages/UserAgreement"));
const ProductStore = lazy(() => import("./pages/ProductStore"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const PaymentResult = lazy(() => import("./pages/PaymentResult"));
const SentiaHome = lazy(() => import("./pages/SentiaHome"));
// AE 共享抽奖
const LotteryCreate = lazy(() => import("./pages/LotteryCreate"));
// AF 加密货币竞猜
const CryptoPrediction = lazy(() => import("./pages/CryptoPrediction"));
const LotteryEdit = lazy(() => import("./pages/LotteryEdit"));
const LotteryActivity = lazy(() => import("./pages/LotteryActivity"));
const LotteryList = lazy(() => import("./pages/LotteryList"));
const LotteryDrawScreen = lazy(() => import("./pages/LotteryDraw").then(m => ({ default: m.LotteryDrawScreen })));
const LotteryResults = lazy(() => import("./pages/LotteryDraw").then(m => ({ default: m.LotteryResults })));
const SentiaBuy = lazy(() => import("./pages/SentiaBuy"));
const SentiaWhitepaper = lazy(() => import("./pages/SentiaWhitepaper"));
// 脉动工具
const Tools = lazy(() => import("./pages/Tools"));
const ContractTool = lazy(() => import("./pages/ContractTool"));
const ExchangeRate = lazy(() => import("./pages/ExchangeRate"));
// 奢贝美容院
const BeautyHome = lazy(() => import("./pages/beauty/BeautyHome"));
const BeautyServices = lazy(() => import("./pages/beauty/BeautyServices"));
const BeautyBooking = lazy(() => import("./pages/beauty/BeautyBooking"));
const BeautyAppointments = lazy(() => import("./pages/beauty/BeautyAppointments"));
const BeautyShop = lazy(() => import("./pages/beauty/BeautyShop"));
const BeautyCart = lazy(() => import("./pages/beauty/BeautyCart"));
const BeautyProductDetail = lazy(() => import("./pages/beauty/BeautyProductDetail"));
const BeautyProductShare = lazy(() => import("./pages/beauty/BeautyProductShare"));
const BeautyHealth = lazy(() => import("./pages/beauty/BeautyHealth"));
const BeautyAiDiet = lazy(() => import("./pages/beauty/BeautyAiDiet"));
const BeautyProfile = lazy(() => import("./pages/beauty/BeautyProfile"));
const BeautyClients = lazy(() => import("./pages/beauty/BeautyClients"));
const BeautySettings = lazy(() => import("./pages/beauty/BeautySettings"));
const BeautyShowcase = lazy(() => import("./pages/beauty/BeautyShowcase"));
const BeautyShowcaseShare = lazy(() => import("./pages/beauty/BeautyShowcaseShare"));
const BeautyMaterial = lazy(() => import("./pages/beauty/BeautyMaterial"));
const BeautyMaterialShare = lazy(() => import("./pages/beauty/BeautyMaterialShare"));
const BeautyLaundry = lazy(() => import("./pages/beauty/BeautyLaundry"));
const BeautyLaundryOrder = lazy(() => import("./pages/beauty/BeautyLaundryOrder"));
// 红酒文化商会（cx8618）
const WineHome = lazy(() => import("./pages/wine/WineHome"));
const WineNews = lazy(() => import("./pages/wine/WineNews"));
const WineBrands = lazy(() => import("./pages/wine/WineBrands"));
const WineProfile = lazy(() => import("./pages/wine/WineProfile"));
const WineAdmin = lazy(() => import("./pages/wine/WineAdmin"));
const WineSettings = lazy(() => import("./pages/wine/WineSettings"));
const WineProductFidencio = lazy(() => import("./pages/wine/products/WineProductFidencio"));
const WineProductMarthu = lazy(() => import("./pages/wine/products/WineProductMarthu"));
const WineProductRomanico = lazy(() => import("./pages/wine/products/WineProductRomanico"));
const WineProductRomanicoShare = lazy(() => import("./pages/wine/products/WineProductRomanicoShare"));
// IDEALIGHT 红颜派（STEVEN_HUANG）
const IdeaLightHome = lazy(() => import("./pages/idealight/IdeaLightHome"));
// 汉明专属产品页面
const HanmingHome = lazy(() => import("./pages/hanming/HanmingHome"));
// 润仪算力研发中心（jiang）
const JiangHome = lazy(() => import("./pages/jiang/JiangHome"));
const JiangServices = lazy(() => import("./pages/jiang/JiangServices"));
const JiangShop = lazy(() => import("./pages/jiang/JiangShop"));
const JiangAbout = lazy(() => import("./pages/jiang/JiangAbout"));
const JiangProfile = lazy(() => import("./pages/jiang/JiangProfile"));
const JiangBuildRules = lazy(() => import("./pages/jiang/JiangBuildRules"));
const JiangShare = lazy(() => import("./pages/jiang/JiangShare"));
const JiangSettings = lazy(() => import("./pages/jiang/JiangSettings"));
const JiangMerchants = lazy(() => import("./pages/jiang/JiangMerchants"));
const JiangOKXTrader = lazy(() => import("./pages/jiang/JiangOKXTrader"));
const JiangSmsManage = lazy(() => import("./pages/jiang/JiangSmsManage"));
// AB 共享意见本 - 游客扫码页面
const FeedbackPage = lazy(() => import("./pages/FeedbackPage"));
// AB 意见本 - 管理者查看页面
const OpinionBookDetail = lazy(() => import("./pages/OpinionBookDetail"));
// AB 意见本 - 二维码管理
const QrCodeManager = lazy(() => import("./pages/QrCodeManager"));
// AB 意见本 - 多角色演示页（无需登录）
const DemoOpinionBook = lazy(() => import("./pages/DemoOpinionBook"));
// AB 意见本 - 正式模板页（无演示按钮，无需登录）
const ABOpinionBook = lazy(() => import("./pages/ABOpinionBook"));
// 私人定制展示页
const CustomShowcase = lazy(() => import("./pages/CustomShowcase"));
const CustomShowcaseShare = lazy(() => import("./pages/CustomShowcase").then(m => ({ default: m.CustomShowcaseShare })));

// 加载中组件
function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-muted-foreground text-sm">加载中...</p>
      </div>
    </div>
  );
}

function Router() {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading } = trpc.auth.me.useQuery();

  useEffect(() => {
    if (isLoading) return;
    // liulifan 首次打开网站时自动跳到奢贝首页
    // 使用 sessionStorage 标记确保每次会话只跳转一次
    // 之后点人脉/钱脉/奢贝都是平行切换，不会强制跳转
    if (user?.username === 'liulifan' && location === '/') {
      const hasRedirected = sessionStorage.getItem('_beauty_redirected');
      if (!hasRedirected) {
        sessionStorage.setItem('_beauty_redirected', '1');
        setLocation('/beauty');
      }
    }
  }, [user, isLoading, location]);

  // 认证状态加载中时直接显示Loading，避免Switch提前命中NotFound导致刷新页面闪现404
  if (isLoading) {
    return <LoadingFallback />;
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Switch>
        {/* 首页 - / 路由永远是人脉页面 */}
        <Route path="/" component={lazy(() => import("./pages/HomeEntry"))} />
        {/* 脉动Dashboard */}        <Route path="/login" component={Login} />
        <Route path="/privacy-policy" component={PrivacyPolicy} />
        <Route path="/user-agreement" component={UserAgreement} />
        
        {/* 后台管理 */}
        <Route path="/admin" component={Admin} />
        <Route path="/admin/banner" component={BannerConfig} />
        <Route path="/admin/points" component={PointsManagement} />
        <Route path="/admin/point-rules" component={PointRulesManagement} />
        <Route path="/admin/equity" component={EquityManagement} />
        <Route path="/admin/valuation-management" component={ValuationManagement} />
        <Route path="/admin/recharge-monitor" component={RechargeMonitor} />
        <Route path="/admin/wallet-addresses" component={WalletAddressManager} />
        <Route path="/admin/recharge/manual-confirm" component={RechargeManualConfirm} />
        <Route path="/admin/recharge/unmatched" component={RechargeUnmatched} />
        <Route path="/admin/recharge/orders" component={RechargeOrders} />
        <Route path="/admin/migration" component={lazy(() => import("./pages/AdminMigration"))} />
        <Route path="/admin/super-view" component={SuperViewUserList} />
        <Route path="/admin/super-view/contacts" component={SuperViewContacts} />

        {/* 商品商店 */}
        <Route path="/products" component={ProductStore} />
        <Route path="/products/:id" component={ProductDetail} />
        <Route path="/payment/result" component={PaymentResult} />

        {/* 卡券相关页面 */}
        <Route path="/coupons" component={lazy(() => import("./pages/MyCoupons"))} />
        <Route path="/coupons/create" component={lazy(() => import("./pages/CreateCoupon"))} />
        <Route path="/coupons/:id" component={lazy(() => import("./pages/CouponDetail"))} />
        <Route path="/membership" component={lazy(() => import("./pages/MemberShip"))} />

        {/* 钱包相关页面 */}
        <Route path="/wallet" component={lazy(() => import("./pages/Wallet"))} />
        <Route path="/wallet/transactions" component={lazy(() => import("./pages/WalletTransactions"))} />
        <Route path="/payment-accounts" component={lazy(() => import("./pages/PaymentAccounts"))} />
        <Route path="/recharge" component={lazy(() => import("./pages/Recharge"))} />
        <Route path="/recharge/history" component={lazy(() => import("./pages/RechargeHistory"))} />
        <Route path="/withdraw" component={lazy(() => import("./pages/Withdraw"))} />

        {/* 好友记相关页面 */}
        <Route path="/parent/contacts/list" component={ContactsList} />
        <Route path="/parent/contacts/map" component={RegionMap} />
        <Route path="/parent/contacts/tag-search" component={TagSearch} />
        <Route path="/parent/contacts/data-comparison" component={DataComparison} />
        <Route path="/parent/contacts/add" component={AddContact} />
        <Route path="/parent/contacts/export" component={ExportContacts} />
        <Route path="/parent/contacts/tags" component={TagsManagement} />
        <Route path="/parent/contacts/tag-analytics" component={TagAnalytics} />
        <Route path="/parent/contacts/interaction-stats" component={lazy(() => import("./pages/InteractionStats"))} />
        <Route path="/parent/contacts/tag-stats" component={lazy(() => import("./pages/TagStats"))} />
        <Route path="/parent/contacts/sharing" component={SharingSettings} />
        <Route path="/parent/init-categories" component={lazy(() => import("./pages/InitCategories"))} />
        <Route path="/parent/profile" component={Profile} />
        <Route path="/parent/profile/edit" component={ProfileEdit} />
        <Route path="/parent/topology" component={lazy(() => import("./pages/TopologyStats"))} />
        <Route path="/parent/topology/links" component={lazy(() => import("./pages/TopologyLinkDetail"))} />
        <Route path="/parent/theme-settings" component={ThemeSettings} />
        <Route path="/parent/academy" component={Academy} />
        <Route path="/tools" component={Tools} />
        <Route path="/tools/contract" component={ContractTool} />
        <Route path="/exchange-rate" component={ExchangeRate} />
        <Route path="/custom-showcase" component={CustomShowcase} />
        <Route path="/custom-showcase/share" component={CustomShowcaseShare} />
        <Route path="/parent/ai-management" component={AIManagement} />
        <Route path="/parent/points" component={PointsDetail} />
        <Route path="/parent/my-equity" component={MyEquityRedWhite} />
        <Route path="/parent/my-equity-old" component={MyEquity} />
        <Route path="/parent/equity-history" component={EquityHistoryArchive} />
        <Route path="/parent/equity-history/:weekNumber" component={WeeklyReportDetail} />
        <Route path="/parent/asset-report" component={AssetReport} />
        <Route path="/article/:id" component={ArticleDetail} />
        <Route path="/parent/promotion-rules" component={PromotionRules} />
        <Route path="/parent/business-plan" component={BusinessPlan} />
        <Route path="/parent/capital-multiplier-table" component={CapitalMultiplierTable} />
        <Route path="/parent/profile/invite" component={InviteCode} />
        <Route path="/parent/poster-favorites" component={PosterFavorites} />
        <Route path="/invited-friends" component={InvitedFriendsList} />

        <Route path="/parent/contacts/:id" component={ContactDetail} />
        <Route path="/parent/contacts/:contactId/referral-chain" component={ReferralChainVisualization} />
        <Route path="/parent/contacts/:contactId/referrals/:type" component={ReferralList} />
        
        {/* 底部导航栏页面 */}
        <Route path="/moments" component={Moments} />
        <Route path="/ai" component={AIChat} />
        <Route path="/ledger" component={LedgerOverview} />
        <Route path="/ledger/list" component={Ledger} />
        <Route path="/ledger/guide" component={LedgerGuide} />
        <Route path="/pending-overview" component={PendingOverview} />
        <Route path="/ledger/create-type" component={CreateLedgerType} />
        <Route path="/ledger/create" component={CreateLedger} />
        <Route path="/ledger/join/:token" component={JoinLedger} />
        <Route path="/ledger/:id/settings" component={LedgerSettings} />
        <Route path="/ledger/:id/ag-data-sources" component={AgDataSources} />
        <Route path="/ledger/:ledgerId/equity-history" component={EquityHistoryPage} />
        <Route path="/ledger/:id/equity-manage" component={LedgerEquityManage} />
        <Route path="/ledger/:id/equity-weight-manage" component={EquityWeightManage} />
        <Route path="/ledger/:id/member-manage">{(params) => <LedgerMemberManage ledgerId={Number(params.id)} />}</Route>
        <Route path="/ledger/:id/af-recharge-manage" component={AfRechargeManage} />
        <Route path="/ledger/:id/af-order-manage" component={AfOrderManage} />
        <Route path="/ledger/:id/af-fee-detail" component={AfFeeDetail} />
        <Route path="/ledger/:id/af-payout-manage" component={AfPayoutManage} />
        <Route path="/ledger/:id/funder-management" component={FunderManagement} />
        <Route path="/ledger/:id/finance-management" component={FinanceManagement} />
        <Route path="/ledger/:id/company/:companyId" component={AhCompanyWorkspace} />
        <Route path="/ledger/:id/ai-company/:companyId" component={AiCompanyWorkspace} />
        <Route path="/ledger/:id/market-eval-settings" component={MarketEvalSettings} />
        <Route path="/ledger/:id/aa-initial-balance" component={LedgerAAInitialBalance} />
        <Route path="/ledger/:id/aa-dividend-manage" component={LedgerAADividendManage} />
        <Route path="/ledger/:id/ai-database" component={LedgerAIDatabase} />
        <Route path="/ledger/:id/retail-investor" component={RetailInvestor} />
        <Route path="/ledger/:id/admin-transactions" component={AdminTransactionList} />
        <Route path="/ledger/:id/import" component={LedgerImport} />
        <Route path="/ledger/:id/edit-name" component={EditLedgerName} />
        <Route path="/ledger/:id/edit-nickname" component={EditNickname} />
        <Route path="/ledger/:id/invite" component={LedgerInvite} />
        <Route path="/ledger/:id/af-invite" component={AfLedgerInvite} />
        <Route path="/ledger/:id/filter" component={LedgerFilter} />
        <Route path="/ledger/:id/permissions" component={LedgerPermissions} />
        <Route path="/ledger/:id/approval-settings" component={LedgerApprovalSettings} />
        <Route path="/ledger/:id/member-info" component={MemberInfoSettings} />
        <Route path="/ledger/:id/pending-approvals" component={LedgerPendingApprovals} />
        <Route path="/ledger/:id/ai-employees" component={LedgerAIEmployees} />
        <Route path="/ledger/:id/admin-management" component={LedgerAdminManagement} />
        <Route path="/ledger/:id/report" component={LedgerReport} />
        <Route path="/ledger/:id/calendar" component={LedgerCalendar} />
        <Route path="/ledger/:id/images" component={LedgerImages} />
        <Route path="/ledger/:id/add" component={AddTransaction} />
        <Route path="/ledger/:id/categories" component={LedgerCategories} />
        <Route path="/ledger/:id/features" component={LedgerFeatures} />
        <Route path="/ledger/:id/deleted-records" component={DeletedRecords} />
        <Route path="/ledger/:ledgerId/transaction/:transactionId" component={TransactionDetail} />
        <Route path="/ledger/:ledgerId/transaction/:transactionId/logs" component={RecordLogs} />
        <Route path="/ledger/:id/diet-add" component={DietAdd} />
        <Route path="/ledger/:id/diet-config" component={DietConfig} />
        <Route path="/ledger/:id/diet-meal" component={DietMeal} />
        <Route path="/ledger/:id/diet-members" component={DietMembers} />
        <Route path="/ledger/:id/diet-checkin" component={DietCheckIn} />
        <Route path="/ledger/:id/ppt-guide" component={PptGuide} />
        <Route path="/ledger/:id/ppt-prompt-library" component={PptPromptLibrary} />
        <Route path="/ledger/:id" component={LedgerDetail} />
        <Route path="/profile" component={Profile} />
        <Route path="/profile/edit" component={ProfileEdit} />
        <Route path="/manus" component={ManusChat} />
        
        {/* 脉动节点合作平台 */}
        <Route path="/work-groups" component={WorkGroupList} />
        <Route path="/work-group/:groupId/members" component={WorkGroupMembers} />
        <Route path="/work-group-member/:memberId/add-activity" component={AddWorkGroupActivity} />
        <Route path="/work-group-member/:memberId/activity/:activityId" component={WorkGroupActivityDetail} />
        <Route path="/work-group-member/:id" component={WorkGroupMemberDetail} />
        <Route path="/work-groups/:id" component={WorkGroupDetail} />
        <Route path="/node-growth-guide" component={NodeGrowthGuide} />
        <Route path="/partnership/dashboard-manage" component={PartnershipDashboardManage} />

        {/* Sentia 数字货币子站 */}
        <Route path="/sentia" component={SentiaHome} />
        <Route path="/sentia/buy" component={SentiaBuy} />
        <Route path="/sentia/whitepaper" component={SentiaWhitepaper} />

        {/* 奢贝美容院 */}
        <Route path="/beauty" component={BeautyHome} />
        <Route path="/beauty/services" component={BeautyServices} />
        <Route path="/beauty/booking" component={BeautyBooking} />
        <Route path="/beauty/appointments" component={BeautyAppointments} />
        <Route path="/beauty/shop" component={BeautyShop} />
        <Route path="/beauty/cart" component={BeautyCart} />
        <Route path="/beauty/product/:id" component={BeautyProductDetail} />
        <Route path="/share/beauty/product/:id" component={BeautyProductShare} />
        <Route path="/beauty/health" component={BeautyHealth} />
        <Route path="/beauty/ai-diet" component={BeautyAiDiet} />
        <Route path="/beauty/profile" component={BeautyProfile} />
        <Route path="/beauty/clients" component={BeautyClients} />
        <Route path="/beauty/settings" component={BeautySettings} />
        <Route path="/beauty/showcase" component={BeautyShowcase} />
        <Route path="/beauty/showcase/share" component={BeautyShowcaseShare} />
        <Route path="/beauty/material" component={BeautyMaterial} />
        <Route path="/beauty/material/share" component={BeautyMaterialShare} />
        <Route path="/beauty/laundry" component={BeautyLaundry} />
        <Route path="/beauty/laundry/order" component={BeautyLaundryOrder} />

        {/* 润仪算力研发中心（jiang） */}
        <Route path="/jiang" component={JiangHome} />
        <Route path="/jiang/services" component={JiangServices} />
        <Route path="/jiang/shop" component={JiangShop} />
        <Route path="/jiang/about" component={JiangAbout} />
        <Route path="/jiang/profile" component={JiangProfile} />
        <Route path="/jiang/build-rules" component={JiangBuildRules} />
        <Route path="/jiang/settings" component={JiangSettings} />
        <Route path="/jiang/merchants" component={JiangMerchants} />
        <Route path="/jiang/okx-trader" component={JiangOKXTrader} />
        <Route path="/jiang/sms-manage" component={JiangSmsManage} />
        {/* 润仪算力研发中心 - 分享页（无需登录，参见§24） */}
        <Route path="/share/jiang" component={JiangShare} />
        {/* IDEALIGHT 红颜派（STEVEN_HUANG，无需登录） */}
        <Route path="/idealight" component={IdeaLightHome} />
        {/* 汉明专属产品页面 */}
        <Route path="/hanming" component={HanmingHome} />
        {/* 红酒文化商会（cx8618） */}
        <Route path="/wine" component={WineHome} />
        <Route path="/wine/news" component={WineNews} />
        <Route path="/wine/brands" component={WineBrands} />
        <Route path="/wine/profile" component={WineProfile} />
        <Route path="/wine/admin" component={WineAdmin} />
        <Route path="/wine/settings" component={WineSettings} />
        {/* 红酒商品详情页 */}
        <Route path="/wine/product/fidencio" component={WineProductFidencio} />
        <Route path="/wine/product/marthu" component={WineProductMarthu} />
        <Route path="/wine/product/romanico" component={WineProductRomanico} />
        <Route path="/share/wine/product/romanico" component={WineProductRomanicoShare} />
        {/* AB 共享意见本 - 游客扫码页面（新架构：ledgerId + categoryId） */}
        {/* AE 共享抽奖 */}
        <Route path="/lottery/create" component={LotteryCreate} />
        {/* AF 加密货币竞猜 */}
        <Route path="/ledger/:id/crypto-prediction" component={CryptoPrediction} />
        {/* QQ 在线人数记录 */}
        <Route path="/ledger/:id/qq" component={QQOnlinePage} />
        <Route path="/ledger/:id/qq/history" component={QQOnlineHistory} />
        <Route path="/ledger/:id/qq/trade" component={QQTradeRecords} />
        <Route path="/ledger/:id/qq/settings" component={QQSettings} />
        {/* 石油业务 */}
        <Route path="/ledger/:id/oil" component={OilBusinessPage} />
        <Route path="/ledger/:id/gold" component={GoldTrackerPage} />
        <Route path="/ledger/:id/oil/funding-history" component={FundingHistoryPage} />
        {/* 加密货币资金费率历史 */}
        <Route path="/ledger/:id/crypto/funding-history" component={CryptoFundingHistoryPage} />
        <Route path="/ledger/:id/oil/prices" component={OilPricesPage} />
        <Route path="/ledger/:id/oil/trades" component={OilTradesPage} />
        {/* AD 提示词库 */}
        <Route path="/ledger/:id/prompt-library" component={lazy(() => import("./pages/PromptLibraryPage"))} />
        {/* 提示词库快捷入口（不需要ledgerId） */}
        <Route path="/ppt-prompt-library" component={PptPromptLibrary} />
        <Route path="/lottery/edit/:activityId" component={LotteryEdit} />
        <Route path="/lottery/list/:ledgerId" component={LotteryList} />
        <Route path="/lottery/:activityId/draw" component={LotteryDrawScreen} />
        <Route path="/lottery/:activityId/results" component={LotteryResults} />
        <Route path="/lottery/:activityId" component={LotteryActivity} />

        <Route path="/feedback/:ledgerId/:categoryId" component={FeedbackPage} />
        <Route path="/feedback/:ledgerId" component={FeedbackPage} />
        {/* AB 意见本 - 管理者查看页面 */}
        <Route path="/opinion/:bookId" component={OpinionBookDetail} />
        {/* AB 意见本 - 多角色演示页（无需登录） */}
        <Route path="/demo/opinion/:bookId" component={DemoOpinionBook} />
        {/* AB 意见本 - 正式模板页（无演示按钮，无需登录） */}
        <Route path="/ab/opinion/:bookId/:categoryId" component={ABOpinionBook} />
        <Route path="/ab/opinion/:bookId" component={ABOpinionBook} />
        <Route path="/ledger/:id/qrcodes" component={QrCodeManager} />

        {/* 个股列表 & 详情 */}
        <Route path="/ledger/:id/stock-lifecycle" component={StockLifecycle} />
        <Route path="/stock/:tsCode" component={StockDetail} />
        {/* 404 */}
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  // 版本检测（临时强制更新机制）
  useVersionCheck();
  
  // Token持久化（确保微信环境下登录状态不丢失）
  useTokenPersistence();

  // Safari PWA 视图层保护：页面从后台恢复时，强制重新验证用户身份
  // 这是最后一道防线，确保即使SPA导航未生效，也能检测到用户变化
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // 页面变为可见时，同步localStorage token到Cookie
        try {
          const token = localStorage.getItem('auth-token');
          if (token) {
            document.cookie = `app_session_id=${token}; path=/; max-age=${365 * 24 * 60 * 60}`;
          }
        } catch (e) {}
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // 解锁音频上下文（移动端需要用户交互后才能播放音频）
  useEffect(() => {
    const unlockAudio = () => {
      initHmrAudio();
      console.log('[HMR] 音频已解锁，热更新时将播放提示音');
      // 解锁后移除监听器
      ['click', 'touchstart', 'touchend'].forEach(event => {
        document.removeEventListener(event, unlockAudio, true);
      });
    };
    ['click', 'touchstart', 'touchend'].forEach(event => {
      document.addEventListener(event, unlockAudio, true);
    });
    return () => {
      ['click', 'touchstart', 'touchend'].forEach(event => {
        document.removeEventListener(event, unlockAudio, true);
      });
    };
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <ColorThemeProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
            <SuperViewBanner />

          </TooltipProvider>
        </ColorThemeProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
