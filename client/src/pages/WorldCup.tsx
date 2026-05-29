import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function WorldCup() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div
        className="flex items-center px-4 py-3 text-white"
        style={{ background: "linear-gradient(135deg, #1a5c1a 0%, #2d8a2d 50%, #1a5c1a 100%)" }}
      >
        <button
          onClick={() => setLocation("/ledger/52")}
          className="w-8 h-8 flex items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 flex items-center justify-center gap-2">
          <img
            src="/wc2026-logo.png"
            alt="FIFA World Cup 2026"
            className="w-8 h-8 rounded-full object-cover"
          />
          <h1 className="text-base font-bold">FIFA World Cup 2026</h1>
        </div>
        <div className="w-8" />
      </div>

      {/* 内容区域（暂时空白） */}
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <img
          src="/wc2026-logo.png"
          alt="FIFA World Cup 2026"
          className="w-24 h-24 rounded-full object-cover mb-6 opacity-40"
        />
        <p className="text-sm">世界杯功能即将上线</p>
      </div>
    </div>
  );
}
