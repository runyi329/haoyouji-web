import { useState, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import {
  ChevronLeft, Search, X, ChevronDown, ChevronUp,
  PlusCircle, Edit3, Trash2, FileText, Image,
  Users, UserPlus, Shield, Bell, CheckCircle,
  BarChart2, Calendar, TrendingUp, PieChart, Download, Upload,
  Coins, RefreshCw, HardDrive, Layers, Lock, SlidersHorizontal,
  Notebook, Receipt, Clock, Zap,
  PenLine, Filter, Eye, ArrowRight,
} from "lucide-react";

// ==================== 数据定义 ====================

interface Feature {
  id: string;
  name: string;
  desc: string;
  path: string;
  tags: string[];
  Icon: React.ComponentType<any>;
  isNew?: boolean;
  isHot?: boolean;
}

interface FeatureGroup {
  id: string;
  label: string;
  color: string;
  bgColor: string;
  Icon: React.ComponentType<any>;
  features: Feature[];
}

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: "basic",
    label: "记账基础",
    color: "#D32F2F",
    bgColor: "#FFF5F5",
    Icon: Receipt,
    features: [
      {
        id: "add",
        name: "添加账目",
        desc: "记录收入或支出，支持金额、分类、日期、备注",
        path: "账本详情页 → 右下角 + 按钮",
        tags: ["添加", "新增", "记账", "收入", "支出", "加账"],
        Icon: PlusCircle,
        isHot: true,
      },
      {
        id: "edit",
        name: "修改账目",
        desc: "修改已记录账目的金额、分类、日期等任意字段，支持光标定位精准编辑",
        path: "账目详情页 → 修改账目",
        tags: ["修改", "编辑", "改金额", "改分类", "更新"],
        Icon: Edit3,
        isHot: true,
      },
      {
        id: "delete",
        name: "删除账目",
        desc: "删除账目后可在「删除账单找回」中60天内恢复",
        path: "账目详情页 → 删除账目",
        tags: ["删除", "找回", "恢复", "撤销"],
        Icon: Trash2,
      },
      {
        id: "category",
        name: "三级分类",
        desc: "支持自定义三级分类体系，账目归类更精细灵活",
        path: "账本设置 → 分类管理",
        tags: ["分类", "三级", "自定义", "归类", "类别"],
        Icon: Layers,
        isHot: true,
      },
      {
        id: "desc",
        name: "账目备注",
        desc: "每条账目支持添加文字备注，记录详细说明",
        path: "添加/修改账目 → 备注输入框",
        tags: ["备注", "说明", "描述", "注释"],
        Icon: FileText,
      },
      {
        id: "image",
        name: "图片账单",
        desc: "账目支持上传图片凭证，方便留存票据和报销单",
        path: "添加/修改账目 → 上传图片",
        tags: ["图片", "照片", "凭证", "票据", "拍照"],
        Icon: Image,
        isNew: true,
      },
      {
        id: "currency",
        name: "多币种记账",
        desc: "支持人民币、美元、USDT等多种货币，跨币种账目管理",
        path: "账本设置 → 货币单位",
        tags: ["币种", "货币", "美元", "USD", "USDT", "外币"],
        Icon: Coins,
        isNew: true,
      },
      {
        id: "date",
        name: "自定义日期",
        desc: "账目日期可自由选择，支持补录历史账目",
        path: "添加/修改账目 → 日期选择",
        tags: ["日期", "时间", "补录", "历史"],
        Icon: Calendar,
      },
      {
        id: "pending",
        name: "代收代付",
        desc: "标记代收/代付账目，沙漏图标提醒待结算项",
        path: "添加账目 → 选择代收/代付类型",
        tags: ["代收", "代付", "待结", "沙漏", "结算"],
        Icon: Clock,
      },
      {
        id: "quickadd",
        name: "快速记账",
        desc: "底部中央红色 + 按钮，一键快速进入记账页面",
        path: "任意页面底部 → 中央红色 + 按钮",
        tags: ["快速", "快捷", "一键", "首页"],
        Icon: Zap,
        isHot: true,
      },
    ],
  },
  {
    id: "team",
    label: "团队协作",
    color: "#1565C0",
    bgColor: "#E3F2FD",
    Icon: Users,
    features: [
      {
        id: "invite",
        name: "邀请成员",
        desc: "通过邀请链接或二维码邀请好友加入账本",
        path: "账本详情页 → 右上角菜单 → 邀请成员",
        tags: ["邀请", "加入", "二维码", "链接", "分享"],
        Icon: UserPlus,
        isHot: true,
      },
      {
        id: "permission",
        name: "成员权限",
        desc: "设置成员角色（管理员/普通成员），控制操作权限",
        path: "账本设置 → 成员管理 → 权限设置",
        tags: ["权限", "角色", "管理员", "成员", "限制"],
        Icon: Shield,
      },
      {
        id: "approval",
        name: "审批流程",
        desc: "开启审批后，成员添加的账目需管理员审核通过",
        path: "账本设置 → 审批设置",
        tags: ["审批", "审核", "通过", "拒绝", "流程"],
        Icon: CheckCircle,
      },
      {
        id: "pending_overview",
        name: "待结账目总览",
        desc: "汇总所有账本中的待结算代收/代付账目",
        path: "账本列表页 → 右上角沙漏图标",
        tags: ["待结", "汇总", "总览", "代收", "代付"],
        Icon: Bell,
      },
      {
        id: "record_logs",
        name: "修改记录查询",
        desc: "查看账目的完整修改历史，记录每次变更的字段、旧值→新值和操作人",
        path: "账目详情页 → 修改记录",
        tags: ["修改记录", "历史", "变更", "操作记录", "谁改的"],
        Icon: PenLine,
        isNew: true,
        isHot: true,
      },
    ],
  },
  {
    id: "reimbursement",
    label: "报销管理",
    color: "#2E7D32",
    bgColor: "#E8F5E9",
    Icon: RefreshCw,
    features: [
      {
        id: "rb_apply",
        name: "申请报销",
        desc: "对账目发起报销申请，填写说明并上传凭证图片",
        path: "账目详情页 → 申请报销",
        tags: ["报销", "申请", "凭证", "发票"],
        Icon: Receipt,
        isHot: true,
      },
      {
        id: "rb_approve",
        name: "审批报销",
        desc: "管理员可通过或拒绝成员的报销申请",
        path: "账目详情页 → 报销处理",
        tags: ["报销审批", "通过", "拒绝", "处理"],
        Icon: CheckCircle,
      },
      {
        id: "rb_status",
        name: "报销状态追踪",
        desc: "账目显示无报销/待报销/已报销状态，全程可追踪",
        path: "账目列表 → 报销状态标签",
        tags: ["报销状态", "待报销", "已报销", "追踪"],
        Icon: Eye,
      },
      {
        id: "rb_history",
        name: "报销历史记录",
        desc: "查看账目的完整报销操作历史",
        path: "账目详情页 → 报销记录",
        tags: ["报销历史", "记录", "操作"],
        Icon: Clock,
      },
    ],
  },
  {
    id: "analytics",
    label: "数据分析",
    color: "#6A1B9A",
    bgColor: "#F3E5F5",
    Icon: BarChart2,
    features: [
      {
        id: "report",
        name: "收支报表",
        desc: "按月/年统计收支汇总，分类占比一目了然",
        path: "账本详情页 → 右上角报表图标",
        tags: ["报表", "统计", "收支", "汇总", "分析"],
        Icon: BarChart2,
        isHot: true,
      },
      {
        id: "calendar_view",
        name: "日历视图",
        desc: "以日历形式查看每天的收支情况，支持按日跳转",
        path: "账本详情页 → 右上角日历图标",
        tags: ["日历", "每天", "按日", "视图"],
        Icon: Calendar,
      },
      {
        id: "trend",
        name: "收支趋势",
        desc: "可视化展示月度收支趋势折线图",
        path: "账本报表页 → 趋势图",
        tags: ["趋势", "折线", "走势", "变化"],
        Icon: TrendingUp,
      },
      {
        id: "category_stats",
        name: "分类统计",
        desc: "各分类支出占比饼图，掌握消费结构",
        path: "账本报表页 → 分类统计",
        tags: ["分类统计", "饼图", "占比", "消费结构"],
        Icon: PieChart,
      },
      {
        id: "filter",
        name: "账目筛选",
        desc: "按金额范围、分类、成员、日期、报销状态多维度筛选",
        path: "账本详情页 → 右上角筛选图标",
        tags: ["筛选", "过滤", "查找", "搜索账目", "按条件"],
        Icon: Filter,
        isHot: true,
      },
    ],
  },
  {
    id: "management",
    label: "账本管理",
    color: "#E65100",
    bgColor: "#FFF3E0",
    Icon: Notebook,
    features: [
      {
        id: "create",
        name: "创建账本",
        desc: "创建新的共享账本，设置名称和货币单位",
        path: "账本列表页 → 右下角 + 按钮",
        tags: ["创建", "新建", "开账本"],
        Icon: PlusCircle,
      },
      {
        id: "settings",
        name: "账本设置",
        desc: "修改账本名称、货币单位、封面图片等基本信息",
        path: "账本详情页 → 右上角设置图标",
        tags: ["设置", "修改名称", "货币", "封面"],
        Icon: SlidersHorizontal,
      },
      {
        id: "backup",
        name: "定期备份",
        desc: "账本数据定期自动备份，可手动下载备份文件",
        path: "账本设置 → 备份管理",
        tags: ["备份", "安全", "数据安全"],
        Icon: HardDrive,
      },
      {
        id: "export",
        name: "导出Excel",
        desc: "将账目数据导出为Excel表格，方便留存和二次处理",
        path: "账本详情页 → 右上角菜单 → 导出",
        tags: ["导出", "Excel", "表格", "下载"],
        Icon: Download,
      },
      {
        id: "import",
        name: "导入数据",
        desc: "从Excel批量导入历史账目数据",
        path: "账本详情页 → 右上角菜单 → 导入",
        tags: ["导入", "批量", "历史数据", "迁移"],
        Icon: Upload,
      },
      {
        id: "archive",
        name: "封存账本",
        desc: "将不再使用的账本封存，数据保留但不再显示在主列表",
        path: "账本列表页 → 长按账本 → 封存",
        tags: ["封存", "归档", "停用", "隐藏"],
        Icon: Lock,
      },
      {
        id: "deleted",
        name: "已删除账目找回",
        desc: "60天内可恢复被删除的账目，避免误删损失",
        path: "账本详情页 → 右上角菜单 → 删除账单找回",
        tags: ["找回", "恢复", "撤销删除", "回收站"],
        Icon: RefreshCw,
      },
      {
        id: "sort",
        name: "账本排序",
        desc: "按成员数、账目数、创建日期对账本列表排序",
        path: "账本列表页 → 右上角排序图标",
        tags: ["排序", "顺序", "排列"],
        Icon: SlidersHorizontal,
      },
    ],
  },
];

