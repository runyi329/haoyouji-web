/**
 * MibanApp - 米伴子项目入口组件
 * 挂载于 /p/proj_hzxm2t 路由下
 * 复用 haoyouji-web 的 wouter Router 上下文
 */
import { Route, Switch, useLocation } from "wouter";
import { lazy, Suspense, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { prepareMibanPersonalQueries } from "@/lib/miban-wallet-query-scope";
import NavBar from "./NavBar";
import { LimitedProductCartProvider } from "./LimitedProductCart";

// Public product pages do not download admin/editor and unrelated detail pages.
const Home = lazy(() => import("./Home"));
const RiceEncyclopedia = lazy(() => import("./RiceEncyclopedia"));
const RiceDetail = lazy(() => import("./RiceDetail"));
const DiyWorkshop = lazy(() => import("./DiyWorkshop"));
const LimitedSale = lazy(() => import("./LimitedSale"));
const AiHealth = lazy(() => import("./AiHealth"));
const PresetRecipes = lazy(() => import("./PresetRecipes"));
const MyRecipes = lazy(() => import("./MyRecipes"));
const MyOrders = lazy(() => import("./MyOrders"));
const UnifiedAdmin = lazy(() => import("./UnifiedAdmin"));
const MibanWallet = lazy(() => import("./MibanWallet"));
const JoinPage = lazy(() => import("./JoinPage"));
const BrandAssets = lazy(() => import("./BrandAssets"));
const TianguiPearDetail = lazy(() => import("./TianguiPearDetail"));
const ReviewPage = lazy(() => import("./ReviewPage"));
const HerbalifeRedGinsengDetail = lazy(() => import("./HerbalifeRedGinsengDetail"));
const LimitedBrandProducts = lazy(() => import("./LimitedBrandProducts"));
const SeasonalFruitSelection = lazy(() => import("./SeasonalFruitSelection"));
const MidaniangSelection = lazy(() => import("./MidaniangSelection"));
const MidaniangSelectionDetail = lazy(() => import("./MidaniangSelectionDetail"));

const BASE = "/p/proj_hzxm2t";

export default function MibanApp() {
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();
  const fetchCurrentUser = useRef(() => utils.auth.me.fetch(undefined, { staleTime: 0, retry: false }));
  const [ready, setReady] = useState(false);
  const [identityError, setIdentityError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useLayoutEffect(() => {
    let mounted = true;
    setReady(false);
    setIdentityError(false);
    void prepareMibanPersonalQueries(queryClient, fetchCurrentUser.current)
      .then(() => { if (mounted) setReady(true); })
      .catch(() => { if (mounted) setIdentityError(true); });
    return () => { mounted = false; };
  }, [queryClient, retryCount]);

  if (!ready) return <div className="flex min-h-screen items-center justify-center bg-[#F8F6F3] px-6 text-center">
    <div className="text-sm text-gray-500">
      <p>{identityError ? "本人账户读取失败，请重试" : "正在读取本人账户…"}</p>
      {identityError && <button type="button" className="mt-3 rounded-lg bg-[#FF6900] px-4 py-2 text-white" onClick={() => setRetryCount(value => value + 1)}>重新加载</button>}
    </div>
  </div>;

  // 钱包复用原钱包独立页面：避免重复导航挤压账户与流水的原有布局。
  if (location === `${BASE}/wallet`) return <Suspense fallback={<MibanPageLoading />}><MibanWallet /></Suspense>;

  return (
    <LimitedProductCartProvider>
      <div className="min-h-screen bg-[#F8F6F3]">
        <NavBar />
        {/* 顶部 NavBar 占位 52px，底部 Tab 占位 64px */}
        <div style={{ paddingTop: "52px", paddingBottom: "64px" }}>
          <Suspense fallback={<MibanPageLoading />}><Switch>
            <Route
              path={`${BASE}/pear/tiangui`}
              component={TianguiPearDetail}
            />
            <Route
              path={`${BASE}/limited/midaniang/:selectionKey`}
              component={MidaniangSelectionDetail}
            />
            <Route
              path={`${BASE}/limited/:productKey/buy`}
              component={HerbalifeRedGinsengDetail}
            />
            <Route
              path={`${BASE}/limited/herbalife-red-ginseng`}
              component={HerbalifeRedGinsengDetail}
            />
            <Route
              path={`${BASE}/limited/herbalife`}
              component={LimitedBrandProducts}
            />
            <Route
              path={`${BASE}/limited/tuoquetang`}
              component={LimitedBrandProducts}
            />
            <Route
              path={`${BASE}/limited/lingchuang`}
              component={LimitedBrandProducts}
            />
            <Route
              path={`${BASE}/limited/fruits`}
              component={SeasonalFruitSelection}
            />
            <Route
              path={`${BASE}/limited/midaniang`}
              component={MidaniangSelection}
            />
            <Route
              path={`${BASE}/limited/:productKey`}
              component={HerbalifeRedGinsengDetail}
            />
            <Route path={`${BASE}/review`} component={ReviewPage} />
            <Route path={`${BASE}/rice/:id`} component={RiceDetail} />
            <Route path={`${BASE}/rice`} component={RiceEncyclopedia} />
            <Route path={`${BASE}/encyclopedia`} component={RiceEncyclopedia} />
            <Route path={`${BASE}/limited`} component={LimitedSale} />
            <Route path={`${BASE}/diy`} component={DiyWorkshop} />
            <Route path={`${BASE}/ai-health`} component={AiHealth} />
            <Route path={`${BASE}/presets`} component={PresetRecipes} />
            <Route path={`${BASE}/my-recipes`} component={MyRecipes} />
            <Route path={`${BASE}/my-orders`} component={MyOrders} />
            <Route path={`${BASE}/wallet`} component={MibanWallet} />
            <Route path={`${BASE}/admin/panel`} component={UnifiedAdmin} />
            <Route path={`${BASE}/admin`} component={UnifiedAdmin} />
            <Route path={`${BASE}/agent`} component={UnifiedAdmin} />
            <Route path={`${BASE}/join`} component={JoinPage} />
            <Route path={`${BASE}/brand`} component={BrandAssets} />
            <Route path={`${BASE}`} component={Home} />
            <Route path={`${BASE}/`} component={Home} />
            {/* 默认回首页 */}
            <Route component={Home} />
          </Switch></Suspense>
        </div>
      </div>
    </LimitedProductCartProvider>
  );
}

function MibanPageLoading() {
  return <div role="status" className="flex min-h-[240px] items-center justify-center text-sm text-gray-400">页面加载中…</div>;
}
