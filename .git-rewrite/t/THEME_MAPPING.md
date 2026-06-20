# 主题颜色智能映射方案

## 6个主题色定义

| 变量 | 用途 | 微信示例 | 支付宝示例 |
|------|------|----------|------------|
| primary | 主色-按钮、链接 | #07C160 绿 | #1677FF 蓝 |
| secondary | 辅色-次要元素 | #10AD61 深绿 | #108EE9 深蓝 |
| background | 背景色 | #EDEDED 灰 | #F5F5F5 浅灰 |
| text | 文字色 | #000000 黑 | #333333 深灰 |
| accent1 | 强调色1-卡片背景 | #FFFFFF 白 | #FFFFFF 白 |
| accent2 | 强调色2-边框/图标 | #576B95 蓝 | #52C41A 绿 |

## 智能映射规则

### 蓝色系列 (blue-*) → 主色系列
用于主要交互元素：按钮、链接、选中状态

| Tailwind类 | 映射到 | 用途 |
|------------|--------|------|
| blue-50 | primary 8% + accent1 | 浅色背景 |
| blue-100 | primary 15% + accent1 | 浅色背景 |
| blue-200 | primary 25% + accent1 | 浅色边框 |
| blue-500 | primary | 主按钮、链接 |
| blue-600 | secondary | 深色按钮、hover |
| blue-700 | secondary 混合 text | 深色文字 |

### 紫色系列 (purple-*) → 辅色系列
用于次要元素：标签、徽章、装饰

| Tailwind类 | 映射到 | 用途 |
|------------|--------|------|
| purple-50 | secondary 8% + accent1 | 浅色背景 |
| purple-100 | secondary 15% + accent1 | 浅色背景 |
| purple-500 | secondary | 次要按钮 |
| purple-600 | accent2 | 图标、边框 |

### 灰色系列 (gray-*) → 文字/背景系列
保持原有灰色，但可以混合主题色增加协调感

### 特殊映射
- `from-blue-*` 渐变起点 → primary 系列
- `to-purple-*` 渐变终点 → secondary 系列
- `ring-blue-*` 焦点环 → primary 系列

## CSS变量扩展

```css
:root {
  /* 基础6色 */
  --color-primary: #07C160;
  --color-secondary: #10AD61;
  --color-background: #EDEDED;
  --color-text: #000000;
  --color-accent1: #FFFFFF;
  --color-accent2: #576B95;
  
  /* 派生色 - 用于不同深浅 */
  --color-primary-light: color-mix(in srgb, var(--color-primary) 15%, var(--color-accent1));
  --color-primary-lighter: color-mix(in srgb, var(--color-primary) 8%, var(--color-accent1));
  --color-primary-dark: color-mix(in srgb, var(--color-primary) 85%, black);
  
  --color-secondary-light: color-mix(in srgb, var(--color-secondary) 15%, var(--color-accent1));
  --color-secondary-lighter: color-mix(in srgb, var(--color-secondary) 8%, var(--color-accent1));
  --color-secondary-dark: color-mix(in srgb, var(--color-secondary) 85%, black);
}
```

## 实现策略

1. **CSS层覆盖**：在 `@layer utilities` 中覆盖 Tailwind 的蓝色/紫色类
2. **智能分配**：
   - 浅色(50-200) → 使用 accent1(白色) 混合主色
   - 中等(300-500) → 使用 primary 或 secondary
   - 深色(600-900) → 使用 secondary 或混合 text
3. **保持层次**：确保浅色用于背景，深色用于文字，中等用于按钮
