import Home from "./Home";

/**
 * HomeEntry - 首页入口路由组件
 * / 路由永远渲染人脉首页
 * liulifan 打开网站时的初始跳转由 App.tsx 的 Router 组件处理（仅首次加载触发）
 */
export default function HomeEntry() {
  return <Home />;
}
