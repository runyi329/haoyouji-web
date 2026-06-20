import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * PWA 安装管理 Hook
 * 监听浏览器的安装提示事件，提供手动触发安装的方法
 */
export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // 检查是否已经安装（通过 display-mode 检测）
    const checkIfInstalled = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isIOSStandalone = (window.navigator as any).standalone === true;
      setIsInstalled(isStandalone || isIOSStandalone);
    };

    checkIfInstalled();

    // 监听 beforeinstallprompt 事件
    const handleBeforeInstallPrompt = (e: Event) => {
      // 阻止默认的安装提示
      e.preventDefault();
      // 保存事件，稍后手动触发
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    // 监听 appinstalled 事件
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  /**
   * 手动触发 PWA 安装提示
   * @returns Promise<boolean> 是否成功触发安装提示
   */
  const promptInstall = async (): Promise<boolean> => {
    if (!deferredPrompt) {
      return false;
    }

    try {
      // 显示安装提示
      await deferredPrompt.prompt();
      
      // 等待用户响应
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('用户接受了安装提示');
      } else {
        console.log('用户拒绝了安装提示');
      }

      // 清除保存的提示（只能使用一次）
      setDeferredPrompt(null);
      setIsInstallable(false);

      return outcome === 'accepted';
    } catch (error) {
      console.error('触发安装提示失败:', error);
      return false;
    }
  };

  /**
   * 检测是否为 iOS 设备
   */
  const isIOS = () => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(userAgent);
  };

  /**
   * 检测是否为 iOS Safari 浏览器
   */
  const isIOSSafari = () => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isSafari = /safari/.test(userAgent) && !/chrome|crios|fxios/.test(userAgent);
    return isIOS && isSafari;
  };

  return {
    /**
     * 是否可以安装（Android/桌面 Chrome 支持）
     */
    isInstallable,
    /**
     * 是否已经安装
     */
    isInstalled,
    /**
     * 是否为 iOS 设备
     */
    isIOS: isIOS(),
    /**
     * 是否为 iOS Safari（需要手动引导安装）
     */
    isIOSSafari: isIOSSafari(),
    /**
     * 手动触发安装提示
     */
    promptInstall,
  };
}