// 所有功能平铺（用于搜索）
const ALL_FEATURES = FEATURE_GROUPS.flatMap(g =>
  g.features.map(f => ({
    ...f,
    groupId: g.id,
    groupLabel: g.label,
    groupColor: g.color,
    groupBgColor: g.bgColor,
  }))
);

// 标签云
const QUICK_TAGS = [
  { label: "🔥 热门", filter: (f: any) => f.isHot },
  { label: "✨ 最新", filter: (f: any) => f.isNew },
  { label: "记账", filter: (f: any) => f.groupId === "basic" },
  { label: "团队协作", filter: (f: any) => f.groupId === "team" },
  { label: "报销", filter: (f: any) => f.groupId === "reimbursement" },
  { label: "数据分析", filter: (f: any) => f.groupId === "analytics" },
  { label: "账本管理", filter: (f: any) => f.groupId === "management" },
];

export default function LedgerGuide() {
  const [, setLocation] = useLocation();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(FEATURE_GROUPS.map(g => g.id))
  );

  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 搜索结果
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.trim().toLowerCase();
    return ALL_FEATURES.filter(f =>
      f.name.toLowerCase().includes(q) ||
      f.desc.toLowerCase().includes(q) ||
      f.tags.some(t => t.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  // 标签过滤结果
  const tagResults = useMemo(() => {
    if (!activeTag || searchQuery.trim()) return null;
    const tag = QUICK_TAGS.find(t => t.label === activeTag);
    if (!tag) return null;
    return ALL_FEATURES.filter(tag.filter);
  }, [activeTag, searchQuery]);

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleTagClick = (label: string) => {
    if (activeTag === label) {
      setActiveTag(null);
      return;
    }
    setActiveTag(label);
    setSearchQuery("");
    const groupMap: Record<string, string> = {
      "记账": "basic",
      "团队协作": "team",
      "报销": "reimbursement",
      "数据分析": "analytics",
      "账本管理": "management",
    };
    const groupId = groupMap[label];
    if (groupId) {
      setTimeout(() => {
        groupRefs.current[groupId]?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  };

  // 渲染单个功能条目
  const renderFeatureItem = (feature: any, groupColor: string, groupBgColor: string, idx: number) => {
    const { Icon } = feature;
    return (
      <div
        key={`${feature.id}-${idx}`}
        className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-b-0"
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ backgroundColor: groupBgColor }}
        >
          <Icon className="w-[18px] h-[18px]" style={{ color: groupColor }} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-sm font-semibold text-[#222]">{feature.name}</span>
            {feature.isNew && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#D32F2F] text-white font-medium leading-none">新</span>
            )}
            {feature.isHot && !feature.isNew && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#F59E0B] text-white font-medium leading-none">热</span>
            )}
          </div>
          <p className="text-xs text-gray-500 leading-relaxed mb-1">{feature.desc}</p>
          <div className="flex items-center gap-1">
            <ArrowRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
            <span className="text-[11px] text-gray-400 truncate">{feature.path}</span>
          </div>
        </div>
      </div>
    );
  };

  const showSearch = searchResults !== null;
  const showTag = tagResults !== null && !searchQuery;
  const showGroups = !showSearch && !showTag;

  return (
    <div className="min-h-screen bg-[#FAF3ED] pb-8 max-w-md mx-auto relative shadow-2xl">
      {/* 顶部导航 + 搜索 */}
      <div className="sticky top-0 z-40 bg-[#A80000] px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => setLocation("/ledger/list")}
            className="p-1.5 rounded-lg bg-white/20 active:bg-white/30 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="flex-1 text-base font-semibold text-white text-center pr-8">
            共享账本 · 功能说明书
          </h1>
        </div>

        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索功能，如「报销」「导出」「修改记录」…"
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setActiveTag(null);
            }}
            className="w-full pl-9 pr-9 py-2.5 bg-white rounded-xl text-sm text-gray-800 placeholder-gray-400 outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* 标签云 */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex gap-2 flex-wrap">
          {QUICK_TAGS.map(tag => (
            <button
              key={tag.label}
              onClick={() => handleTagClick(tag.label)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                activeTag === tag.label
                  ? "bg-[#A80000] text-white border-[#A80000]"
                  : "bg-white text-gray-600 border-gray-200"
              }`}
            >
              {tag.label}
            </button>
          ))}
        </div>
      </div>

      {/* 搜索结果 */}
      {showSearch && (
        <div className="px-4 pb-4">
          <p className="text-xs text-gray-400 mb-2">
            找到{" "}
            <span className="font-semibold text-gray-600">{searchResults!.length}</span>{" "}
            个相关功能
          </p>
          {searchResults!.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center">
              <Search className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">没有找到相关功能</p>
              <p className="text-xs text-gray-300 mt-1">
                试试其他关键词，如「报销」「导出」「分类」
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl px-4 py-1 shadow-sm">
              {searchResults!.map((f, i) =>
                renderFeatureItem(f, f.groupColor, f.groupBgColor, i)
              )}
            </div>
          )}
        </div>
      )}

      {/* 标签过滤结果 */}
      {showTag && (
        <div className="px-4 pb-4">
          <p className="text-xs text-gray-400 mb-2">
            「{activeTag}」共{" "}
            <span className="font-semibold text-gray-600">{tagResults!.length}</span>{" "}
            个功能
          </p>
          <div className="bg-white rounded-2xl px-4 py-1 shadow-sm">
            {tagResults!.map((f, i) =>
              renderFeatureItem(f, f.groupColor, f.groupBgColor, i)
            )}
          </div>
        </div>
      )}

      {/* 分组卡片（默认视图） */}
      {showGroups && (
        <div className="px-4 pb-4 space-y-3">
          {FEATURE_GROUPS.map(group => {
            const { Icon: GroupIcon } = group;
            const isExpanded = expandedGroups.has(group.id);
            return (
              <div
                key={group.id}
                ref={el => { groupRefs.current[group.id] = el; }}
                className="bg-white rounded-2xl shadow-sm overflow-hidden"
              >
                {/* 分组标题 */}
                <button
                  className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-50"
                  onClick={() => toggleGroup(group.id)}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: group.bgColor }}
                    >
                      <GroupIcon
                        className="w-4 h-4"
                        style={{ color: group.color }}
                        strokeWidth={2}
                      />
                    </div>
                    <span className="text-sm font-semibold text-[#222]">{group.label}</span>
                    <span className="text-xs text-gray-400">{group.features.length} 项</span>
                  </div>
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4 text-gray-400" />
                    : <ChevronDown className="w-4 h-4 text-gray-400" />
                  }
                </button>

                {/* 功能列表 */}
                {isExpanded && (
                  <div className="px-4 py-1">
                    {group.features.map((f, i) =>
                      renderFeatureItem(f, group.color, group.bgColor, i)
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* 底部统计 */}
          <div className="text-center py-4">
            <p className="text-xs text-gray-400">
              共 {ALL_FEATURES.length} 项功能 · 持续迭代更新中
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
