/**
 * rulesData - 规则库集中数据源（仅超管可见）
 *
 * 这是整个「规则库」的唯一数据来源。规则列表页（RulesList）与规则详情页
 * （RuleDetail）都从这里读取。以后新增规则，只需在 RULES 数组里再加一项即可，
 * 编号顺延（001、002、003…）。
 *
 * 用途：管理员/超管把规则编号报给 AI（例如「执行 001」），AI 即按对应规则
 * 详情执行。首条 001 = 角标规则。
 *
 * 设计风格：与 ProjectConsole 一致——移动端优先、白卡片 + 圆角 + 米白底，
 * 强调色金棕色 #CBA471 与品牌红 #D32F2F。
 */
import {
  Hash,
  Tags,
  Layers,
  RefreshCw,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

export interface Rule {
  /** 规则编号，三位数字流水号，如 001、002 */
  id: string;
  /** 规则名称 */
  title: string;
  /** 一句话简介，显示在列表行 */
  summary: string;
  /** 详情页正文（JSX） */
  content: React.ReactNode;
}

/** 详情页内的小节卡片，供各规则 content 复用 */
export function RuleSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-[#FAF3ED] flex items-center justify-center shrink-0">
          <Icon className="w-[18px] h-[18px] text-[#CBA471]" />
        </div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="text-[13px] leading-relaxed text-gray-600 space-y-2">
        {children}
      </div>
    </section>
  );
}

/** ===== 001 · 角标规则 详情正文 ===== */
function PageTagRuleContent() {
  return (
    <>
      {/* 概述 */}
      <div className="bg-gradient-to-br from-[#2A2A2A] to-[#1A1A1A] rounded-2xl p-4 text-white shadow-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <Hash className="w-4 h-4 text-[#E0B97D]" />
          <span className="text-sm font-semibold">页面角标定位系统</span>
        </div>
        <p className="text-[12.5px] leading-relaxed text-white/70">
          每个管理员能看到的页面与浮层都会自动显示一个编号（统一靠右侧）：页面编号在右上角，弹窗/内容框编号在该框右下角。你只要把编号报给开发，就能精准定位到具体页面/组件。该角标
          <span className="text-[#E0B97D] font-medium"> 仅超级管理员可见</span>
          ，普通用户完全看不到。
        </p>
      </div>

      {/* 编号格式 */}
      <RuleSection icon={Tags} title="编号格式">
        <p>
          编号由 <span className="font-semibold text-gray-900">1 个英文字母 + 数字序号</span> 组成，例如
          <span className="font-mono font-semibold text-[#D32F2F]"> A001</span>、
          <span className="font-mono font-semibold text-[#D32F2F]"> A012</span>。
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            数字先用 <span className="font-semibold text-gray-900">三位</span>：A001 → A002 → … → A999；
          </li>
          <li>
            一个字母用满 999 个后，进位到下一个字母：A999 之后是
            <span className="font-mono font-semibold"> B001</span>，B 满后 C001，一直到 Z999；
          </li>
          <li>
            <span className="font-semibold text-gray-900">26 个字母全部用完</span>后，才升级成四位数（A0001 起）。
          </li>
          <li>
            <span className="text-[#D32F2F] font-medium">绝不使用</span> A005-1、A-1a 这类带横杠或字母后缀的编号——每一个可定位的东西（页面、内容框、弹窗）都有自己<span className="font-semibold text-gray-900">独立、平级</span>的完整编号，不分父子，方便口头报数。
          </li>
        </ul>
        <p className="text-[12px] text-gray-400">
          注：当前全站编号仅 300 多个，长期都只会用到 A 段，实际不会进位到 B。
        </p>
      </RuleSection>

      {/* 颜色与位置 */}
      <RuleSection icon={Layers} title="两种角标：颜色与位置">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 inline-flex items-center justify-center font-mono text-[11px] font-bold text-white bg-[#C9A227] px-1.5 py-0.5 rounded shadow-sm shrink-0">
            A005
          </span>
          <p>
            <span className="font-semibold text-gray-900">金色页面号</span>
            ：贴在页面<span className="font-semibold text-gray-900">右上角</span>，代表「当前这个页面」。由页面路由自动分配，每个路由一个固定编号。
          </p>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 inline-flex items-center justify-center font-mono text-[11px] font-bold text-white bg-[#3F9E5A] px-1.5 py-0.5 rounded shadow-sm shrink-0">
            A612
          </span>
          <p>
            <span className="font-semibold text-gray-900">绿色容器号</span>
            ：贴在弹窗、抽屉、确认框、Tab 内容框等容器的<span className="font-semibold text-gray-900">右下角</span>，代表「这个框」。它是一个<span className="font-semibold text-gray-900">独立编号</span>（不是 A005-1 这种），同一个框每次出现都是同一个号。
          </p>
        </div>
        <p className="text-[12px] text-gray-400">
          转瞬即逝的轻提示（toast）不打角标，避免闪烁干扰。
        </p>
      </RuleSection>

      {/* 自动机制 */}
      <RuleSection icon={RefreshCw} title="全自动，无需手动维护">
        <p>
          角标是<span className="font-semibold text-gray-900">系统自动挂载</span>的，不需要开发在每个页面手写：
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <span className="font-semibold text-gray-900">新增页面</span>
            ：只要在路由表里注册，访问时右上角会自动出现编号，永远不会漏标；
          </li>
          <li>
            <span className="font-semibold text-gray-900">弹窗 / 抽屉 / Tab</span>
            ：系统实时扫描屏幕上渲染出来的浮层，自动为每一个挂上子号；
          </li>
          <li>新页面若未在编号表登记，会先获得一个临时编号，登记后即固定。</li>
        </ul>
      </RuleSection>

      {/* 怎么用 */}
      <RuleSection icon={AlertTriangle} title="怎么用（给管理员）">
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>在页面右上角找到金色页面号（如 A012）；</li>
          <li>如果问题在某个弹窗/内容框里，记下它右下角的绿色容器号（如 A612）；</li>
          <li>把编号报给开发，例如「A012 这个页面的按钮有问题」「A612 这个弹窗里的金额不对」；</li>
          <li>开发凭编号即可定位到对应的页面文件或浮层组件，无需再反复确认是哪个页面。</li>
        </ol>
      </RuleSection>

      <p className="text-center text-[11px] text-gray-300 pt-1">
        规则 001 · 角标规则 · 仅超级管理员可见 · 全站自动生效
      </p>
    </>
  );
}

/** ===== 规则库总表 ===== */
export const RULES: Rule[] = [
  {
    id: "001",
    title: "角标规则",
    summary:
      "管理员页面/容器自动编号体系：右上金色页面号、右下绿色容器号，独立无横杠编号，仅超管可见。",
    content: <PageTagRuleContent />,
  },
];

/** 按编号查规则 */
export function getRuleById(id: string): Rule | undefined {
  return RULES.find((r) => r.id === id);
}
