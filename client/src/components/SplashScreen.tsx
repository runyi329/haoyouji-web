/**
 * 通用开机画面组件
 * 规范：§10.2 所有商家主页统一使用此组件展示开机动画
 *
 * 使用方式：
 *   <SplashScreen
 *     imageUrl="https://cdn.example.com/splash.webp"
 *     duration={2500}
 *     onFinish={() => setShowSplash(false)}
 *   />
 *
 * 行为：
 *   - 全屏显示开机图片，停留 duration 毫秒（默认 2500ms）
 *   - 淡出动画 500ms
 *   - 动画结束后调用 onFinish 回调
 *   - 使用 sessionStorage 标记，每次会话只显示一次
 */
import { useEffect, useState } from "react";

interface SplashScreenProps {
  /** 开机画面图片 URL */
  imageUrl: string;
  /** 停留时长（毫秒），默认 2500ms */
  duration?: number;
  /** 动画结束后的回调 */
  onFinish: () => void;
  /** sessionStorage 标记 key，用于控制每次会话只显示一次 */
  storageKey?: string;
}

export default function SplashScreen({
  imageUrl,
  duration = 2500,
  onFinish,
  storageKey,
}: SplashScreenProps) {
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // 停留 duration 后开始淡出
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, duration);

    // 淡出动画 500ms 后完全隐藏并调用 onFinish
    const hideTimer = setTimeout(() => {
      setVisible(false);
      if (storageKey) {
        sessionStorage.setItem(storageKey, '1');
      }
      onFinish();
    }, duration + 500);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [duration, onFinish, storageKey]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        backgroundColor: '#000',
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 0.5s ease-in-out',
        pointerEvents: fadeOut ? 'none' : 'auto',
      }}
      onClick={() => {
        // 点击可跳过
        setFadeOut(true);
        setTimeout(() => {
          setVisible(false);
          if (storageKey) sessionStorage.setItem(storageKey, '1');
          onFinish();
        }, 500);
      }}
    >
      <img
        src={imageUrl}
        alt="开机画面"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
      {/* 点击跳过提示 */}
      <div
        className="absolute bottom-8 right-4 text-white/50 text-xs px-3 py-1 rounded-full"
        style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
      >
        点击跳过
      </div>
    </div>
  );
}
