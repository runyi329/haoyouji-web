import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { themeTemplates } from "@/contexts/ColorThemeContext";
import { toast } from "sonner";

export default function ThemeSettings() {
  const [, setLocation] = useLocation();
  const handleApplyTheme = (themeId: string) => {
    toast("需要更高权限");
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

      <div className="p-4 space-y-4">
        {/* 皮肤模板列表 */}
        {themeTemplates.map((template) => (
          <Card
            key={template.id}
            className="p-2"
          >
            {/* 色板展示 */}
            <div className="flex gap-1 items-center justify-center">
              {/* 配色名称按钮 */}
              <div
                className="w-16 h-10 rounded-lg border-2 shadow-sm flex items-center justify-center border-gray-300 bg-white"
              >
                <span className="text-[9px] font-bold leading-tight text-center whitespace-pre-line text-gray-700">
                  {template.name.replace(/(.{2})/, '$1\n')}
                </span>
              </div>
              
              {/* 6个颜色方块 */}
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
                >
                  <div
                    className="w-10 h-10 rounded-lg border-2 shadow-sm transition-all cursor-pointer flex items-center justify-center border-gray-300 hover:scale-110 bg-gray-400"
                  >
                    <span className="text-[8px] font-bold leading-[10px] text-center whitespace-pre-line text-white">
                      {'点击\n应用'}
                    </span>
                  </div>
                </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
