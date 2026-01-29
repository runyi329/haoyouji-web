import { useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check } from "lucide-react";

// 皮肤模板定义
interface ThemeTemplate {
  id: string;
  name: string;
  description: string;
  colors: {
    primary: string;        // 主色
    secondary: string;      // 辅助色
    background: string;     // 背景色
    surface: string;        // 卡片/容器背景
    textPrimary: string;    // 主要文字
    textSecondary: string;  // 次要文字
  };
  colorLabels: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    textPrimary: string;
    textSecondary: string;
  };
}

// 预设皮肤模板
const themeTemplates: ThemeTemplate[] = [
  {
    id: "coral-sky",
    name: "珊瑚天空",
    description: "温暖活力的珊瑚橙搭配清新天蓝",
    colors: {
      primary: "#FA734F",
      secondary: "#95DAE7",
      background: "#FFFFFF",
      surface: "#F6F3E8",
      textPrimary: "#7C645E",
      textSecondary: "#797979",
    },
    colorLabels: {
      primary: "珊瑚橙 - 主按钮/强调",
      secondary: "天蓝色 - 次要按钮/信息",
      background: "纯白 - 页面背景",
      surface: "米白 - 卡片背景",
      textPrimary: "深棕灰 - 主要文字",
      textSecondary: "中灰 - 次要文字",
    },
  },
  // 可以添加更多模板
];

export default function ThemeSettings() {
  const [, setLocation] = useLocation();
  const [selectedTheme, setSelectedTheme] = useState<string>("coral-sky");
  const [appliedTheme, setAppliedTheme] = useState<string>("coral-sky");

  const handleApplyTheme = (themeId: string) => {
    setAppliedTheme(themeId);
    // TODO: 保存到localStorage或后端
    localStorage.setItem("theme", themeId);
    alert("皮肤已应用！刷新页面后生效");
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 头部 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center gap-3 p-4">
          <button
            onClick={() => setLocation("/parent/profile")}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">高级皮肤</h1>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* 说明 */}
        <Card className="p-4 bg-blue-50 border-blue-200">
          <p className="text-sm text-blue-900">
            选择您喜欢的配色方案，点击"应用"按钮后刷新页面即可生效
          </p>
        </Card>

        {/* 皮肤模板列表 */}
        {themeTemplates.map((template) => (
          <Card
            key={template.id}
            className={`overflow-hidden ${
              selectedTheme === template.id ? "ring-2 ring-indigo-500" : ""
            }`}
          >
            {/* 模板信息 */}
            <div className="p-4 border-b">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{template.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {template.description}
                  </p>
                </div>
                {appliedTheme === template.id && (
                  <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                    <Check className="w-3 h-3" />
                    已应用
                  </span>
                )}
              </div>
            </div>

            {/* 色板展示 */}
            <div className="p-4 bg-gray-50">
              <h4 className="text-sm font-medium mb-3">配色方案</h4>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(template.colors).map(([key, color]) => (
                  <button
                    key={key}
                    className="group relative"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(color);
                      alert(`已复制颜色代码: ${color}`);
                    }}
                  >
                    <div
                      className="w-12 h-12 rounded-lg border-2 border-white shadow-sm hover:scale-110 transition-transform cursor-pointer"
                      style={{ backgroundColor: color }}
                    />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                      {color}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">点击色块复制颜色代码</p>
            </div>

            {/* 预览效果 */}
            <div className="p-4 border-t">
              <h4 className="text-sm font-medium mb-3">预览效果</h4>
              <div
                className="p-4 rounded-lg"
                style={{ backgroundColor: template.colors.background }}
              >
                {/* 卡片示例 */}
                <div
                  className="p-4 rounded-lg mb-3"
                  style={{ backgroundColor: template.colors.surface }}
                >
                  <h5
                    className="font-medium mb-2"
                    style={{ color: template.colors.textPrimary }}
                  >
                    示例卡片标题
                  </h5>
                  <p
                    className="text-sm"
                    style={{ color: template.colors.textSecondary }}
                  >
                    这是卡片内容的示例文字
                  </p>
                </div>

                {/* 按钮示例 */}
                <div className="flex gap-2">
                  <button
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                    style={{ backgroundColor: template.colors.primary }}
                  >
                    主要按钮
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg text-sm font-medium"
                    style={{
                      backgroundColor: template.colors.secondary,
                      color: template.colors.textPrimary,
                    }}
                  >
                    次要按钮
                  </button>
                </div>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="p-4 border-t bg-white">
              <Button
                className="w-full"
                onClick={() => handleApplyTheme(template.id)}
                disabled={appliedTheme === template.id}
              >
                {appliedTheme === template.id ? "已应用此皮肤" : "应用此皮肤"}
              </Button>
            </div>
          </Card>
        ))}

        {/* 更多皮肤提示 */}
        <Card className="p-4 text-center">
          <p className="text-sm text-gray-500">更多精美皮肤即将上线...</p>
        </Card>
      </div>
    </div>
  );
}
