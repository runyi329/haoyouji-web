import { useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import Home from "./Home";

/**
 * HomeEntry - 首页入口路由组件
 * liulifan 用户打开网站时自动跳转到奢贝首页
 * 其他用户正常显示人脉首页
 */
export default function HomeEntry() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = trpc.auth.me.useQuery();

  useEffect(() => {
    if (!isLoading && user?.username === 'liulifan') {
      setLocation('/beauty');
    }
  }, [user, isLoading, setLocation]);

  // liulifan 用户等待重定向时显示空白（避免闪烁）
  if (!isLoading && user?.username === 'liulifan') {
    return null;
  }

  // 其他用户正常渲染首页
  return <Home />;
}
