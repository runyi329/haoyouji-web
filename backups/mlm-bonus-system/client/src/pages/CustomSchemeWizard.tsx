import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Info,
  Plus,
  Trash2,
  BarChart2,
  GitBranch,
  Layers,
  Shield,
  Settings,
  Eye,
  Save,
  AlertCircle,
  TrendingUp,
  Users,
  Zap,
  ArrowLeft,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SchemeLevel {
  id: string;
  name: string;
  requiredDirectReferrals: number; // 晋级需直推人数
  personalSalesMin: number; // 个人业绩门槛（元/月）
  teamSalesMin: number; // 团队业绩门槛（元/月）
  retailMargin: number; // 零售差价 %
  directBonus: number; // 直推奖 %
  generationBonus: number[]; // 代数奖 % (按代数)
}

export interface SchemeConfig {
  // Step 1: 基础信息
  name: string;
  industry: string;
  schemeType: "staircase" | "generation" | "binary" | "matrix" | "subscription";
  description: string;
  // Step 2: 层级设计
  levels: SchemeLevel[];
  // Step 3: 奖金规则（全局）
  retailMarginBase: number; // 基础零售差价 %
  directBonusBase: number; // 基础直推奖 %
  generationDepth: number; // 代数奖深度
  // Step 4: 晋级条件
  qualificationPeriod: number; // 考核周期（月）
  maintainRequirement: boolean; // 是否需要维持条件
  // Step 5: 封顶规则
  totalPayoutCap: number; // 总拨出率上限 %
  monthlyIncomeCap: number; // 单人月收入封顶（元，0=无限制）
  antiAbuse: boolean; // 防刷机制
  // Step 6: 确认
  color: string; // 主题色
  icon: string; // 图标
}

const DEFAULT_LEVEL = (index: number): SchemeLevel => ({
  id: `level-${Date.now()}-${index}`,
  name: `${["普通会员", "银级会员", "金级会员", "白金会员", "钻石会员", "皇冠会员", "总裁级", "全球总裁"][index] || `${index + 1}级`}`,
  requiredDirectReferrals: [0, 1, 2, 3, 5, 8, 12, 20][index] || index * 2,
  personalSalesMin: [0, 500, 1000, 2000, 5000, 10000, 20000, 50000][index] || index * 2000,
  teamSalesMin: [0, 0, 2000, 8000, 20000, 60000, 150000, 400000][index] || index * 10000,
  retailMargin: 25,
  directBonus: [3, 6, 9, 12, 15, 18, 21, 25][index] || 10,
  generationBonus: [3, 2, 1],
});

const INITIAL_CONFIG: SchemeConfig = {
  name: "",
  industry: "",
  schemeType: "staircase",
  description: "",
  levels: [DEFAULT_LEVEL(0), DEFAULT_LEVEL(1), DEFAULT_LEVEL(2)],
  retailMarginBase: 25,
  directBonusBase: 10,
  generationDepth: 3,
  qualificationPeriod: 1,
  maintainRequirement: true,
  totalPayoutCap: 30,
  monthlyIncomeCap: 0,
  antiAbuse: true,
  color: "#3B82F6",
  icon: "S1",
};

const SCHEME_TYPES = [
  {
    id: "staircase",
    label: "阶梯级差制",
    desc: "按个人/团队业绩阶梯提成，经典传统，合规性强",
    icon: "ST",
    example: "安利、无限极",
    pros: ["合规性最强", "逻辑简单", "易于理解"],
    cons: ["激励深度有限", "高层级门槛高"],
  },
  {
    id: "generation",
    label: "代数制",
    desc: "按推荐关系代数发放奖金，激励深度强",
    icon: "GN",
    example: "玫琳凯、如新",
    pros: ["激励深度强", "团队粘性高", "多代收益"],
    cons: ["结构复杂", "计算成本高"],
  },
  {
    id: "binary",
    label: "双轨对碰制",
    desc: "左右两区对碰计算，结构简单但容易失衡",
    icon: "BN",
    example: "葆婴、USANA",
    pros: ["结构简单", "新人友好", "快速启动"],
    cons: ["容易失衡", "合规风险较高"],
  },
  {
    id: "matrix",
    label: "矩阵制",
    desc: "固定宽度矩阵，满员后溢出到下方",
    icon: "MX",
    example: "部分海外公司",
    pros: ["上限明确", "溢出激励"],
    cons: ["中国合规难度大", "依赖早期加入"],
  },
  {
    id: "subscription",
    label: "订阅制分润",
    desc: "SaaS/会员订阅费按比例逐层分润",
    icon: "SB",
    example: "数研金控",
    pros: ["持续现金流", "现代商业模式", "合规灵活"],
    cons: ["产品依赖强", "需要真实服务支撑"],
  },
];

