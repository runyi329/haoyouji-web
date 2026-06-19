import { useEffect } from "react";
import { useLocation } from "wouter";

// 牙伴 3D 开始页：以 iframe 承载独立打包的 3D 展示页（public/yaban-intro/index.html）
// 页面内"进入"按钮通过 postMessage 通知本组件跳转到牙伴首页 /yaban
export default function YabanIntro() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data;
      if (data && typeof data === "object" && data.type === "yaban-intro-enter") {
        try { sessionStorage.setItem("yaban_intro_entered", "1"); } catch {}
        // 用 replace 替换开始页历史项，使历史栈不残留 /yaban/intro，
        // 保证进入牙伴首页后点返回不会又回到开机画面
        setLocation("/yaban", { replace: true });
      }
      if (data && typeof data === "object" && data.type === "yaban-intro-back") {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          setLocation("/");
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [setLocation]);

  return (
    <div className="fixed inset-0 z-50 bg-[#4a9ad4]">
      <iframe
        src="/yaban-intro/index.html"
        title="牙伴"
        className="w-full h-full border-0 block"
        allow="autoplay; fullscreen"
      />
    </div>
  );
}
