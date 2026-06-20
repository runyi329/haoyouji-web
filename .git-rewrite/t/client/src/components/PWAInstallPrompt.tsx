import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Download } from 'lucide-react';

/**
 * PWA 安装提示组件
 * 当检测到应用可以安装时，显示安装提示
 */
export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // 监听 beforeinstallprompt 事件
    const handleBeforeInstallPrompt = (e: Event) => {
      // 阻止默认的安装提示
      e.preventDefault();
      // 保存事件，稍后可以手动触发
      setDeferredPrompt(e);
      // 显示自定义安装提示
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 检查应用是否已经安装
    if (window.matchMedia('(display-mode: standalone)').matches) {
      // 应用已经安装，不显示提示
      setShowPrompt(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }

    // 显示安装提示
    deferredPrompt.prompt();

    // 等待用户响应
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] 用户选择: ${outcome}`);

    // 清除保存的事件
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // 保存用户的选择，7天内不再显示
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  // 检查是否在7天内被关闭过
  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - dismissedTime < sevenDays) {
        setShowPrompt(false);
      }
    }
  }, []);

  if (!showPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 animate-in slide-in-from-bottom-5">
      <div className="bg-gradient-to-r from-[#A80000] to-[#d44] text-white rounded-lg shadow-lg p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Download className="h-5 w-5" />
              <h3 className="font-semibold">安装"脉动"应用</h3>
            </div>
            <p className="text-sm text-white/90">
              安装到桌面，获得更好的使用体验
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="text-white/80 hover:text-white transition-colors"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            onClick={handleInstallClick}
            className="flex-1 bg-white text-[#A80000] hover:bg-white/90"
          >
            立即安装
          </Button>
          <Button
            onClick={handleDismiss}
            variant="ghost"
            className="text-white hover:bg-white/10"
          >
            稍后
          </Button>
        </div>
      </div>
    </div>
  );
}
