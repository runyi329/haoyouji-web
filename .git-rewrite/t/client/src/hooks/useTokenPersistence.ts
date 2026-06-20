import { useEffect, useRef } from 'react';

/**
 * Token持久化Hook
 * 确保在微信环境下即使Cookie失效，也能通过localStorage中的token保持登录状态
 */
export function useTokenPersistence() {
  const hasChecked = useRef(false);

  useEffect(() => {
    // 只在首次加载时检查一次
    if (hasChecked.current) return;
    hasChecked.current = true;

    const token = localStorage.getItem('auth-token');
    
    if (token) {
      console.log('[TokenPersistence] Found token in localStorage, will use it for authentication');
      
      // 检测是否是微信环境
      const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
      if (isWeChat) {
        console.log('[TokenPersistence] WeChat environment detected');
        
        // 微信环境下，尝试将token同步到Cookie（如果Cookie支持的话）
        try {
          // 设置一个标记，表示我们有localStorage备份
          document.cookie = `has-token-backup=true; path=/; max-age=${365 * 24 * 60 * 60}; SameSite=Lax`;
          console.log('[TokenPersistence] Set backup flag cookie');
        } catch (e) {
          console.warn('[TokenPersistence] Failed to set backup flag cookie:', e);
        }
      }
    } else {
      console.log('[TokenPersistence] No token found in localStorage');
    }
  }, []);
}
