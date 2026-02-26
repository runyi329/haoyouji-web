import { lazy, Suspense, useEffect } from "react";
// App v2.1 - 强制重新构建
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ColorThemeProvider } from "./contexts/ColorThemeContext";
import { Loader2 } from "lucide-react";
import { useVersionCheck } from "@/hooks/useVersionCheck";


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
const DeletedRecords = lazy(() => import("./pages/DeletedRecords"));
const PendingOverview = lazy(() => import("./pages/PendingOverview"));
const CreateLedgerType = lazy(() => import("./pages/CreateLedgerType"));
const CreateLedger = lazy(() => import("./pages/CreateLedger"));
const LedgerSettings = lazy(() => import("./pages/LedgerSettings"));
const LedgerImport = lazy(() => import("./pages/LedgerImport"));
const EditLedgerName = lazy(() => import("./pages/EditLedgerName"));
const EditNickname = lazy(() => import("./pages/EditNickname"));
const LedgerInvite = lazy(() => import("./pages/LedgerInvite"));
const JoinLedger = lazy(() => import("./pages/JoinLedger"));
const TransactionDetail = lazy(() => import("./pages/TransactionDetail"));
const LedgerFilter = lazy(() => import("./pages/LedgerFilter"));
const LedgerPermissions = lazy(() => import("./pages/LedgerPermissions"));
const LedgerApprovalSettings = lazy(() => import("./pages/LedgerApprovalSettings"));
const LedgerPendingApprovals = lazy(() => import("./pages/LedgerPendingApprovals"));
const LedgerAIEmployees = lazy(() => import("./pages/LedgerAIEmployees"));
const LedgerAdminManagement = lazy(() => import("./pages/LedgerAdminManagement"));
const LedgerReport = lazy(() => import("./pages/LedgerReport"));
const LedgerCalendar = lazy(() => import("./pages/LedgerCalendar"));
const LedgerImages = lazy(() => import("./pages/LedgerImages"));

const BannerConfig = lazy(() => import("./pages/admin/BannerConfig"));
const PointsManagement = lazy(() => import("./pages/admin/PointsManagement"));
const PointRulesManagement = lazy(() => import("./pages/PointRulesManagement"));
const MyEquity = lazy(() => import("./pages/MyEquity"));
const MyEquityRedWhite = lazy(() => import("./pages/MyEquity_RedWhite"));
const EquityHistoryArchive = lazy(() => import("./pages/EquityHistoryArchive"));
const WeeklyReportDetail = lazy(() => import("./pages/WeeklyReportDetail"));
const EquityManagement = lazy(() => import("./pages/admin/EquityManagement"));
const ValuationManagement = lazy(() => import("./pages/admin/ValuationManagement"));
const RechargeMonitor = lazy(() => import("./pages/admin/RechargeMonitor"));
const WalletAddressManager = lazy(() => import("./pages/admin/WalletAddressManager"));
const RechargeManualConfirm = lazy(() => import("./pages/admin/RechargeManualConfirm"));
const RechargeUnmatched = lazy(() => import("./pages/admin/RechargeUnmatched"));
const RechargeOrders = lazy(() => import("./pages/admin/RechargeOrders"));
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
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Switch>
        {/* 首页 - 根据用户账本访问记录跳转 */}
        <Route path="/" component={lazy(() => import("./pages/Home"))} />
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

        {/* 卡券相关页面 */}
        <Route path="/coupons" component={lazy(() => import("./pages/MyCoupons"))} />
        <Route path="/coupons/create" component={lazy(() => import("./pages/CreateCoupon"))} />
        <Route path="/coupons/:id" component={lazy(() => import("./pages/CouponDetail"))} />

        {/* 钱包相关页面 */}
        <Route path="/wallet" component={lazy(() => import("./pages/Wallet"))} />
        <Route path="/wallet/transactions" component={lazy(() => import("./pages/WalletTransactions"))} />
        <Route path="/payment-accounts" component={lazy(() => import("./pages/PaymentAccounts"))} />
        <Route path="/recharge" component={lazy(() => import("./pages/Recharge"))} />
        <Route path="/recharge/history" component={lazy(() => import("./pages/RechargeHistory"))} />

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
        <Route path="/parent/theme-settings" component={ThemeSettings} />
        <Route path="/parent/academy" component={Academy} />
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
        <Route path="/pending-overview" component={PendingOverview} />
        <Route path="/ledger/create-type" component={CreateLedgerType} />
        <Route path="/ledger/create" component={CreateLedger} />
        <Route path="/ledger/join/:token" component={JoinLedger} />
        <Route path="/ledger/:id/settings" component={LedgerSettings} />
        <Route path="/ledger/:id/import" component={LedgerImport} />
        <Route path="/ledger/:id/edit-name" component={EditLedgerName} />
        <Route path="/ledger/:id/edit-nickname" component={EditNickname} />
        <Route path="/ledger/:id/invite" component={LedgerInvite} />
        <Route path="/ledger/:id/filter" component={LedgerFilter} />
        <Route path="/ledger/:id/permissions" component={LedgerPermissions} />
        <Route path="/ledger/:id/approval-settings" component={LedgerApprovalSettings} />
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
        <Route path="/ledger/:id" component={LedgerDetail} />
        <Route path="/profile" component={Profile} />
        <Route path="/profile/edit" component={ProfileEdit} />
        
        {/* 脉动节点合作平台 */}
        <Route path="/work-groups" component={WorkGroupList} />
        <Route path="/work-group/:groupId/members" component={WorkGroupMembers} />
        <Route path="/work-group-member/:memberId/add-activity" component={AddWorkGroupActivity} />
        <Route path="/work-group-member/:memberId/activity/:activityId" component={WorkGroupActivityDetail} />
        <Route path="/work-group-member/:id" component={WorkGroupMemberDetail} />
        <Route path="/work-groups/:id" component={WorkGroupDetail} />
        <Route path="/node-growth-guide" component={NodeGrowthGuide} />
        <Route path="/partnership/dashboard-manage" component={PartnershipDashboardManage} />
        
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

          </TooltipProvider>
        </ColorThemeProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