const INDUSTRIES = [
  "营养保健品", "美容护肤", "金融科技", "教育培训",
  "家居用品", "医疗健康", "食品饮料", "服装配饰", "其他",
];

const COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#06B6D4", "#F97316",
];

const ICONS = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S0"];

// ─── Steps config ─────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "基础信息", icon: Settings, desc: "命名你的制度" },
  { id: 2, label: "层级设计", icon: Layers, desc: "设计会员层级" },
  { id: 3, label: "奖金规则", icon: BarChart2, desc: "配置奖金比例" },
  { id: 4, label: "晋级条件", icon: TrendingUp, desc: "设置晋级门槛" },
  { id: 5, label: "封顶规则", icon: Shield, desc: "合规性保障" },
  { id: 6, label: "预览确认", icon: Eye, desc: "确认并保存" },
];

// ─── Live Preview Panel ───────────────────────────────────────────────────────

function LivePreview({ config, currentStep }: { config: SchemeConfig; currentStep: number }) {
  const totalPayout = config.levels.reduce((sum, l) => {
    const gen = l.generationBonus.reduce((a, b) => a + b, 0);
    return sum + l.directBonus + gen;
  }, 0) / Math.max(config.levels.length, 1) + config.retailMarginBase;

  return (
    <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 sticky top-4">
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold"
          style={{ backgroundColor: config.color + "20", color: config.color }}
        >
          {config.icon}
        </div>
        <div>
          <div className="font-semibold text-sm text-gray-900">
            {config.name || "未命名制度"}
          </div>
          <div className="text-xs text-gray-400">
            {SCHEME_TYPES.find((t) => t.id === config.schemeType)?.label || "—"}
          </div>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>完成度</span>
          <span>{Math.round((currentStep / 6) * 100)}%</span>
        </div>
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${(currentStep / 6) * 100}%`, backgroundColor: config.color }}
          />
        </div>
      </div>

      {/* Key metrics */}
      <div className="space-y-2 mb-3">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">层级数量</span>
          <span className="font-medium text-gray-900">{config.levels.length} 级</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">零售差价</span>
          <span className="font-medium text-gray-900">{config.retailMarginBase}%</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">代数深度</span>
          <span className="font-medium text-gray-900">{config.generationDepth} 代</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">预估拨出率</span>
          <span
            className={`font-medium ${totalPayout > config.totalPayoutCap ? "text-red-500" : "text-green-600"}`}
          >
            ~{totalPayout.toFixed(1)}%
            {totalPayout > config.totalPayoutCap && " !超限"}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">合规上限</span>
          <span className="font-medium text-gray-900">{config.totalPayoutCap}%</span>
        </div>
      </div>

      {/* Level tree preview */}
      {config.levels.length > 0 && (
        <div className="border-t border-gray-200 pt-3">
          <div className="text-xs text-gray-400 mb-2">层级结构</div>
          <div className="space-y-1">
            {config.levels.map((level, i) => (
              <div key={level.id} className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white font-bold flex-shrink-0"
                  style={{ backgroundColor: config.color }}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-700 truncate">{level.name}</div>
                </div>
                <div className="text-[10px] text-gray-400">{level.directBonus}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compliance check */}
      <div className="border-t border-gray-200 pt-3 mt-3">
        <div className="text-xs text-gray-400 mb-2">合规检查</div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs">
            {totalPayout <= 30 ? (
              <Check className="w-3 h-3 text-green-500" />
            ) : (
              <AlertCircle className="w-3 h-3 text-red-500" />
            )}
            <span className={totalPayout <= 30 ? "text-green-600" : "text-red-500"}>
              拨出率 ≤30%（中国合规）
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            {config.levels.length <= 3 ? (
              <Check className="w-3 h-3 text-green-500" />
            ) : (
              <AlertCircle className="w-3 h-3 text-amber-500" />
            )}
            <span className={config.levels.length <= 3 ? "text-green-600" : "text-amber-600"}>
              层级 ≤3层（严格合规）
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            {config.antiAbuse ? (
              <Check className="w-3 h-3 text-green-500" />
            ) : (
              <AlertCircle className="w-3 h-3 text-amber-500" />
            )}
            <span className={config.antiAbuse ? "text-green-600" : "text-amber-600"}>
              防刷机制
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: 基础信息 ─────────────────────────────────────────────────────────

function Step1({ config, onChange }: { config: SchemeConfig; onChange: (c: Partial<SchemeConfig>) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">制度名称 <span className="text-red-500">*</span></label>
        <input
          type="text"
          value={config.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="例如：星辉直销奖金制度 2.0"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">适用行业</label>
        <div className="flex flex-wrap gap-2">
          {INDUSTRIES.map((ind) => (
            <button
              key={ind}
              onClick={() => onChange({ industry: ind })}
              className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                config.industry === ind
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
              }`}
            >
              {ind}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          选择制度类型 <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-1 gap-3">
          {SCHEME_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() => onChange({ schemeType: type.id as SchemeConfig["schemeType"] })}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                config.schemeType === type.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white hover:border-blue-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xs font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded-lg min-w-[2.5rem] text-center">{type.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm text-gray-900">{type.label}</span>
                    <span className="text-xs text-gray-400">参考：{type.example}</span>
                    {config.schemeType === type.id && (
                      <Check className="w-4 h-4 text-blue-500 ml-auto" />
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-2">{type.desc}</p>
                  <div className="flex gap-4">
                    <div>
                      <div className="text-[10px] text-green-600 font-medium mb-0.5">优势</div>
                      {type.pros.map((p) => (
                        <div key={p} className="text-[10px] text-gray-500">+ {p}</div>
                      ))}
                    </div>
                    <div>
                      <div className="text-[10px] text-red-500 font-medium mb-0.5">注意</div>
                      {type.cons.map((c) => (
                        <div key={c} className="text-[10px] text-gray-500">- {c}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">制度简介（可选）</label>
        <textarea
          value={config.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="简要描述这套制度的设计理念和目标..."
          rows={3}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>
    </div>
  );
}

// ─── Step 2: 层级设计 ─────────────────────────────────────────────────────────

function Step2({ config, onChange }: { config: SchemeConfig; onChange: (c: Partial<SchemeConfig>) => void }) {
  const addLevel = () => {
    const newLevel = DEFAULT_LEVEL(config.levels.length);
    onChange({ levels: [...config.levels, newLevel] });
  };

  const removeLevel = (id: string) => {
    if (config.levels.length <= 2) return;
    onChange({ levels: config.levels.filter((l) => l.id !== id) });
  };

  const updateLevel = (id: string, updates: Partial<SchemeLevel>) => {
    onChange({
      levels: config.levels.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">当前 <span className="font-semibold text-gray-900">{config.levels.length}</span> 个层级（建议2-8层，中国合规≤3层）</p>
        </div>
        <button
          onClick={addLevel}
          disabled={config.levels.length >= 10}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" />
          添加层级
        </button>
      </div>

      {config.levels.length > 3 && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>中国《直销管理条例》要求计酬层级不超过3层。超过3层可能面临合规风险，请根据实际运营地区调整。</span>
        </div>
      )}

      <div className="space-y-3">
        {config.levels.map((level, index) => (
          <div key={level.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                {index + 1}
              </div>
              <input
                type="text"
                value={level.name}
                onChange={(e) => updateLevel(level.id, { name: e.target.value })}
                className="flex-1 px-2 py-1 rounded-lg border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={() => removeLevel(level.id)}
                disabled={config.levels.length <= 2}
                className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">晋级需直推人数</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    value={level.requiredDirectReferrals}
                    onChange={(e) => updateLevel(level.id, { requiredDirectReferrals: Number(e.target.value) })}
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-400 whitespace-nowrap">人</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">直推奖比例</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={level.directBonus}
                    onChange={(e) => updateLevel(level.id, { directBonus: Number(e.target.value) })}
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-400">%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">个人月业绩门槛</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={level.personalSalesMin}
                    onChange={(e) => updateLevel(level.id, { personalSalesMin: Number(e.target.value) })}
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-400">元</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">团队月业绩门槛</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={level.teamSalesMin}
                    onChange={(e) => updateLevel(level.id, { teamSalesMin: Number(e.target.value) })}
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-400">元</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 3: 奖金规则 ─────────────────────────────────────────────────────────

function Step3({ config, onChange }: { config: SchemeConfig; onChange: (c: Partial<SchemeConfig>) => void }) {
  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
        <div className="flex items-center gap-1.5 font-semibold mb-1"><Info className="w-3.5 h-3.5" />奖金规则说明</div>
        <p>这里设置全局基础奖金比例。各层级的具体奖金在上一步"层级设计"中已单独配置，这里的设置作为默认值和全局参考。</p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          零售差价（基础）
          <span className="ml-2 text-xs font-normal text-gray-400">会员以折扣价购入，按建议零售价销售的差价</span>
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={10}
            max={50}
            step={1}
            value={config.retailMarginBase}
            onChange={(e) => onChange({ retailMarginBase: Number(e.target.value) })}
            className="flex-1"
          />
          <div className="w-16 px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-center font-semibold">
            {config.retailMarginBase}%
          </div>
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>10%（低）</span>
          <span className="text-amber-600">30%（中国合规参考）</span>
          <span>50%（高）</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          直推奖（基础）
          <span className="ml-2 text-xs font-normal text-gray-400">直接推荐人消费时获得的奖励</span>
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={30}
            step={0.5}
            value={config.directBonusBase}
            onChange={(e) => onChange({ directBonusBase: Number(e.target.value) })}
            className="flex-1"
          />
          <div className="w-16 px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-center font-semibold">
            {config.directBonusBase}%
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          代数奖深度
          <span className="ml-2 text-xs font-normal text-gray-400">向上追溯几代发放代数奖</span>
        </label>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 5, 7].map((depth) => (
            <button
              key={depth}
              onClick={() => onChange({ generationDepth: depth })}
              className={`py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                config.generationDepth === depth
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 text-gray-600 hover:border-blue-200"
              }`}
            >
              {depth}代
            </button>
          ))}
        </div>
        {config.generationDepth > 3 && (
          <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            超过3代在中国合规环境下需谨慎，建议仅用于海外市场研究
          </p>
        )}
      </div>

      {/* 各层级奖金汇总 */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">各层级直推奖汇总</label>
        <div className="space-y-2">
          {config.levels.map((level, i) => (
            <div key={level.id} className="flex items-center gap-3">
              <div className="w-20 text-xs text-gray-600 truncate">{level.name}</div>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${Math.min((level.directBonus / 30) * 100, 100)}%` }}
                />
              </div>
              <div className="w-10 text-xs font-medium text-right text-gray-700">{level.directBonus}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step 4: 晋级条件 ─────────────────────────────────────────────────────────

function Step4({ config, onChange }: { config: SchemeConfig; onChange: (c: Partial<SchemeConfig>) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">考核周期</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: 1, label: "月度考核", desc: "每月重新计算" },
            { v: 3, label: "季度考核", desc: "每季度计算" },
            { v: 12, label: "年度考核", desc: "每年计算" },
          ].map((opt) => (
            <button
              key={opt.v}
              onClick={() => onChange({ qualificationPeriod: opt.v })}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                config.qualificationPeriod === opt.v
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-blue-200"
              }`}
            >
              <div className="text-sm font-semibold text-gray-900">{opt.label}</div>
              <div className="text-xs text-gray-400">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">维持条件</label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { v: true, label: "需要维持", desc: "每个考核周期需满足最低业绩才能保持职级", icon: "" },
            { v: false, label: "永久保留", desc: "晋级后职级永久保留，无需维持业绩", icon: "" },
          ].map((opt) => (
            <button
              key={String(opt.v)}
              onClick={() => onChange({ maintainRequirement: opt.v })}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                config.maintainRequirement === opt.v
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-blue-200"
              }`}
            >
              <div className="text-sm font-semibold text-gray-900">{opt.label}</div>
              <div className="text-xs text-gray-400">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 层级晋级条件汇总表 */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">晋级条件汇总</label>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="text-left px-3 py-2 rounded-tl-lg">层级</th>
                <th className="text-right px-3 py-2">直推人数</th>
                <th className="text-right px-3 py-2">个人月业绩</th>
                <th className="text-right px-3 py-2 rounded-tr-lg">团队月业绩</th>
              </tr>
            </thead>
            <tbody>
              {config.levels.map((level, i) => (
                <tr key={level.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-3 py-2 font-medium text-gray-900">{level.name}</td>
                  <td className="px-3 py-2 text-right text-gray-600">
                    {level.requiredDirectReferrals > 0 ? `${level.requiredDirectReferrals}人` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">
                    {level.personalSalesMin > 0 ? `¥${level.personalSalesMin.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">
                    {level.teamSalesMin > 0 ? `¥${level.teamSalesMin.toLocaleString()}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Step 5: 封顶规则 ─────────────────────────────────────────────────────────

function Step5({ config, onChange }: { config: SchemeConfig; onChange: (c: Partial<SchemeConfig>) => void }) {
  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700">
        <div className="flex items-center gap-1.5 font-semibold mb-1"><Shield className="w-3.5 h-3.5" />合规性说明</div>
        <p>中国《直销管理条例》规定：直销企业支付给直销员的报酬（包括佣金、奖金、各种形式的奖励及其他经济利益等）占直销员直接推销产品所取得的销售收入的比例<strong>不得超过30%</strong>。</p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          总拨出率上限
          <span className="ml-2 text-xs font-normal text-gray-400">占销售收入的比例上限</span>
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={10}
            max={60}
            step={1}
            value={config.totalPayoutCap}
            onChange={(e) => onChange({ totalPayoutCap: Number(e.target.value) })}
            className="flex-1"
          />
          <div className={`w-16 px-2 py-1.5 rounded-lg border text-sm text-center font-semibold ${
            config.totalPayoutCap > 30 ? "border-red-300 bg-red-50 text-red-600" : "border-gray-200"
          }`}>
            {config.totalPayoutCap}%
          </div>
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>10%</span>
          <span className="text-green-600 font-medium">30%（中国合规线）</span>
          <span>60%</span>
        </div>
        {config.totalPayoutCap > 30 && (
          <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            超过30%在中国境内运营可能违规，仅适用于海外市场研究
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          单人月收入封顶
          <span className="ml-2 text-xs font-normal text-gray-400">0 = 不限制</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step={1000}
            value={config.monthlyIncomeCap}
            onChange={(e) => onChange({ monthlyIncomeCap: Number(e.target.value) })}
            className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-500">元/月</span>
        </div>
        {config.monthlyIncomeCap === 0 && (
          <p className="text-xs text-gray-400 mt-1">当前设置为不限制，顶级会员理论上可无限收益</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">防刷机制</label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { v: true, label: "启用防刷", desc: "检测异常消费行为，防止虚假业绩", icon: "" },
            { v: false, label: "不启用", desc: "不设置防刷机制（研究用途）", icon: "" },
          ].map((opt) => (
            <button
              key={String(opt.v)}
              onClick={() => onChange({ antiAbuse: opt.v })}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                config.antiAbuse === opt.v
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-blue-200"
              }`}
            >
              <div className="text-sm font-semibold text-gray-900">{opt.label}</div>
              <div className="text-xs text-gray-400">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step 6: 预览确认 ─────────────────────────────────────────────────────────

function Step6({
  config,
  onChange,
  onSave,
  isSaving,
}: {
  config: SchemeConfig;
  onChange: (c: Partial<SchemeConfig>) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const schemeType = SCHEME_TYPES.find((t) => t.id === config.schemeType);
  const totalPayout = config.levels.reduce((sum, l) => sum + l.directBonus, 0) / Math.max(config.levels.length, 1) + config.retailMarginBase;

  return (
    <div className="space-y-6">
      {/* 外观配置 */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">主题色</label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((color) => (
            <button
              key={color}
              onClick={() => onChange({ color })}
              className={`w-8 h-8 rounded-full transition-all ${
                config.color === color ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : "hover:scale-105"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">标识符号</label>
        <div className="flex gap-2 flex-wrap">
          {ICONS.map((icon) => (
            <button
              key={icon}
              onClick={() => onChange({ icon })}
              className={`w-10 h-10 rounded-xl text-xs font-bold flex items-center justify-center border-2 transition-all ${
                config.icon === icon ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 hover:border-blue-200 text-gray-500"
              }`}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* 制度摘要 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-xs font-bold"
            style={{ backgroundColor: config.color + "20", color: config.color }}
          >
            {config.icon}
          </div>
          <div>
            <div className="font-bold text-gray-900">{config.name || "未命名制度"}</div>
            <div className="text-sm text-gray-500">{config.industry} · {schemeType?.label}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">层级数量</div>
            <div className="font-semibold text-gray-900">{config.levels.length} 级</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">代数深度</div>
            <div className="font-semibold text-gray-900">{config.generationDepth} 代</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">零售差价</div>
            <div className="font-semibold text-gray-900">{config.retailMarginBase}%</div>
          </div>
          <div className={`rounded-lg p-3 ${totalPayout > config.totalPayoutCap ? "bg-red-50" : "bg-green-50"}`}>
            <div className="text-xs text-gray-400 mb-1">预估拨出率</div>
            <div className={`font-semibold ${totalPayout > config.totalPayoutCap ? "text-red-600" : "text-green-700"}`}>
              ~{totalPayout.toFixed(1)}% / 上限{config.totalPayoutCap}%
            </div>
          </div>
        </div>

        {config.description && (
          <p className="text-xs text-gray-500 mt-3 p-3 bg-gray-50 rounded-lg">{config.description}</p>
        )}
      </div>

      {/* 层级明细 */}
      <div>
        <div className="text-sm font-semibold text-gray-700 mb-3">层级明细</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="text-left px-3 py-2">层级</th>
                <th className="text-right px-3 py-2">直推奖</th>
                <th className="text-right px-3 py-2">个人门槛</th>
                <th className="text-right px-3 py-2">团队门槛</th>
              </tr>
            </thead>
            <tbody>
              {config.levels.map((level, i) => (
                <tr key={level.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-3 py-2 font-medium" style={{ color: config.color }}>{level.name}</td>
                  <td className="px-3 py-2 text-right">{level.directBonus}%</td>
                  <td className="px-3 py-2 text-right">{level.personalSalesMin > 0 ? `¥${level.personalSalesMin.toLocaleString()}` : "—"}</td>
                  <td className="px-3 py-2 text-right">{level.teamSalesMin > 0 ? `¥${level.teamSalesMin.toLocaleString()}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={onSave}
        disabled={!config.name || isSaving}
        className="w-full py-3.5 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: config.color }}
      >
        {isSaving ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            保存中...
          </>
        ) : (
          <>
            <Save className="w-4 h-4" />
            保存制度方案
          </>
        )}
      </button>
      {!config.name && (
        <p className="text-xs text-red-500 text-center -mt-3">请先在第1步填写制度名称</p>
      )}
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export default function CustomSchemeWizard() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [config, setConfig] = useState<SchemeConfig>(INITIAL_CONFIG);
  const [isSaving, setIsSaving] = useState(false);

  const updateConfig = useCallback((updates: Partial<SchemeConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const saveScheme = trpc.customScheme.create.useMutation({
    onSuccess: (data: { id: number; success: boolean }) => {
      toast.success("制度方案已保存！");
      setLocation("/custom/" + data.id);
    },
    onError: (err: { message: string }) => {
      toast.error("保存失败：" + err.message);
      setIsSaving(false);
    },
  });

  const handleSave = () => {
    if (!config.name) {
      toast.error("请先填写制度名称");
      setCurrentStep(1);
      return;
    }
    setIsSaving(true);
    saveScheme.mutate({
      name: config.name,
      industry: config.industry,
      schemeType: config.schemeType,
      description: config.description,
      config: JSON.stringify(config),
      color: config.color,
      icon: config.icon,
    });
  };

  const canGoNext = () => {
    if (currentStep === 1) return config.name.trim().length > 0 && config.schemeType.length > 0;
    if (currentStep === 2) return config.levels.length >= 2;
    return true;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => setLocation("/")}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <Settings className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-sm">自定义奖金制度向导</span>
          </div>
          <div className="ml-auto text-xs text-gray-400">
            步骤 {currentStep} / {STEPS.length}
          </div>
        </div>
      </header>

      {/* Step bar */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex overflow-x-auto scrollbar-hide">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const isDone = currentStep > step.id;
              const isCurrent = currentStep === step.id;
              return (
                <button
                  key={step.id}
                  onClick={() => isDone && setCurrentStep(step.id)}
                  className={`flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-all text-xs font-medium ${
                    isCurrent
                      ? "border-blue-600 text-blue-600"
                      : isDone
                      ? "border-transparent text-green-600 cursor-pointer hover:text-blue-600"
                      : "border-transparent text-gray-400 cursor-default"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isDone ? "bg-green-500" : isCurrent ? "bg-blue-600" : "bg-gray-200"
                  }`}>
                    {isDone ? (
                      <Check className="w-3 h-3 text-white" />
                    ) : (
                      <Icon className={`w-3 h-3 ${isCurrent ? "text-white" : "text-gray-400"}`} />
                    )}
                  </div>
                  <span className="hidden sm:block">{step.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="mb-5">
                <h2 className="text-lg font-bold text-gray-900">{STEPS[currentStep - 1].label}</h2>
                <p className="text-sm text-gray-500">{STEPS[currentStep - 1].desc}</p>
              </div>

              {currentStep === 1 && <Step1 config={config} onChange={updateConfig} />}
              {currentStep === 2 && <Step2 config={config} onChange={updateConfig} />}
              {currentStep === 3 && <Step3 config={config} onChange={updateConfig} />}
              {currentStep === 4 && <Step4 config={config} onChange={updateConfig} />}
              {currentStep === 5 && <Step5 config={config} onChange={updateConfig} />}
              {currentStep === 6 && (
                <Step6 config={config} onChange={updateConfig} onSave={handleSave} isSaving={isSaving} />
              )}

              {/* Navigation buttons */}
              {currentStep < 6 && (
                <div className="flex gap-3 mt-8 pt-5 border-t border-gray-100">
                  {currentStep > 1 && (
                    <button
                      onClick={() => setCurrentStep((s) => s - 1)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      上一步
                    </button>
                  )}
                  <button
                    onClick={() => setCurrentStep((s) => s + 1)}
                    disabled={!canGoNext()}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    下一步
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right: live preview */}
          <div className="hidden lg:block">
            <LivePreview config={config} currentStep={currentStep} />
          </div>
        </div>
      </div>
    </div>
  );
}
