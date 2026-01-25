import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Loader2 } from "lucide-react";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";

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

// 首页Dashboard直接加载
import ContactsManagement from "./pages/ContactsManagement";
import Login from "./pages/Login";

// 其他页面懒加载
const Admin = lazy(() => import("./pages/Admin"));
const ContactsList = lazy(() => import("./pages/ContactsList"));
const RegionMap = lazy(() => import("./pages/RegionMap"));
const TagSearch = lazy(() => import("./pages/TagSearch"));
const DataComparison = lazy(() => import("./pages/DataComparison"));
const LedgerList = lazy(() => import("./pages/LedgerList"));
const LedgerDetail = lazy(() => import("./pages/LedgerDetail"));
const ContactDetail = lazy(() => import("./pages/ContactDetail"));
const AddContact = lazy(() => import("./pages/AddContact"));
const ExportContacts = lazy(() => import("./pages/ExportContacts"));
const ReferralChainVisualization = lazy(() => import("./pages/ReferralChainVisualization"));
const ReferralList = lazy(() => import("./pages/ReferralList"));
const TagsManagement = lazy(() => import("./pages/TagsManagement"));
const TagAnalytics = lazy(() => import("./pages/TagAnalytics"));
const SharingSettings = lazy(() => import("./pages/parent/contacts/SharingSettings"));
const Profile = lazy(() => import("./pages/Profile"));
const PointsDetail = lazy(() => import("./pages/PointsDetail"));
const ProfileSettings = lazy(() => import("./pages/ProfileSettings"));
const Academy = lazy(() => import("./pages/Academy"));
const AIManagement = lazy(() => import("./pages/AIManagement"));

const BannerConfig = lazy(() => import("./pages/admin/BannerConfig"));
const PointsManagement = lazy(() => import("./pages/admin/PointsManagement"));
const PointRulesManagement = lazy(() => import("./pages/PointRulesManagement"));
const NotFound = lazy(() => import("@/pages/NotFound"));

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
        {/* 首页 = 好友记Dashboard */}
        <Route path="/" component={ContactsManagement} />
        <Route path="/login" component={Login} />
        
        {/* 后台管理 */}
        <Route path="/admin" component={Admin} />
        <Route path="/admin/banner" component={BannerConfig} />
        <Route path="/admin/points" component={PointsManagement} />
        <Route path="/admin/point-rules" component={PointRulesManagement} />

        {/* 好友记相关页面 */}
        <Route path="/parent/contacts" component={ContactsManagement} />
        <Route path="/parent/contacts/list" component={ContactsList} />
        <Route path="/parent/contacts/map" component={RegionMap} />
        <Route path="/parent/contacts/tag-search" component={TagSearch} />
        <Route path="/parent/contacts/data-comparison" component={DataComparison} />
        <Route path="/parent/contacts/add" component={AddContact} />
        <Route path="/parent/contacts/export" component={ExportContacts} />
        <Route path="/parent/contacts/tags" component={TagsManagement} />
        <Route path="/parent/contacts/tag-analytics" component={TagAnalytics} />
        <Route path="/parent/contacts/sharing" component={SharingSettings} />
        <Route path="/parent/profile" component={Profile} />
        <Route path="/parent/academy" component={Academy} />
        <Route path="/parent/ai-management" component={AIManagement} />
        <Route path="/parent/points" component={PointsDetail} />
        <Route path="/parent/profile/settings" component={ProfileSettings} />

        <Route path="/parent/contacts/:id" component={ContactDetail} />
        <Route path="/parent/contacts/:contactId/referral-chain" component={ReferralChainVisualization} />
        <Route path="/parent/contacts/:contactId/referrals/:type" component={ReferralList} />
        <Route path="/ledger" component={LedgerList} />
        <Route path="/ledger/:id" component={LedgerDetail} />
        
        {/* 404 */}
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
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
        <TooltipProvider>
          <Toaster />
          <Router />
          <PWAInstallPrompt />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
