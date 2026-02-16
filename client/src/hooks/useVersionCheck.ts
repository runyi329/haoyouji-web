import { useEffect, useRef } from 'react';

interface VersionInfo {
  version: string;
  shouldCheckVersion: boolean;
  forceUpdateUntil: string | null;
}

/**
 * 版本检测Hook
 * 在强制更新期内，每5分钟检测一次版本号
 * 如果版本号变化，自动刷新页面（用户无感知）
 */
export function useVersionCheck() {
  const currentVersionRef = useRef<string | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const response = await fetch('/api/version', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          return;
        }

        const data: VersionInfo = await response.json();

        // 如果不在强制更新期内，停止检测
        if (!data.shouldCheckVersion) {
          if (checkIntervalRef.current) {
            clearInterval(checkIntervalRef.current);
            checkIntervalRef.current = null;
          }
          return;
        }

        // 第一次获取版本号，记录下来
        if (currentVersionRef.current === null) {
          currentVersionRef.current = data.version;
          console.log('[VersionCheck] 初始版本:', data.version);
          return;
        }

        // 检测到版本号变化，自动刷新页面
        if (currentVersionRef.current !== data.version) {
          console.log('[VersionCheck] 检测到新版本，准备刷新页面', {
            old: currentVersionRef.current,
            new: data.version,
          });
          
          // 延迟1秒刷新，确保日志输出
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      } catch (error) {
        console.error('[VersionCheck] 版本检测失败:', error);
      }
    };

    // 立即执行一次检测
    checkVersion();

    // 每5分钟检测一次
    checkIntervalRef.current = setInterval(checkVersion, 5 * 60 * 1000);

    // 清理定时器
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, []);
}
