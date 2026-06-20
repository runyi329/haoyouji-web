import React, { createContext, useContext, useEffect, useState } from 'react';

// 主题颜色定义
export interface ThemeColors {
  primary: string;      // 主色
  secondary: string;    // 辅色
  background: string;   // 背景色
  text: string;         // 文字色
  accent1: string;      // 强调色1
  accent2: string;      // 强调色2
}

// 预设主题
export interface ThemeTemplate {
  id: string;
  name: string;
  colors: ThemeColors;
}

// 预设主题列表
export const themeTemplates: ThemeTemplate[] = [
  {
    id: 'basic',
    name: '基础配色',
    colors: {
      primary: '#A80000',     // 深红色
      secondary: '#dd4444',   // 中红色
      background: '#F9FAFB',  // 浅灰背景
      text: '#1F2937',        // 深灰文字
      accent1: '#FFFFFF',     // 白色
      accent2: '#d4a0a0',     // 浅红灰
    },
  },
  {
    id: 'version-1',
    name: 'Google',
    colors: {
      primary: '#4285F4',     // Google 蓝
      secondary: '#EA4335',   // Google 红
      background: '#FFFFFF',  // 白色背景
      text: '#202124',        // Google 黑色文字
      accent1: '#FBBC04',     // Google 黄
      accent2: '#34A853',     // Google 绿
    },
  },
  {
    id: 'wechat',
    name: '微信风格',
    colors: {
      primary: '#07C160',     // 微信绿
      secondary: '#10AD61',   // 深微信绿
      background: '#EDEDED',  // 微信灰背景
      text: '#000000',        // 黑色文字
      accent1: '#FFFFFF',     // 白色
      accent2: '#576B95',     // 微信蓝
    },
  },
  {
    id: 'alipay',
    name: '支付宝风格',
    colors: {
      primary: '#1677FF',     // 支付宝蓝
      secondary: '#108EE9',   // 深支付宝蓝
      background: '#F5F5F5',  // 浅灰背景
      text: '#333333',        // 深灰文字
      accent1: '#FFFFFF',     // 白色
      accent2: '#52C41A',     // 支付宝绿
    },
  },
  {
    id: 'pinduoduo',
    name: '拼多多风格',
    colors: {
      primary: '#E02E24',     // 拼多多红
      secondary: '#FF6146',   // 浅拼多多红
      background: '#FFFFFF',  // 白色背景
      text: '#1A1A1A',        // 深灰文字
      accent1: '#FFFFFF',     // 白色
      accent2: '#FF9C00',     // 拼多多橙
    },
  },
  {
    id: 'taobao',
    name: '淘宝风格',
    colors: {
      primary: '#FF6A00',     // 淘宝橙
      secondary: '#FF8533',   // 浅淘宝橙
      background: '#F5F5F5',  // 浅灰背景
      text: '#333333',        // 深灰文字
      accent1: '#FFFFFF',     // 白色
      accent2: '#FF4400',     // 深淘宝橙
    },
  },
];

interface ColorThemeContextType {
  currentTheme: ThemeTemplate;
  setTheme: (themeId: string) => void;
  customColors: ThemeColors | null;
  setCustomColors: (colors: ThemeColors) => void;
}

const ColorThemeContext = createContext<ColorThemeContextType | undefined>(undefined);

export const useColorTheme = () => {
  const context = useContext(ColorThemeContext);
  if (!context) {
    throw new Error('useColorTheme must be used within a ColorThemeProvider');
  }
  return context;
};

// 同步读取 localStorage 中缓存的初始主题（避免刷新时闪现默认红色）
function getInitialTheme(): ThemeTemplate {
  try {
    const savedCustomColors = localStorage.getItem('customColors');
    if (savedCustomColors) return themeTemplates[0]; // 自定义颜色，先用默认占位，applyTheme 会立即覆盖
    const savedThemeId = localStorage.getItem('colorThemeId');
    if (savedThemeId) {
      const found = themeTemplates.find(t => t.id === savedThemeId);
      if (found) return found;
    }
  } catch {}
  return themeTemplates[0];
}

