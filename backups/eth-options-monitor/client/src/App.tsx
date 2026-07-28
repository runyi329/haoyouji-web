import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import HistoryAnalysis from "@/pages/HistoryAnalysis";
import ProductDesign from "@/pages/ProductDesign";
import AnnualizedChain from "@/pages/AnnualizedChain";
import IVSmile from "@/pages/IVSmile";
import SsoLogin from "@/pages/SsoLogin";
import StockRisk from "@/pages/StockRisk";

// 品种偏好 localStorage key
export const LS_PRODUCT_KEY = 'eth-product-pref-v1';
export type ProductPref = 'eth' | 'stock';

/** 读取上次选择的品种，默认 eth */
export function loadProductPref(): ProductPref {
  try {
    const v = localStorage.getItem(LS_PRODUCT_KEY);
    if (v === 'stock') return 'stock';
  } catch { /* ignore */ }
  return 'eth';
}

/** 保存品种选择 */
export function saveProductPref(pref: ProductPref) {
  try { localStorage.setItem(LS_PRODUCT_KEY, pref); } catch { /* ignore */ }
}

/** 根路径：读取偏好后重定向到对应页面 */
function RootRedirect() {
  const pref = loadProductPref();
  return <Redirect to={pref === 'stock' ? '/stock-risk' : '/annualized'} />;
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={RootRedirect} />
      <Route path={"/legacy"} component={Home} />
      <Route path={"/history"} component={HistoryAnalysis} />
      <Route path={"/product-design"} component={ProductDesign} />
      <Route path={"/annualized"} component={AnnualizedChain} />
      <Route path={"/iv-smile"} component={IVSmile} />
      <Route path={"/stock-risk"} component={StockRisk} />
      {/* 脉动网 SSO 单点登录入口 */}
      <Route path={"/sso"} component={SsoLogin} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
