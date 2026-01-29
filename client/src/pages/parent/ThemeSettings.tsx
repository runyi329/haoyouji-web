import { useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check } from "lucide-react";
import { useColorTheme, themeTemplates } from "@/contexts/ColorThemeContext";
import { toast } from "sonner";

export default function ThemeSettings() {
  const [, setLocation] = useLocation();
  const { currentTheme, setTheme, customColors } = useColorTheme();

  const handleApplyTheme = (themeId: string) => {
    setTheme(themeId);
    toast.success("皮肤已应用！");
  };

  const isThemeApplied = (themeId: string) => {
    return currentTheme.id === themeId && !customColors;
  };

  const handleCopyColor = (color: string) => {
    navigator.clipboard.writeText(color);
    toast.success(`已复制颜色代码: ${color}`);
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
            选择您喜欢的配色方案，点击"应用"按钮即可实时切换皮肤
          </p>
        </Card>

        {/* 皮肤模板列表 */}
        {themeTemplates.map((template) => (
          <Card
            key={template.id}
            className={`overflow-hidden ${
              isThemeApplied(template.id) ? "ring-2 ring-indigo-500" : ""
            }`}
          >
            {/* 模板信息 */}
            <div className="p-4 border-b">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{template.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    6色配色方案，适用于全局界面
                  </p>
                </div>
                {isThemeApplied(template.id) && (
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
              <div className="flex gap-2 justify-center">
                <button
                  className="group relative"
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.success(`主色: ${template.colors.primary}`);
                    handleCopyColor(template.colors.primary);
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-lg border-2 border-white shadow-sm hover:scale-110 transition-transform cursor-pointer"
                    style={{ backgroundColor: template.colors.primary }}
                  />
                </button>
                <button
                  className="group relative"
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.success(`辅色: ${template.colors.secondary}`);
                    handleCopyColor(template.colors.secondary);
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-lg border-2 border-white shadow-sm hover:scale-110 transition-transform cursor-pointer"
                    style={{ backgroundColor: template.colors.secondary }}
                  />
                </button>
                <button
                  className="group relative"
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.success(`背景色: ${template.colors.background}`);
                    handleCopyColor(template.colors.background);
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-lg border-2 border-white shadow-sm hover:scale-110 transition-transform cursor-pointer"
                    style={{ backgroundColor: template.colors.background }}
                  />
                </button>
                <button
                  className="group relative"
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.success(`文字色: ${template.colors.text}`);
                    handleCopyColor(template.colors.text);
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-lg border-2 border-white shadow-sm hover:scale-110 transition-transform cursor-pointer"
                    style={{ backgroundColor: template.colors.text }}
                  />
                </button>
                <button
                  className="group relative"
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.success(`强调色1: ${template.colors.accent1}`);
                    handleCopyColor(template.colors.accent1);
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-lg border-2 border-white shadow-sm hover:scale-110 transition-transform cursor-pointer"
                    style={{ backgroundColor: template.colors.accent1 }}
                  />
                </button>
                <button
                  className="group relative"
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.success(`强调色2: ${template.colors.accent2}`);
                    handleCopyColor(template.colors.accent2);
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-lg border-2 border-white shadow-sm hover:scale-110 transition-transform cursor-pointer"
                    style={{ backgroundColor: template.colors.accent2 }}
                  />
                </button>
                <button
                  className="group relative"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleApplyTheme(template.id);
                  }}
                  disabled={isThemeApplied(template.id)}
                >
                  <div
                    className={`w-10 h-10 rounded-lg border-2 shadow-sm transition-all cursor-pointer flex items-center justify-center ${
                      isThemeApplied(template.id)
                        ? 'border-green-500 bg-green-50'
                        : 'border-white hover:scale-110 bg-blue-500'
                    }`}
                  >
                    <span className={`text-[8px] font-bold leading-tight text-center ${
                      isThemeApplied(template.id) ? 'text-green-600' : 'text-white'
                    }`}>
                      {isThemeApplied(template.id) ? '已应用' : '点击应用'}
                    </span>
                  </div>
                </button>
              </div>
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
