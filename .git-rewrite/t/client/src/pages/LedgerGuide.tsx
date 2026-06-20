import { useState } from "react";
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

// ===================== 数据 =====================

const GROUPS = [
  {
    id: "basic",
    label: "记账基础",
    color: "#D32F2F",
    bg: "#FFF5F5",
    Icon: Receipt,
    items: [
      { id: "add",       Icon: PlusCircle,      isHot: true,  isNew: false, name: "添加账目",         desc: "记录收入或支出，支持金额、分类、日期、备注",                       path: "账本详情页 → 右下角 + 按钮",            keys: "添加 新增 记账 收入 支出 加账" },
      { id: "edit",      Icon: Edit3,            isHot: true,  isNew: false, name: "修改账目",         desc: "修改已记录账目的金额、分类、日期等字段，支持光标定位精准编辑",      path: "账目详情页 → 修改账目",                 keys: "修改 编辑 改金额 改分类 更新" },
      { id: "delete",    Icon: Trash2,           isHot: false, isNew: false, name: "删除账目",         desc: "删除账目后可在「删除账单找回」中60天内恢复",                       path: "账目详情页 → 删除账目",                 keys: "删除 找回 恢复 撤销" },
      { id: "category",  Icon: Layers,           isHot: true,  isNew: false, name: "三级分类",         desc: "支持自定义三级分类体系，账目归类更精细灵活",                       path: "账本设置 → 分类管理",                   keys: "分类 三级 自定义 归类 类别" },
      { id: "desc",      Icon: FileText,         isHot: false, isNew: false, name: "账目备注",         desc: "每条账目支持添加文字备注，记录详细说明",                           path: "添加/修改账目 → 备注输入框",            keys: "备注 说明 描述 注释" },
      { id: "image",     Icon: Image,            isHot: false, isNew: true,  name: "图片账单",         desc: "账目支持上传图片凭证，方便留存票据和报销单",                       path: "添加/修改账目 → 上传图片",              keys: "图片 照片 凭证 票据 拍照 上传" },
      { id: "currency",  Icon: Coins,            isHot: false, isNew: true,  name: "多币种记账",       desc: "支持人民币、美元、USDT等多种货币，跨币种账目管理",                 path: "账本设置 → 货币单位",                   keys: "币种 货币 美元 USD USDT 外币 人民币" },
      { id: "date",      Icon: Calendar,         isHot: false, isNew: false, name: "自定义日期",       desc: "账目日期可自由选择，支持补录历史账目",                             path: "添加/修改账目 → 日期选择",              keys: "日期 时间 补录 历史" },
      { id: "pending",   Icon: Clock,            isHot: false, isNew: false, name: "代收代付",         desc: "标记代收/代付账目，沙漏图标提醒待结算项",                         path: "添加账目 → 选择代收/代付类型",          keys: "代收 代付 待结 沙漏 结算" },
      { id: "quickadd",  Icon: Zap,              isHot: true,  isNew: false, name: "快速记账",         desc: "底部中央红色 + 按钮，一键快速进入记账页面",                        path: "任意页面底部 → 中央红色 + 按钮",        keys: "快速 快捷 一键 首页" },
    ],
  },
  {
    id: "team",
    label: "团队协作",
    color: "#1565C0",
    bg: "#E3F2FD",
    Icon: Users,
    items: [
      { id: "invite",    Icon: UserPlus,         isHot: true,  isNew: false, name: "邀请成员",         desc: "通过邀请链接或二维码邀请好友加入账本",                             path: "账本详情页 → 右上角菜单 → 邀请成员",    keys: "邀请 加入 二维码 链接 分享" },
      { id: "perm",      Icon: Shield,           isHot: false, isNew: false, name: "成员权限",         desc: "设置成员角色（管理员/普通成员），控制操作权限",                     path: "账本设置 → 成员管理 → 权限设置",        keys: "权限 角色 管理员 成员 限制" },
      { id: "approval",  Icon: CheckCircle,      isHot: false, isNew: false, name: "审批流程",         desc: "开启审批后，成员添加的账目需管理员审核通过",                       path: "账本设置 → 审批设置",                   keys: "审批 审核 通过 拒绝 流程" },
      { id: "pendovw",   Icon: Bell,             isHot: false, isNew: false, name: "待结账目总览",     desc: "汇总所有账本中的待结算代收/代付账目",                              path: "账本列表页 → 右上角沙漏图标",           keys: "待结 汇总 总览 代收 代付" },
      { id: "logs",      Icon: PenLine,          isHot: true,  isNew: true,  name: "修改记录查询",     desc: "查看账目的完整修改历史，记录每次变更的字段、旧值→新值和操作人",     path: "账目详情页 → 修改记录",                 keys: "修改记录 历史 变更 操作记录 谁改的 日志" },
    ],
  },
  {
    id: "reimbursement",
    label: "报销管理",
    color: "#2E7D32",
    bg: "#E8F5E9",
    Icon: RefreshCw,
    items: [
      { id: "rb_apply",  Icon: Receipt,          isHot: true,  isNew: false, name: "申请报销",         desc: "对账目发起报销申请，填写说明并上传凭证图片",                       path: "账目详情页 → 申请报销",                 keys: "报销 申请 凭证 发票 报销申请" },
      { id: "rb_appr",   Icon: CheckCircle,      isHot: false, isNew: false, name: "审批报销",         desc: "管理员可通过或拒绝成员的报销申请",                                 path: "账目详情页 → 报销处理",                 keys: "报销审批 报销 通过 拒绝 处理 审批" },
      { id: "rb_status", Icon: Eye,              isHot: false, isNew: false, name: "报销状态追踪",     desc: "账目显示无报销/待报销/已报销状态，全程可追踪",                     path: "账目列表 → 报销状态标签",               keys: "报销状态 待报销 已报销 追踪 报销" },
      { id: "rb_hist",   Icon: Clock,            isHot: false, isNew: false, name: "报销历史记录",     desc: "查看账目的完整报销操作历史",                                       path: "账目详情页 → 报销记录",                 keys: "报销历史 记录 操作 报销" },
    ],
  },
  {
    id: "analytics",
    label: "数据分析",
    color: "#6A1B9A",
    bg: "#F3E5F5",
    Icon: BarChart2,
    items: [
      { id: "report",    Icon: BarChart2,        isHot: true,  isNew: false, name: "收支报表",         desc: "按月/年统计收支汇总，分类占比一目了然",                            path: "账本详情页 → 右上角报表图标",           keys: "报表 统计 收支 汇总 分析" },
      { id: "calview",   Icon: Calendar,         isHot: false, isNew: false, name: "日历视图",         desc: "以日历形式查看每天的收支情况，支持按日跳转",                       path: "账本详情页 → 右上角日历图标",           keys: "日历 每天 按日 视图" },
      { id: "trend",     Icon: TrendingUp,       isHot: false, isNew: false, name: "收支趋势",         desc: "可视化展示月度收支趋势折线图",                                     path: "账本报表页 → 趋势图",                   keys: "趋势 折线 走势 变化" },
      { id: "pie",       Icon: PieChart,         isHot: false, isNew: false, name: "分类统计",         desc: "各分类支出占比饼图，掌握消费结构",                                 path: "账本报表页 → 分类统计",                 keys: "分类统计 饼图 占比 消费结构" },
      { id: "filter",    Icon: Filter,           isHot: true,  isNew: false, name: "账目筛选",         desc: "按金额范围、分类、成员、日期、报销状态多维度筛选",                 path: "账本详情页 → 右上角筛选图标",           keys: "筛选 过滤 查找 搜索账目 按条件" },
    ],
  },
  {
    id: "management",
    label: "账本管理",
    color: "#E65100",
    bg: "#FFF3E0",
    Icon: Notebook,
    items: [
      { id: "create",    Icon: PlusCircle,       isHot: false, isNew: false, name: "创建账本",         desc: "创建新的共享账本，设置名称和货币单位",                             path: "账本列表页 → 右下角 + 按钮",            keys: "创建 新建 开账本" },
      { id: "settings",  Icon: SlidersHorizontal,isHot: false, isNew: false, name: "账本设置",         desc: "修改账本名称、货币单位、封面图片等基本信息",                       path: "账本详情页 → 右上角设置图标",           keys: "设置 修改名称 货币 封面" },
      { id: "backup",    Icon: HardDrive,        isHot: false, isNew: false, name: "定期备份",         desc: "账本数据定期自动备份，可手动下载备份文件",                         path: "账本设置 → 备份管理",                   keys: "备份 安全 数据安全" },
      { id: "export",    Icon: Download,         isHot: false, isNew: false, name: "导出Excel",        desc: "将账目数据导出为Excel表格，方便留存和二次处理",                    path: "账本详情页 → 右上角菜单 → 导出",        keys: "导出 Excel 表格 下载" },
      { id: "import",    Icon: Upload,           isHot: false, isNew: false, name: "导入数据",         desc: "从Excel批量导入历史账目数据",                                      path: "账本详情页 → 右上角菜单 → 导入",        keys: "导入 批量 历史数据 迁移" },
      { id: "archive",   Icon: Lock,             isHot: false, isNew: false, name: "封存账本",         desc: "将不再使用的账本封存，数据保留但不再显示在主列表",                 path: "账本列表页 → 长按账本 → 封存",          keys: "封存 归档 停用 隐藏" },
      { id: "recover",   Icon: RefreshCw,        isHot: false, isNew: false, name: "已删除账目找回",   desc: "60天内可恢复被删除的账目，避免误删损失",                           path: "账本详情页 → 右上角菜单 → 删除账单找回", keys: "找回 恢复 撤销删除 回收站" },
      { id: "sort",      Icon: SlidersHorizontal,isHot: false, isNew: false, name: "账本排序",         desc: "按成员数、账目数、创建日期对账本列表排序",                         path: "账本列表页 → 右上角排序图标",           keys: "排序 顺序 排列" },
    ],
  },
];

