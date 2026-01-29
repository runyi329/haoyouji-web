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
      primary: '#9333EA',     // 紫色
      secondary: '#A78BFA',   // 浅紫色
      background: '#FDFCFE',  // 浅紫背景
      text: '#3F3852',        // 深紫文字
      accent1: '#FFFFFF',     // 白色
      accent2: '#8B7FA0',     // 灰紫色
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
  // 可以添加更多预设主题
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

export const ColorThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState<ThemeTemplate>(themeTemplates[0]);
  const [customColors, setCustomColors] = useState<ThemeColors | null>(null);

  // 从 localStorage 加载主题
  useEffect(() => {
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
      // 默认主题
      applyTheme(currentTheme.colors);
    }
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

  const setTheme = (themeId: string) => {
    const theme = themeTemplates.find(t => t.id === themeId);
    if (theme) {
      setCurrentTheme(theme);
      setCustomColors(null);
      localStorage.setItem('colorThemeId', themeId);
      localStorage.removeItem('customColors');
      applyTheme(theme.colors);
    }
  };

  const handleSetCustomColors = (colors: ThemeColors) => {
    setCustomColors(colors);
    localStorage.setItem('customColors', JSON.stringify(colors));
    localStorage.removeItem('colorThemeId');
    applyTheme(colors);
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
