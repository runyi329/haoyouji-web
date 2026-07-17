/**
 * MibanApp - 米伴子项目入口组件
 * 挂载于 /p/proj_hzxm2t 路由下
 * 复用 haoyouji-web 的 wouter Router 上下文
 */
import { Route, Switch } from "wouter";
import NavBar from "./NavBar";
import Home from "./Home";
import RiceEncyclopedia from "./RiceEncyclopedia";
import RiceDetail from "./RiceDetail";
import DiyWorkshop from "./DiyWorkshop";
import AiHealth from "./AiHealth";
import PresetRecipes from "./PresetRecipes";
import MyRecipes from "./MyRecipes";
import MyOrders from "./MyOrders";
import AdminDashboard from "./AdminDashboard";
import AdminPanel from "./AdminPanel";
import AgentDashboard from "./AgentDashboard";
import JoinPage from "./JoinPage";
import BrandAssets from "./BrandAssets";

const BASE = "/p/proj_hzxm2t";

export default function MibanApp() {
  return (
    <div className="min-h-screen bg-[#F8F6F3]">
      <NavBar />
      {/* 顶部 NavBar 占位 52px，底部 Tab 占位 56px */}
      <div style={{ paddingTop: "52px", paddingBottom: "56px" }}>
        <Switch>
          <Route path={`${BASE}/rice/:id`} component={RiceDetail} />
          <Route path={`${BASE}/rice`} component={RiceEncyclopedia} />
          <Route path={`${BASE}/encyclopedia`} component={RiceEncyclopedia} />
          <Route path={`${BASE}/diy`} component={DiyWorkshop} />
          <Route path={`${BASE}/ai-health`} component={AiHealth} />
          <Route path={`${BASE}/presets`} component={PresetRecipes} />
          <Route path={`${BASE}/my-recipes`} component={MyRecipes} />
          <Route path={`${BASE}/my-orders`} component={MyOrders} />
          <Route path={`${BASE}/admin/panel`} component={AdminPanel} />
          <Route path={`${BASE}/admin`} component={AdminDashboard} />
          <Route path={`${BASE}/agent`} component={AgentDashboard} />
          <Route path={`${BASE}/join`} component={JoinPage} />
          <Route path={`${BASE}/brand`} component={BrandAssets} />
          <Route path={`${BASE}`} component={Home} />
          <Route path={`${BASE}/`} component={Home} />
          {/* 默认回首页 */}
          <Route component={Home} />
        </Switch>
      </div>
    </div>
  );
}