// 平铺所有功能（带分组信息）
const ALL_ITEMS = GROUPS.flatMap(g =>
  g.items.map(item => ({ ...item, gid: g.id, glabel: g.label, gcolor: g.color, gbg: g.bg }))
);

// 标签云配置
const TAGS = [
  { label: "🔥 热门",   fn: (x: any) => x.isHot },
  { label: "✨ 最新",   fn: (x: any) => x.isNew },
  { label: "记账",      fn: (x: any) => x.gid === "basic" },
  { label: "团队协作",  fn: (x: any) => x.gid === "team" },
  { label: "报销",      fn: (x: any) => x.gid === "reimbursement" },
  { label: "数据分析",  fn: (x: any) => x.gid === "analytics" },
  { label: "账本管理",  fn: (x: any) => x.gid === "management" },
];

// ===================== 组件 =====================

function FeatureRow({ item, color, bg }: { item: any; color: string; bg: string }) {
  const { Icon } = item;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-b-0">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: bg }}>
        <Icon className="w-[18px] h-[18px]" style={{ color }} strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-sm font-semibold text-[#222]">{item.name}</span>
          {item.isNew && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#D32F2F] text-white font-medium leading-none">新</span>}
          {item.isHot && !item.isNew && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#F59E0B] text-white font-medium leading-none">热</span>}
        </div>
        <p className="text-xs text-gray-500 leading-relaxed mb-1">{item.desc}</p>
        <div className="flex items-center gap-1">
          <ArrowRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
          <span className="text-[11px] text-gray-400 truncate">{item.path}</span>
        </div>
      </div>
    </div>
  );
}

export default function LedgerGuide() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // 搜索过滤：实时、模糊
  const q = query.trim().toLowerCase();
  const searchResults = q
    ? ALL_ITEMS.filter(item =>
        item.name.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q) ||
        item.keys.toLowerCase().includes(q) ||
        item.glabel.toLowerCase().includes(q)
      )
    : null;

  // 标签过滤
  const tagResults = (!q && activeTag)
    ? ALL_ITEMS.filter(TAGS.find(t => t.label === activeTag)?.fn ?? (() => false))
    : null;

  const showSearch = searchResults !== null;
  const showTag    = tagResults !== null;
  const showGroups = !showSearch && !showTag;

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[#FAF3ED] pb-8 max-w-md mx-auto relative shadow-2xl">

      {/* 顶部 */}
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
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索功能，如「报销」「导出」「修改记录」…"
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveTag(null); }}
            className="w-full pl-9 pr-9 py-2.5 bg-white rounded-xl text-sm text-gray-800 placeholder-gray-400 outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* 标签云 */}
      <div className="px-4 pt-3 pb-2 flex gap-2 flex-wrap">
        {TAGS.map(tag => (
          <button
            key={tag.label}
            onClick={() => { setActiveTag(activeTag === tag.label ? null : tag.label); setQuery(""); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              activeTag === tag.label
                ? "bg-[#A80000] text-white border-[#A80000]"
                : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            {tag.label}
          </button>
        ))}
      </div>

      {/* 搜索结果 */}
      {showSearch && (
        <div className="px-4 pb-4">
          <p className="text-xs text-gray-400 mb-2">
            找到 <span className="font-semibold text-gray-700">{searchResults!.length}</span> 个相关功能
          </p>
          {searchResults!.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center">
              <Search className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">没有找到相关功能</p>
              <p className="text-xs text-gray-300 mt-1">试试其他关键词，如「报销」「导出」「分类」</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl px-4 py-1 shadow-sm">
              {searchResults!.map(item => (
                <FeatureRow key={item.id} item={item} color={item.gcolor} bg={item.gbg} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 标签过滤结果 */}
      {showTag && (
        <div className="px-4 pb-4">
          <p className="text-xs text-gray-400 mb-2">
            「{activeTag}」共 <span className="font-semibold text-gray-700">{tagResults!.length}</span> 个功能
          </p>
          <div className="bg-white rounded-2xl px-4 py-1 shadow-sm">
            {tagResults!.map(item => (
              <FeatureRow key={item.id} item={item} color={item.gcolor} bg={item.gbg} />
            ))}
          </div>
        </div>
      )}

      {/* 分组卡片 */}
      {showGroups && (
        <div className="px-4 pb-4 space-y-3">
          {GROUPS.map(g => {
            const { Icon: GIcon } = g;
            const isOpen = !collapsed.has(g.id);
            return (
              <div key={g.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-50"
                  onClick={() => toggleCollapse(g.id)}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: g.bg }}>
                      <GIcon className="w-4 h-4" style={{ color: g.color }} strokeWidth={2} />
                    </div>
                    <span className="text-sm font-semibold text-[#222]">{g.label}</span>
                    <span className="text-xs text-gray-400">{g.items.length} 项</span>
                  </div>
                  {isOpen
                    ? <ChevronUp className="w-4 h-4 text-gray-400" />
                    : <ChevronDown className="w-4 h-4 text-gray-400" />
                  }
                </button>
                {isOpen && (
                  <div className="px-4 py-1">
                    {g.items.map(item => (
                      <FeatureRow key={item.id} item={item} color={g.color} bg={g.bg} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div className="text-center py-4">
            <p className="text-xs text-gray-400">共 {ALL_ITEMS.length} 项功能 · 持续迭代更新中</p>
          </div>
        </div>
      )}
    </div>
  );
}
