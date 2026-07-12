import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import MLMLayout from "./components/MLMLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

const HerbalifeDetail = lazy(() => import("./pages/HerbalifeDetail"));
const SyjkDetail = lazy(() => import("./pages/SyjkDetail"));
const AmwaySimulator = lazy(() => import("./pages/simulators/AmwaySimulator"));
const MaryKaySimulator = lazy(() => import("./pages/simulators/MaryKaySimulator"));
const InfinitusSimulator = lazy(() => import("./pages/simulators/InfinitusSimulator"));
const SunhopeSimulator = lazy(() => import("./pages/simulators/SunhopeSimulator"));
const BabycareSimulator = lazy(() => import("./pages/simulators/BabycareSimulator"));
const TianshouSimulator = lazy(() => import("./pages/simulators/TianshouSimulator"));
const NuSkinSimulator = lazy(() => import("./pages/simulators/NuSkinSimulator"));
const CustomSchemeWizard = lazy(() => import("./pages/CustomSchemeWizard"));
const CustomSchemeDetail = lazy(() => import("./pages/CustomSchemeDetail"));
const ComparePage = lazy(() => import("./pages/ComparePage"));
const Login = lazy(() => import("./pages/Login"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      {/* 首页：独立全屏白色布局，不使用侧边栏 */}
      <Route path="/" component={Home} />

      {/* 登录页：独立全屏布局 */}
      <Route path="/login">
        <Suspense fallback={<PageLoader />}><Login /></Suspense>
      </Route>

      {/* 自定义向导、详情、对比页：独立全屏布局 */}
      <Route path="/custom/new">
        <Suspense fallback={<PageLoader />}><CustomSchemeWizard /></Suspense>
      </Route>
      <Route path="/custom/:id">
        <Suspense fallback={<PageLoader />}><CustomSchemeDetail /></Suspense>
      </Route>
      <Route path="/compare">
        <Suspense fallback={<PageLoader />}><ComparePage /></Suspense>
      </Route>

      {/* 其他页面：使用 MLMLayout 侧边栏 */}
      <Route>
        <MLMLayout>
          <Suspense fallback={<PageLoader />}>
            <Switch>
              <Route path="/herbalife" component={HerbalifeDetail} />
              <Route path="/syjk" component={SyjkDetail} />
              <Route path="/amway" component={AmwaySimulator} />
              <Route path="/marykay" component={MaryKaySimulator} />
              <Route path="/infinitus" component={InfinitusSimulator} />
              <Route path="/sunhope" component={SunhopeSimulator} />
              <Route path="/babycare" component={BabycareSimulator} />
              <Route path="/tianshou" component={TianshouSimulator} />
              <Route path="/nuskin" component={NuSkinSimulator} />
              <Route>
                <div className="flex items-center justify-center h-64 text-muted-foreground">页面不存在</div>
              </Route>
            </Switch>
          </Suspense>
        </MLMLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