function getInitialCustomColors(): ThemeColors | null {
  try {
    const saved = localStorage.getItem('customColors');
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
}

export const ColorThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState<ThemeTemplate>(getInitialTheme);
  const [customColors, setCustomColors] = useState<ThemeColors | null>(getInitialCustomColors);
  const [isLoaded, setIsLoaded] = useState(false);

  // 立即同步应用 localStorage 中的主题（在首次渲染前生效，消除闪烁）
  if (typeof window !== 'undefined' && !isLoaded) {
    try {
      const savedCustomColors = localStorage.getItem('customColors');
      const savedThemeId = localStorage.getItem('colorThemeId');
      const root = document.documentElement;
      const applyImmediate = (colors: ThemeColors) => {
        root.style.setProperty('--color-primary', colors.primary);
        root.style.setProperty('--color-secondary', colors.secondary);
        root.style.setProperty('--color-background', colors.background);
        root.style.setProperty('--color-text', colors.text);
        root.style.setProperty('--color-accent1', colors.accent1);
        root.style.setProperty('--color-accent2', colors.accent2);
        root.style.setProperty('--primary', colors.primary);
        root.style.setProperty('--primary-foreground', colors.accent1);
        root.style.setProperty('--secondary', colors.secondary);
        root.style.setProperty('--secondary-foreground', colors.text);
        root.style.setProperty('--background', colors.background);
        root.style.setProperty('--foreground', colors.text);
      };
      if (savedCustomColors) {
        applyImmediate(JSON.parse(savedCustomColors));
      } else if (savedThemeId) {
        const t = themeTemplates.find(x => x.id === savedThemeId);
        if (t) applyImmediate(t.colors);
      }
    } catch {}
  }

  // 从云端加载主题设置
  useEffect(() => {
    const loadThemeFromServer = async () => {
      try {
        const response = await fetch('/api/trpc/userPreferences.getThemeSettings');
        if (response.ok) {
          const data = await response.json();
          const result = data.result?.data;
          
          if (result?.customColors) {
            setCustomColors(result.customColors);
            applyTheme(result.customColors);
          } else if (result?.colorThemeId) {
            const theme = themeTemplates.find(t => t.id === result.colorThemeId);
            if (theme) {
              setCurrentTheme(theme);
              applyTheme(theme.colors);
            }
          } else {
            // 默认主题
            applyTheme(currentTheme.colors);
          }
        } else {
          // 未登录或请求失败，使用localStorage
          const savedThemeId = localStorage.getItem('colorThemeId');
          const savedCustomColors = localStorage.getItem('customColors');

          if (savedCustomColors) {
            const colors = JSON.parse(savedCustomColors);
            setCustomColors(colors);
            applyTheme(colors);
          } else if (savedThemeId) {
            const theme = themeTemplates.find(t => t.id === savedThemeId);
            if (theme) {
              setCurrentTheme(theme);
              applyTheme(theme.colors);
            }
          } else {
            applyTheme(currentTheme.colors);
          }
        }
      } catch (error) {
        console.error('加载主题设置失败:', error);
        // 使用localStorage作为备用
        const savedThemeId = localStorage.getItem('colorThemeId');
        if (savedThemeId) {
          const theme = themeTemplates.find(t => t.id === savedThemeId);
          if (theme) {
            setCurrentTheme(theme);
            applyTheme(theme.colors);
          }
        }
      } finally {
        setIsLoaded(true);
      }
    };

    loadThemeFromServer();
  }, []);

  // 应用主题到 CSS 变量
  const applyTheme = (colors: ThemeColors) => {
    const root = document.documentElement;
    
    // 设置自定义主题变量
    root.style.setProperty('--color-primary', colors.primary);
    root.style.setProperty('--color-secondary', colors.secondary);
    root.style.setProperty('--color-background', colors.background);
    root.style.setProperty('--color-text', colors.text);
    root.style.setProperty('--color-accent1', colors.accent1);
    root.style.setProperty('--color-accent2', colors.accent2);
    
    // 将颜色映射到 shadcn/ui 变量，让整个应用使用主题颜色
    // 主色：用于按钮、链接等主要交互元素
    root.style.setProperty('--primary', colors.primary);
    root.style.setProperty('--primary-foreground', colors.accent1);
    
    // 辅色：用于次要按钮、标签等
    root.style.setProperty('--secondary', colors.secondary);
    root.style.setProperty('--secondary-foreground', colors.text);
    
    // 背景色
    root.style.setProperty('--background', colors.background);
    root.style.setProperty('--foreground', colors.text);
    
    // 卡片颜色 - 使用背景色混合少量主色
    root.style.setProperty('--card', `color-mix(in srgb, ${colors.background} 95%, ${colors.primary})`);
    root.style.setProperty('--card-foreground', colors.text);
    
    // 弹出框颜色
    root.style.setProperty('--popover', colors.accent1);
    root.style.setProperty('--popover-foreground', colors.text);
    
    // 强调色
    root.style.setProperty('--accent', colors.secondary);
    root.style.setProperty('--accent-foreground', colors.text);
    
    // 边框和输入框
    root.style.setProperty('--border', colors.accent2);
    root.style.setProperty('--input', colors.accent2);
    root.style.setProperty('--ring', colors.primary);
  };

  const setTheme = async (themeId: string) => {
    const theme = themeTemplates.find(t => t.id === themeId);
    if (theme) {
      setCurrentTheme(theme);
      setCustomColors(null);
      localStorage.setItem('colorThemeId', themeId);
      localStorage.removeItem('customColors');
      applyTheme(theme.colors);
      
      // 同步到云端
      try {
        await fetch('/api/trpc/userPreferences.saveThemeSettings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            colorThemeId: themeId,
            customColors: null,
          }),
        });
      } catch (error) {
        console.error('保存主题设置到云端失败:', error);
      }
    }
  };

  const handleSetCustomColors = async (colors: ThemeColors) => {
    setCustomColors(colors);
    localStorage.setItem('customColors', JSON.stringify(colors));
    localStorage.removeItem('colorThemeId');
    applyTheme(colors);
    
    // 同步到云端
    try {
      await fetch('/api/trpc/userPreferences.saveThemeSettings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          colorThemeId: null,
          customColors: colors,
        }),
      });
    } catch (error) {
      console.error('保存自定义主题到云端失败:', error);
    }
  };

  return (
    <ColorThemeContext.Provider
      value={{
        currentTheme,
        setTheme,
        customColors,
        setCustomColors: handleSetCustomColors,
      }}
    >
      {children}
    </ColorThemeContext.Provider>
  );
};
