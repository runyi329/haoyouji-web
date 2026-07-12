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
  Mail,
  Server,
  Link2,
  ShieldAlert,
  LayoutTemplate,
  ArrowLeft,
  Save,
  MessageSquare,
  MousePointerClick,
  MonitorSmartphone,
  Plug,
  Ban,
  GitBranch,
  Clock,
  Users,
  ShieldCheck,
  UserCog,
  Lock,
  LogIn,
  Paintbrush,
  Upload,
  Image,
  Minimize2,
  Key,
  Bot,
  FileText,
  RefreshCcw,
  Globe,
  Database,
  FolderGit2,
  Fingerprint,
  BookMarked,
  Boxes,
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

/** ===== 002 · 邮箱配置规则 详情正文 ===== */
function EmailConfigRuleContent() {
  return (
    <>
      {/* 概述 */}
      <div className="bg-gradient-to-br from-[#1A2B4A] to-[#243660] rounded-2xl p-4 text-white shadow-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <Mail className="w-4 h-4 text-[#E0B97D]" />
          <span className="text-sm font-semibold">邮箱配置·数据导出·数据导入</span>
        </div>
        <p className="text-[12.5px] leading-relaxed text-white/70">
          本站所有项目（牙伴、红酒、酱、好友记等）凡是涉及邮箱的功能——发送备份、通知、预警邮件等——都
          <span className="text-[#E0B97D] font-medium">统一遵循这一套配置规则</span>
          。发件走系统统一的 SMTP 通道；收件邮箱则统一调用脉动网（迈动网）个人中心里绑定的邮箱。
        </p>
      </div>

      {/* 发件 SMTP 配置 */}
      <RuleSection icon={Server} title="默认发件配置（SMTP）">
        <p>
          所有邮件统一通过下面这套 QQ 邮箱 SMTP 通道发出，配置写在
          <span className="font-mono font-semibold text-[#1A2B4A]"> server/email-service.ts</span> 顶部的
          <span className="font-mono font-semibold text-[#1A2B4A]"> SMTP_CONFIG</span>：
        </p>
        <div className="rounded-xl bg-[#F8F9FC] border border-gray-100 p-3 font-mono text-[12px] text-gray-700 space-y-1">
          <div>host：smtp.qq.com</div>
          <div>port：465（SSL，secure: true）</div>
          <div>发件账号：tina_u@qq.com</div>
          <div>授权码：wqettalptfmebgdf（QQ 邮箱 SMTP 授权码，非登录密码）</div>
        </div>
        <p>
          以后任何项目要新增邮件功能，<span className="font-semibold text-gray-900">直接复用这套发件通道即可</span>，不要再为单个项目另起一套 SMTP。当前已复用此通道的有：账本备份邮件、AJ 报销单备份邮件、好友记担保缺口预警邮件。
        </p>
      </RuleSection>

      {/* 收件邮箱 = 脉动网个人中心绑定 */}
      <RuleSection icon={Link2} title="收件邮箱：统一调用脉动网个人中心绑定">
        <p>
          收件邮箱<span className="font-semibold text-gray-900">不在各项目里单独维护</span>，而是统一归属脉动网（迈动网）总账号的
          <span className="font-semibold text-gray-900">个人中心 / 个人设置</span>。
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            各项目做出来的网页是<span className="font-semibold text-gray-900">各自独立</span>的，但邮箱字段都
            <span className="font-semibold text-gray-900">读取/调用脉动网个人中心里绑定的那一个邮箱</span>；
          </li>
          <li>
            用户只要在脉动网个人中心<span className="font-semibold text-gray-900">绑定</span>过邮箱，所有项目就直接复用，无需在每个项目重复填写；
          </li>
          <li>
            若用户尚未绑定，项目里应<span className="font-semibold text-gray-900">提示其先到脉动网个人中心绑定邮箱</span>，再使用相关功能。
          </li>
        </ul>
      </RuleSection>

      {/* 添加 / 修改邮箱的归属 */}
      <RuleSection icon={Mail} title="添加 / 修改邮箱：改的是脉动网总邮箱">
        <p>
          各项目页面可以提供「添加 / 修改邮箱」的入口，但务必明确：
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            用户在<span className="font-semibold text-gray-900">任意一个项目里</span>添加或修改邮箱，本质都是在
            <span className="font-semibold text-gray-900">添加 / 修改脉动网（迈动网）个人中心里那个统一绑定的邮箱</span>；
          </li>
          <li>
            <span className="text-[#D32F2F] font-medium">不是</span>给某个项目单独存一份邮箱——所有项目读到的都是<span className="font-semibold text-gray-900">同一个邮箱</span>；
          </li>
          <li>
            因此<span className="font-semibold text-gray-900">一处修改、处处生效</span>：在牙伴改了邮箱，红酒、好友记等项目读到的也随之更新。
          </li>
        </ul>
      </RuleSection>

      {/* 备份/导出轻模板 */}
      <RuleSection icon={LayoutTemplate} title="备份 / 导出页轻模板（参照牙伴 A580）">
        <p>
          当说「用规则 002 给某页加备份 / 导出 / 邮件功能」时，默认就按脉动网
          <span className="font-mono font-semibold text-[#1A2B4A]"> A580</span>（牙伴·数据安全管理 · 数据导出备份页）这套
          <span className="font-semibold text-gray-900">“轻模板”</span>来做，再在此基础上微调，不需要逐项交代。
        </p>
        <p className="font-semibold text-gray-900">标准步骤顺序（从上到下逐卡片）：</p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>
            <span className="font-semibold text-gray-900">选对象</span>：先选“给谁的数据”。A580 里是“选择医院”，换项目可能是选门店 / 账本 / 企业 / 其他主体——首步永远是选主体；
          </li>
          <li>
            <span className="font-semibold text-gray-900">选范围 / 选信息</span>：在对象里勾选要导出哪些内容（可多选 + 全选，未开放项作“即将开放”占位）；
          </li>
          <li>
            <span className="font-semibold text-gray-900">选文件格式</span>：Excel（便于查看打印）/ JSON（可用于导入还原），可多选；
          </li>
          <li>
            <span className="font-semibold text-gray-900">选导出方式</span>：下载到本机 / 发送到邮箱（邮箱取用规则 002 的脉动网绑定邮箱，未绑定则提示去绑定）；
          </li>
          <li>
            <span className="font-semibold text-gray-900">AI 智能备份</span>：开关 + 频率（日 / 周 / 月 / 季），到期凌晨自动发邮箱，类似定时模板。
          </li>
        </ol>
        <p>
          另附一个平行页：<span className="font-semibold text-gray-900">数据导入存档</span>（上传 JSON / Excel 还原，重复跳过），与导出备份同页用 Tab 切换。
        </p>
        <p className="font-semibold text-gray-900">UI 风格（沿用 A580）：</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>移动端优先，白底圆角卡片（rounded-2xl + shadow-sm）逐步堆叠，每步一张卡片配步骤序号标题；</li>
          <li>顶部蓝色渐变 sticky 头（#2196C8 → #3BA9E0）+ 返回键 + 所属主体名；下方双 Tab；</li>
          <li>强调色 #1E88D6，选中态 #F0F7FD 背景 + 蓝边，图标底 #EAF4FE 圆角方块；</li>
          <li>可折叠下拉 + 勾选框（CheckSquare/Square），开关用自定义 toggle。</li>
        </ul>
      </RuleSection>

      {/* 安全提示 */}
      <RuleSection icon={ShieldAlert} title="安全提示">
        <p>
          当前发件授权码<span className="font-semibold text-gray-900">硬编码</span>在源码里（已随仓库进入 GitHub），存在泄露风险。后续如需提升安全性，建议改为从环境变量（.env）读取，并在 QQ 邮箱设置中重置授权码。
        </p>
        <p className="text-[12px] text-gray-400">
          说明：本规则为「约定/调用规范」。以后需要用到邮箱功能时，按本规则配置——发件用统一 SMTP，收件用脉动网绑定邮箱。
        </p>
      </RuleSection>

      <p className="text-center text-[11px] text-gray-300 pt-1">
        规则 002 · 邮箱配置·数据导出·数据导入 · 仅超级管理员可见
      </p>
    </>
  );
}

/** ===== 003 · 返回·刷新·保存·提示 通用交互规则 详情正文 ===== */
function UIInteractionRuleContent() {
  return (
    <>
      {/* 概述 */}
      <div className="bg-gradient-to-br from-[#1A2B4A] to-[#243660] rounded-2xl p-4 text-white shadow-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <MousePointerClick className="w-4 h-4 text-[#E0B97D]" />
          <span className="text-sm font-semibold">返回 · 刷新 · 保存 · 提示</span>
        </div>
        <p className="text-[12.5px] leading-relaxed text-white/70">
          全站通用交互按钮的统一行为规范。以后说「这个按钮按规则 003 走」「加一个返回 / 刷新 / 保存按钮，按规则 003」，就按下面四条标准来做，不必逐项交代。
          <span className="text-[#E0B97D] font-medium">本规则只约定行为逻辑，不固定 UI 样式</span>——外观一律跟随所在项目自身风格。
        </p>
      </div>

      {/* 返回按钮 */}
      <RuleSection icon={ArrowLeft} title="① 返回按钮：从哪来，回哪去">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            行为：<span className="font-semibold text-gray-900">永远返回上一个进来的页面</span>（浏览历史回退优先，等价 <span className="font-mono text-[12px]">history.back()</span>）。从哪个页面点进来，就退回哪个页面。
          </li>
          <li>
            <span className="text-[#D32F2F] font-medium">不写死</span>跳转目标（禁止「返回总控台」「返回首页」这类固定目的地导致错位）。
          </li>
          <li>
            兜底：当没有上一页历史时（外链直开 / 刷新后无历史），回到<span className="font-semibold text-gray-900">该项目自己的首页</span>（牙伴回牙伴首页、好友记回账本首页等），不回总控台。
          </li>
          <li>文案：统一显示<span className="font-semibold text-gray-900">「返回」</span>，不带目标名。</li>
        </ul>
      </RuleSection>

      {/* 刷新按钮 */}
      <RuleSection icon={RefreshCw} title="② 刷新按钮：强制整页重载">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            行为：一律<span className="font-semibold text-gray-900">强制刷新当前页面</span>——整页重载（<span className="font-mono text-[12px]">window.location.reload()</span>），必要时先清掉本地 / 接口缓存再重载。
          </li>
          <li>
            目的：确保拿到<span className="font-semibold text-gray-900">最新数据</span>，不残留任何旧状态、不吃旧缓存。
          </li>
          <li className="text-[12px] text-gray-400">说明：采用「整页重载」方案（强制、彻底），而非仅局部重拉数据。</li>
        </ul>
      </RuleSection>

      {/* 保存按钮 */}
      <RuleSection icon={Save} title="③ 保存按钮：有正反馈 + 保存后转展示态">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <span className="font-semibold text-gray-900">正反馈</span>：点击保存后必须有明确反馈——成功弹提示（如「已保存」），失败弹错误提示；保存过程中按钮置 loading / 禁用，防止重复提交。
          </li>
          <li>
            <span className="font-semibold text-gray-900">真正落库</span>：保存即写入后端，不是只停在前端。
          </li>
          <li>
            <span className="font-semibold text-gray-900">转为展示态</span>：再次进入该页时，已保存的内容默认是<span className="font-semibold text-gray-900">只读展示</span>，不再停留在可编辑输入框状态。
          </li>
          <li>
            想再改必须先点<span className="font-semibold text-gray-900">「编辑」</span>按钮进入编辑态；编辑→保存后自动切回展示态。即页面区分<span className="font-semibold text-gray-900">「展示态 / 编辑态」</span>，默认展示态。
          </li>
        </ul>
      </RuleSection>

      {/* 提示 */}
      <RuleSection icon={MessageSquare} title="④ 提示：默认居中显示">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            所有操作反馈提示（保存成功 / 失败、各类 toast）<span className="font-semibold text-gray-900">默认显示在屏幕正中间</span>（居中弹出），而非顶部或底部，更醒目。
          </li>
        </ul>
      </RuleSection>

      <p className="text-center text-[11px] text-gray-300 pt-1">
        规则 003 · 返回·刷新·保存·提示 · 仅超级管理员可见
      </p>
    </>
  );
}

/** ===== 004 · 开发预览与部署纪律 详情正文 ===== */
function DevPreviewDeployRuleContent() {
  return (
    <>
      {/* 概述 */}
      <div className="bg-gradient-to-br from-[#102A22] to-[#1C3D32] rounded-2xl p-4 text-white shadow-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <MonitorSmartphone className="w-4 h-4 text-[#E0B97D]" />
          <span className="text-sm font-semibold">开发预览与部署纪律</span>
        </div>
        <p className="text-[12.5px] leading-relaxed text-white/70">
          关于「实时热修改预览地址」「端口管理」「提交部署」的统一纪律。核心卖点是
          <span className="text-[#E0B97D] font-medium">「左边改、右边马上变」的实时热开发</span>
          ——开发时只在临时预览地址上改、客户实时看，攒够一批再经超管确认后统一提交部署。
        </p>
      </div>

      {/* 端口锁定 3000 */}
      <RuleSection icon={Plug} title="① 预览端口：永远锁定 3000">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            实时预览的临时监听地址，端口号写在域名前缀里（如
            <span className="font-mono text-[12px]"> 3000-xxxx.manus.computer</span>），所以端口必须
            <span className="font-semibold text-gray-900">永远锁定 3000</span>，地址前缀才稳定。
          </li>
          <li>
            3000 被占用时：<span className="text-[#D32F2F] font-medium">先杀掉占用进程腾出 3000</span> 再启动，
            <span className="font-semibold text-gray-900">绝不顺延到 3001 / 3002</span>（一换端口地址就变，客户那边即失效）。
          </li>
          <li>
            若占用 3000 的就是本项目自己的开发服务器，直接复用、不必重启。
          </li>
        </ul>
      </RuleSection>

      {/* 地址性质与发送 */}
      <RuleSection icon={Clock} title="② 临时地址：何时变、何时发">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            临时地址<span className="font-semibold text-gray-900">不按时间变</span>——只在「沙箱/会话休眠后唤醒、重启开发服务、重新暴露端口」等事件发生时才变；连续演示几小时内保持不变。
          </li>
          <li>
            <span className="font-semibold text-gray-900">地址不变时不重复发</span>给客户，避免对方误以为又换了；只有地址确实变了才重新发。
          </li>
          <li>
            该地址是<span className="font-semibold text-gray-900">临时开发服务器</span>，会变、会随会话失效、首次加载慢几秒，
            <span className="text-[#D32F2F] font-medium">不可添加到桌面/主屏长期使用</span>——只用于「临时看一眼实时热修改」。客户日常长期入口一律用正式部署域名。
          </li>
        </ul>
      </RuleSection>

      {/* 地址变更显式提示 */}
      <RuleSection icon={AlertTriangle} title="③ 地址变更：必须显式提示，不能只甩链接">
        <p>
          当地址因不可抗力变更（沙箱重启 / 会话唤醒 / 重新暴露等，<span className="font-semibold text-gray-900">非</span> 3000 被占杀进程那种），必须
          <span className="font-semibold text-gray-900">主动、显式告知</span>，不能默默发一串新链接让对方自己比对：
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>明确一句话：<span className="font-semibold text-gray-900">「临时预览地址已变更，请改用新地址」</span>；</li>
          <li>给出<span className="font-semibold text-gray-900">新地址</span>，并尽量附新旧对比（指出中间标识串变了），让对方无需逐字比对；</li>
          <li>提醒把客户那边保存的链接同步替换。</li>
        </ul>
      </RuleSection>

      {/* 未提交改动计数 */}
      <RuleSection icon={MessageSquare} title="④ 未提交改动计数：口头播报，满 10 次提醒">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            每完成一次有效改动（且尚未提交部署），向超管<span className="font-semibold text-gray-900">口头播报当前已累计的未提交改动次数</span>（如「已累计 3 次未提交」）。
          </li>
          <li>
            累计到约 <span className="font-semibold text-gray-900">10 次</span>时给出一次提醒，建议可以提交部署了；是否提交由超管决定。
          </li>
          <li>提交部署后计数清零，重新从 0 累计。此为口头约定，不做页面徽标。</li>
        </ul>
      </RuleSection>

      {/* 禁止自行部署 */}
      <RuleSection icon={Ban} title="⑤ 绝对禁止 AI 自行提交部署">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <span className="text-[#D32F2F] font-medium">任何 git commit / git push / 触发部署，必须经超管明确指令后才能执行</span>；没有点头，只能在本地 / 预览地址上改与演示，不得推送。
          </li>
          <li>
            工作节奏：通常攒够一批改动（约 10 次）、超管确认满意后，再一次性提交部署，不每改一次就部署。
          </li>
        </ul>
      </RuleSection>

      {/* 部署目标仓库 */}
      <RuleSection icon={GitBranch} title="⑥ 部署目标：统一推送 runyi329/haoyouji-web · main">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            所有提交统一推送到 GitHub 仓库
            <span className="font-mono font-semibold text-[#102A22]"> runyi329/haoyouji-web</span> 的
            <span className="font-mono font-semibold text-[#102A22]"> main</span> 分支；
          </li>
          <li>
            push main 后由 <span className="font-mono text-[12px]">bg-deploy.yml</span> 工作流
            <span className="font-semibold text-gray-900">自动部署到生产服务器</span>；
          </li>
          <li><span className="text-[#D32F2F] font-medium">不推到</span>任何其他仓库或分支。</li>
        </ul>
      </RuleSection>

      <p className="text-center text-[11px] text-gray-300 pt-1">
        规则 004 · 开发预览与部署纪律 · 仅超级管理员可见
      </p>
    </>
  );
}

/** ===== 005 · 项目创建规则 详情正文 ===== */
function ProjectCreationRuleContent() {
  return (
    <>
      {/* 概述 */}
      <div className="bg-gradient-to-br from-[#3A1E12] to-[#5A2E1C] rounded-2xl p-4 text-white shadow-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <ShieldCheck className="w-4 h-4 text-[#E0B97D]" />
          <span className="text-sm font-semibold">项目创建规则</span>
        </div>
        <p className="text-[12.5px] leading-relaxed text-white/70">
          每新建一个项目都需遵循的总规范。本规则内容会逐步增多，请按下方目录索引。
        </p>
      </div>

      {/* 板块目录 */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Layers className="w-3.5 h-3.5 text-[#8A4A2B]" />
          <span className="text-[12.5px] font-semibold text-gray-700">板块目录</span>
        </div>
        <ol className="space-y-1.5 text-[12.5px]">
          <li className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#5A2E1C] text-white text-[10px] font-bold shrink-0">A</span>
            <span className="font-medium text-gray-900">角色与归属权限</span>
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">已定</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-gray-300 text-white text-[10px] font-bold shrink-0">B</span>
            <span className="text-gray-500">会员权限</span>
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">待补充</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-gray-300 text-white text-[10px] font-bold shrink-0">C</span>
            <span className="text-gray-500">项目骨架结构</span>
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">待补充</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-gray-300 text-white text-[10px] font-bold shrink-0">D</span>
            <span className="text-gray-500">初始化清单</span>
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">待补充</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#5A2E1C] text-white text-[10px] font-bold shrink-0">E</span>
            <span className="font-medium text-gray-900">多项目登录皮肤路由</span>
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">已定</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#5A2E1C] text-white text-[10px] font-bold shrink-0">F</span>
            <span className="font-medium text-gray-900">图片/视频/文件上传规范</span>
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">已定</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#5A2E1C] text-white text-[10px] font-bold shrink-0">G</span>
            <span className="font-medium text-gray-900">金融数据获取规则</span>
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">已定</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#5A2E1C] text-white text-[10px] font-bold shrink-0">H</span>
            <span className="font-medium text-gray-900">Manus 子项目创建规范</span>
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">已定</span>
          </li>
        </ol>
      </div>

      {/* ===== 板块 A：角色与归属权限 ===== */}
      <div className="flex items-center gap-2 pt-1">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#5A2E1C] text-white text-[10px] font-bold">A</span>
        <span className="text-[13px] font-bold text-[#5A2E1C]">角色与归属权限</span>
      </div>

      {/* 三层角色 */}
      <RuleSection icon={UserCog} title="① 三层角色：统一命名、靠项目区分归属">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <span className="font-semibold text-gray-900">脉动网超级管理员</span>（平台层）：管全平台所有项目、规则库、全局配置，可跨项目看全部数据。
          </li>
          <li>
            <span className="font-semibold text-gray-900">{"{项目名}网站管理员"}</span>（项目层）：如「龙虾网站管理员」「牙伴网站管理员」。只管自己项目内的 UI 设计、会员管理、功能管理等。命名格式统一为「项目名 + 网站管理员」，<span className="text-[#D32F2F] font-medium">不带“版/板”字</span>。
          </li>
          <li>
            <span className="font-semibold text-gray-900">项目成员 / 员工</span>（操作层）：在项目里干具体活，权限由本项目网站管理员分配。
          </li>
          <li className="text-[12px] text-gray-400">
            代码底层：项目管理员角色标识统一用 <span className="font-mono">site_admin</span>，附带 <span className="font-mono">project_id</span> 标明归属哪个项目；<span className="font-semibold text-gray-700">靠 project_id 区分，不靠不同名字</span>，避免多项目混乱。
          </li>
        </ul>
      </RuleSection>

      {/* 用户归属 */}
      <RuleSection icon={Users} title="② 用户归属：统一账号，分项目归属">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            所有用户都是<span className="font-semibold text-gray-900">脉动网统一账号</span>（注册在脉动网，不在各项目单独建账号体系）。
          </li>
          <li>
            通过「<span className="font-semibold text-gray-900">用户 ↔ 项目归属关系</span>」决定每个用户属于哪些项目；一个用户可同时归属多个项目（在龙虾消费过、也在牙伴看过牙）。
          </li>
        </ul>
      </RuleSection>

      {/* 数据隔离 */}
      <RuleSection icon={Lock} title="③ 数据隔离：只能看自己项目名下的用户（核心安全边界）">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <span className="text-[#D32F2F] font-medium">{"{项目名}网站管理员只能看到/调用到“归属于自己项目”的用户"}</span>，绝不能调出整个脉动网的全部用户。
          </li>
          <li>
            查询用户时<span className="font-semibold text-gray-900">强制按 project_id 过滤</span>（写在后端、强制执行，不靠前端自觉）；例如返回/调用用户列表时隐含 <span className="font-mono text-[12px]">WHERE project_id = 本项目</span>。
          </li>
          <li>
            只有<span className="font-semibold text-gray-900">脉动网超级管理员</span>可跨项目看全部用户。
          </li>
        </ul>
      </RuleSection>

      {/* 权限边界 */}
      <RuleSection icon={ShieldCheck} title="④ 权限边界：一切圈定在本项目">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            网站管理员的所有操作（UI、会员、功能、数据）一律<span className="font-semibold text-gray-900">圈定在自己项目范围内</span>，越不出本项目。
          </li>
          <li>
            网站管理员可任命下级（项目成员）并分配其权限，但<span className="font-semibold text-gray-900">不得突破自己项目的边界</span>。
          </li>
        </ul>
      </RuleSection>

      {/* ===== 板块 E：多项目登录皮肤路由 ===== */}
      <div className="flex items-center gap-2 pt-1">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#5A2E1C] text-white text-[10px] font-bold">E</span>
        <span className="text-[13px] font-bold text-[#5A2E1C]">多项目登录皮肤路由</span>
      </div>

      <RuleSection icon={Paintbrush} title="规则起源">
        <p>
          系统内所有项目共用同一套后端认证接口（用户名密码不变），但不同项目的用户应看到与该项目配色一致的登录界面。实现方式为纯前端皮肤切换，零后端改动。
        </p>
      </RuleSection>

      <RuleSection icon={LogIn} title="实现机制（三步）">
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            <span className="font-semibold text-gray-900">退出时写入标记</span>：各项目「退出登录」按钮在清除 token 前，先往{" "}
            <code className="bg-gray-100 px-1 rounded text-[12px]">localStorage</code> 写入{" "}
            <code className="bg-gray-100 px-1 rounded text-[12px]">lastProject = "项目标识符"</code>。
            例如龙虾项目写 <code className="bg-gray-100 px-1 rounded text-[12px]">longxia</code>，牙伴项目写 <code className="bg-gray-100 px-1 rounded text-[12px]">yaban</code>。
          </li>
          <li>
            <span className="font-semibold text-gray-900">登录页读取标记</span>：<code className="bg-gray-100 px-1 rounded text-[12px]">/login</code> 页面启动时读{" "}
            <code className="bg-gray-100 px-1 rounded text-[12px]">localStorage.lastProject</code>，根据值渲染对应项目的 UI 皮肤。
          </li>
          <li>
            <span className="font-semibold text-gray-900">登录成功后清除标记</span>：登录成功跳转后删除{" "}
            <code className="bg-gray-100 px-1 rounded text-[12px]">lastProject</code>，避免干扰下次首次登录逻辑。
          </li>
        </ol>
      </RuleSection>

      <RuleSection icon={Layers} title="皮肤映射表（持续扩充）">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-1 font-semibold text-gray-700">lastProject 值</th>
              <th className="text-left py-1 font-semibold text-gray-700">登录页 UI 皮肤</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-50">
              <td className="py-1.5"><code className="bg-gray-100 px-1 rounded">longxia</code></td>
              <td className="py-1.5">龙虾深红金配色皮肤</td>
            </tr>
            <tr className="border-b border-gray-50">
              <td className="py-1.5"><code className="bg-gray-100 px-1 rounded">yaban</code></td>
              <td className="py-1.5">牙伴蓝白配色皮肤</td>
            </tr>
            <tr>
              <td className="py-1.5">空 / 未设置</td>
              <td className="py-1.5">脉动网默认登录页</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-gray-400">新增项目时，在映射表和登录页皮肤分支中同步新增一行即可。</p>
      </RuleSection>

      <RuleSection icon={ShieldCheck} title="设计原则">
        <ul className="list-disc pl-5 space-y-1">
          <li>用户名密码全局共用，不分项目。</li>
          <li>皮肤仅影响登录页 UI 层，不影响任何认证逻辑。</li>
          <li><code className="bg-gray-100 px-1 rounded text-[12px]">lastProject</code> 不随 token 一起清除，属于 UI 偏好标记而非认证凭证。</li>
          <li>首次登录（无标记）展示默认登录页，不强制跳转。</li>
        </ul>
      </RuleSection>

      {/* ===== 板块 F：图片/视频/文件上传规范 ===== */}
      <div className="flex items-center gap-2 pt-1">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#5A2E1C] text-white text-[10px] font-bold">F</span>
        <span className="text-[13px] font-bold text-[#5A2E1C]">图片/视频/文件上传规范</span>
      </div>

      <RuleSection icon={Upload} title="核心原则：所有上传全部走腾讯云 COS，无需每次再问">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <span className="font-semibold text-gray-900">所有场景</span>——网页图标、品牌图片、用户头像、商品图、设备图、影像资料、内容配图、用户上传的任何文件——
            <span className="text-[#D32F2F] font-medium">一律上传到腾讯云 COS</span>，不允许存放在本地服务器、<code className="bg-gray-100 px-1 rounded text-[12px]">client/public/</code> 目录或任何项目目录内。
          </li>
          <li>
            开发时无需每次询问存在哪里、怎么上传：<span className="font-semibold text-gray-900">默认就是 COS，直接操作。</span>
          </li>
          <li>
            新项目自带的网页图标（logo、icon、banner 等）以及项目内所有涉及上传功能的模块，均直接对接下方 COS 配置，不另起存储方案。
          </li>
        </ul>
      </RuleSection>

      <RuleSection icon={Image} title="COS 存储配置（全项目共用）">
        <div className="bg-gray-50 rounded-xl p-3 font-mono text-[12px] space-y-1 mb-3">
          <div><span className="text-gray-400">Bucket：</span><span className="font-semibold text-gray-800">haoyouji-images-1396946788</span></div>
          <div><span className="text-gray-400">Region：</span><span className="font-semibold text-gray-800">ap-shanghai</span></div>
          <div><span className="text-gray-400">CDN 前缀：</span><span className="font-semibold text-gray-800 break-all">https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/</span></div>
        </div>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            路径命名规范：<code className="bg-gray-100 px-1 rounded text-[12px]">assets/分类/文件名</code>，例如
            <code className="bg-gray-100 px-1 rounded text-[12px] ml-1">assets/icons/doraemon-icon.png</code>、
            <code className="bg-gray-100 px-1 rounded text-[12px] ml-1">assets/avatars/user-123.jpg</code>、
            <code className="bg-gray-100 px-1 rounded text-[12px] ml-1">assets/products/shebei-001.webp</code>。
          </li>
          <li>
            SecretId / SecretKey <span className="text-[#D32F2F] font-medium">仅存于服务端环境变量</span>，严禁写入代码或提交到 Git。
          </li>
        </ul>
      </RuleSection>

      <RuleSection icon={Minimize2} title="图片压缩规则">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <span className="font-semibold text-gray-900">普通图片</span>（图标、头像、商品图、内容配图等）：上传前必须压缩，建议长边不超过 1200px，输出格式优先 WebP，质量 80–85。
          </li>
          <li>
            <span className="font-semibold text-gray-900">医疗影像类原始凭证</span>（X 光、CT、活检报告等）：<span className="text-[#D32F2F] font-medium">不压缩、不转格式</span>，保留原始文件直接上传，确保医疗数据完整性。
          </li>
          <li>
            <span className="font-semibold text-gray-900">视频文件</span>：直接上传原文件，不在服务端转码。
          </li>
        </ul>
      </RuleSection>

      {/* ===== 板块 G：金融数据获取规则 ===== */}
      <div className="flex items-center gap-2 pt-1">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#5A2E1C] text-white text-[10px] font-bold">G</span>
        <span className="text-[13px] font-bold text-[#5A2E1C]">金融数据获取规则</span>
      </div>

            <RuleSection icon={Server} title="核心原则：必须走服务器中转，严禁前端直连">
        <p className="text-[12.5px] text-gray-700 leading-relaxed">
          <span className="font-semibold text-red-600">网络限制铁律</span>：币安、OKX 等主流数字币交易所的 API 在国内网络下被墙，前端直接 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">fetch</span> 会导致请求超时或连接重置。<span className="font-semibold text-gray-900">必须通过 tRPC 走服务器中转</span>（服务器在香港/海外，不受限制）。
        </p>
      </RuleSection>
      <RuleSection icon={Link2} title="通道一：数字币（加密货币） → 服务器 tRPC 拉取">
        <p className="text-[12.5px] text-gray-700 leading-relaxed mb-3">
          服务器端每 3 秒自动拉取价格，缓存在内存中（TTL 5秒）。前端通过 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">trpc.getCryptoPrices</span> 拉取服务器缓存，避免并发请求压垮外部 API。
        </p>
        <p className="text-[12px] font-semibold text-gray-800 mb-1">服务器端三重兜底机制</p>
        <table className="w-full text-[12px] border-collapse mb-3">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">优先级</th>
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">数据源</th>
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-1.5 border border-gray-200 text-gray-700">主</td>
              <td className="p-1.5 border border-gray-200 font-medium">Gate.io / 币安</td>
              <td className="p-1.5 border border-gray-200 text-gray-500 text-[11px]">首选数据源</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="p-1.5 border border-gray-200 text-gray-700">备用</td>
              <td className="p-1.5 border border-gray-200 font-medium">火币 / OKX</td>
              <td className="p-1.5 border border-gray-200 text-gray-500 text-[11px]">主源失败时自动降级</td>
            </tr>
            <tr>
              <td className="p-1.5 border border-gray-200 text-gray-700">兜底</td>
              <td className="p-1.5 border border-gray-200 font-medium">CoinGecko</td>
              <td className="p-1.5 border border-gray-200 text-gray-500 text-[11px]">最终兜底</td>
            </tr>
          </tbody>
        </table>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3">
          <p className="text-[12px] font-bold text-amber-800 mb-1.5">⚠️ 架构铁律：父组件单例拉取，子组件只读 props</p>
          <ul className="text-[12px] text-amber-700 space-y-1.5">
            <li>✅ <span className="font-semibold">正确做法</span>：在页面级父组件（如 FunderManagement）顶层调用一次 <span className="font-mono text-[11px] bg-amber-100 px-1 rounded">trpc.getCryptoPrices</span>，结果放入 <span className="font-mono text-[11px] bg-amber-100 px-1 rounded">livePrices</span> prop 向下传给所有卡片。无论账本里有多少张订单，前端到服务器永远只有 <span className="font-semibold">1 个请求</span>。</li>
            <li>❌ <span className="font-semibold text-red-700">错误做法</span>：在卡片组件（FunderOrderCard 等）内部独立调用价格 hook。N 张卡片 = N 个并发请求，移动端 Safari 超过并发阈值会触发连接重置，导致「因为出现问题，此网页已重新载入」崩溃。</li>
            <li>📌 同理适用于 Deribit 期权数据：行权日/行权价在父组件拉一次，通过 props 传给表单，不在每个卡片实例里独立请求。</li>
          </ul>
        </div>
        <p className="text-[12px] font-semibold text-gray-800 mb-1">自定义币种配置</p>
        <ul className="text-[12px] text-gray-700 space-y-1">
          <li>统一在「实时价格管理」页面（LivePriceAdmin）添加，数据存入 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">custom_crypto_coins</span> 表</li>
          <li>添加后所有设备全局生效，<span className="font-mono text-[11px] bg-gray-100 px-1 rounded">price-scanner</span> 会在下次扫描时自动拉取</li>
        </ul>
      </RuleSection>

      <RuleSection icon={Plug} title="通道二：美股 / 港股 / 黄金 / 石油 / 汇率 → 服务器 tRPC 接口">
        <p className="text-[12.5px] text-gray-700 leading-relaxed mb-3">
          <span className="font-semibold text-red-600">【已弃用】Cloudflare Worker 前端直连方案</span>：经实测，前端直连（含 Worker 代理）在 Safari / iOS WebKit 上会因并发连接数超限触发「WebKit 遇到内部错误」崩溃白屏。<span className="font-semibold text-gray-900">全部改为走服务器 tRPC 接口</span>（<span className="font-mono text-[11px] bg-gray-100 px-1 rounded">trpc.stock.*</span>），服务器统一代理后缓存，前端只读 tRPC 数据。
        </p>
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">资产类型</th>
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">tRPC 接口</th>
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">刷新频率</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-1.5 border border-gray-200">黄金</td>
              <td className="p-1.5 border border-gray-200 font-mono text-[11px]">trpc.stock.getGoldPrice</td>
              <td className="p-1.5 border border-gray-200 text-gray-500">3秒</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="p-1.5 border border-gray-200">石油</td>
              <td className="p-1.5 border border-gray-200 font-mono text-[11px]">trpc.stock.getOilPrice</td>
              <td className="p-1.5 border border-gray-200 text-gray-500">3秒</td>
            </tr>
            <tr>
              <td className="p-1.5 border border-gray-200">美元指数</td>
              <td className="p-1.5 border border-gray-200 font-mono text-[11px]">trpc.stock.getDollarIndex</td>
              <td className="p-1.5 border border-gray-200 text-gray-500">3秒</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="p-1.5 border border-gray-200">离岸人民币</td>
              <td className="p-1.5 border border-gray-200 font-mono text-[11px]">trpc.stock.getUsdCnh</td>
              <td className="p-1.5 border border-gray-200 text-gray-500">3秒</td>
            </tr>
            <tr>
              <td className="p-1.5 border border-gray-200">上证指数</td>
              <td className="p-1.5 border border-gray-200 font-mono text-[11px]">trpc.stock.getShanghaiIndex</td>
              <td className="p-1.5 border border-gray-200 text-gray-500">3秒/60秒</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="p-1.5 border border-gray-200">恒生指数</td>
              <td className="p-1.5 border border-gray-200 font-mono text-[11px]">trpc.stock.getHangSengIndex</td>
              <td className="p-1.5 border border-gray-200 text-gray-500">3秒</td>
            </tr>
            <tr>
              <td className="p-1.5 border border-gray-200">标普500</td>
              <td className="p-1.5 border border-gray-200 font-mono text-[11px]">trpc.stock.getSP500Index</td>
              <td className="p-1.5 border border-gray-200 text-gray-500">3秒/60秒</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="p-1.5 border border-gray-200">美元/人民币汇率</td>
              <td className="p-1.5 border border-gray-200 font-mono text-[11px]">trpc.exchange.getRate</td>
              <td className="p-1.5 border border-gray-200 text-gray-500">60秒</td>
            </tr>
          </tbody>
        </table>
      </RuleSection>

      {/* ===== 板块 H：Manus 子项目创建规范 ===== */}
      <div className="flex items-center gap-2 pt-1">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#5A2E1C] text-white text-[10px] font-bold">H</span>
        <span className="text-[13px] font-bold text-[#5A2E1C]">Manus 子项目创建规范</span>
      </div>

      {/* H-0 概念说明 */}
      <RuleSection icon={Boxes} title="什么是 Manus 子项目">
        <p>
          当脉动网需要一个<span className="font-semibold text-gray-900">功能独立、域名独立</span>的附属工具时，在 Manus 平台上单独创建一个新项目（子项目），与脉动网主站并列运行。子项目有自己的：
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><span className="font-semibold text-gray-900">独立数据库</span>（Manus 托管 TiDB Cloud，与脉动网腾讯云 MySQL 完全分离）</li>
          <li><span className="font-semibold text-gray-900">独立域名</span>（绑定 xxx.jiangyuchen.cn 子域名）</li>
          <li><span className="font-semibold text-gray-900">独立代码仓库</span>（但备份到脉动网同一个 GitHub 仓库的子目录）</li>
          <li><span className="font-semibold text-gray-900">共享用户体系</span>（通过 SSO 单点登录，用脉动网账号登录子项目）</li>
        </ul>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-2">
          <p className="text-[12px] font-semibold text-amber-800">典型举例：奖金制度研究平台（2026年7月）</p>
          <p className="text-[12px] text-amber-700 mt-1">正式域名：<span className="font-mono">bonus.jiangyuchen.cn</span>，Manus 项目 ID：<span className="font-mono">CHKNJmtWXcig3PadPxMzN3</span>，用于直销奖金制度研究与模拟，脉动网积分商城「奖金制度」入口点击后以 iframe 嵌入方式打开，用户无感知。</p>
        </div>
      </RuleSection>

      {/* H-1 创建步骤 */}
      <RuleSection icon={Layers} title="① 创建步骤（在 Manus 上操作）">
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            <span className="font-semibold text-gray-900">在 Manus 新建项目</span>：选择「Web App（tRPC + Manus Auth + Database）」模板，填写项目名称（英文，如 <span className="font-mono text-[12px] bg-gray-100 px-1 rounded">mlm-bonus-system</span>）和描述。
          </li>
          <li>
            <span className="font-semibold text-gray-900">技术栈自动配置</span>：模板自带 React 19 + Tailwind 4 + Express 4 + tRPC 11 + Drizzle ORM + TiDB Cloud（MySQL 兼容），无需手动安装。
          </li>
          <li>
            <span className="font-semibold text-gray-900">关闭 Manus OAuth 登录</span>：子项目不使用 Manus 自己的 OAuth，改为脉动网 SSO。在 <span className="font-mono text-[12px] bg-gray-100 px-1 rounded">server/_core/oauth.ts</span> 新增 <span className="font-mono text-[12px] bg-gray-100 px-1 rounded">/api/auth/external-login</span> 端点（见 H-3）。
          </li>
          <li>
            <span className="font-semibold text-gray-900">设置自定义环境变量</span>：在 Manus 后台 Settings → Secrets 添加 <span className="font-mono text-[12px] bg-gray-100 px-1 rounded">HAOYOUJI_SHARED_SECRET</span>（SSO 共享密钥，见 H-3）。
          </li>
          <li>
            <span className="font-semibold text-gray-900">绑定自定义域名</span>：在 Manus 后台 Settings → Domains 绑定 <span className="font-mono text-[12px] bg-gray-100 px-1 rounded">子项目名.jiangyuchen.cn</span>（见 H-4）。
          </li>
        </ol>
      </RuleSection>

      {/* H-1.5 技术栈对齐规范 */}
      <RuleSection icon={GitBranch} title="① 附：技术栈对齐规范（与脉动网保持一致，合并时零摩擦）">
        <p className="text-[12px] text-gray-500 mb-2">子项目必须与脉动网使用<span className="font-semibold text-gray-900">完全相同的技术栈版本和规范</span>，这样将来合并时前端页面可以直接 copy，后端路由可以直接 merge，不需要重写。</p>

        <p className="text-[12px] font-semibold text-gray-900 mb-1">① 必须使用的核心依赖版本（与脉动网锁定一致）</p>
        <table className="w-full text-[12px] border-collapse mb-2">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">依赖包</th>
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">版本</th>
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">说明</th>
            </tr>
          </thead>
          <tbody>
            <tr><td className="p-1.5 border border-gray-200 font-mono">react</td><td className="p-1.5 border border-gray-200">^19.2.1</td><td className="p-1.5 border border-gray-200 text-gray-500">前端框架</td></tr>
            <tr className="bg-gray-50"><td className="p-1.5 border border-gray-200 font-mono">@trpc/server / client</td><td className="p-1.5 border border-gray-200">^11.6.0</td><td className="p-1.5 border border-gray-200 text-gray-500">API 层，合并时路由直接迁移</td></tr>
            <tr><td className="p-1.5 border border-gray-200 font-mono">drizzle-orm</td><td className="p-1.5 border border-gray-200">^0.44.5</td><td className="p-1.5 border border-gray-200 text-gray-500">ORM，schema 语法一致</td></tr>
            <tr className="bg-gray-50"><td className="p-1.5 border border-gray-200 font-mono">tailwindcss</td><td className="p-1.5 border border-gray-200">^4.1.14</td><td className="p-1.5 border border-gray-200 text-gray-500">样式，合并后视觉一致</td></tr>
            <tr><td className="p-1.5 border border-gray-200 font-mono">@tanstack/react-query</td><td className="p-1.5 border border-gray-200">^5.90.2</td><td className="p-1.5 border border-gray-200 text-gray-500">数据请求层</td></tr>
            <tr className="bg-gray-50"><td className="p-1.5 border border-gray-200 font-mono">wouter</td><td className="p-1.5 border border-gray-200">^3.3.5</td><td className="p-1.5 border border-gray-200 text-gray-500">路由，合并后路径直接复用</td></tr>
            <tr><td className="p-1.5 border border-gray-200 font-mono">zod</td><td className="p-1.5 border border-gray-200">^4.1.12</td><td className="p-1.5 border border-gray-200 text-gray-500">入参校验</td></tr>
            <tr className="bg-gray-50"><td className="p-1.5 border border-gray-200 font-mono">typescript</td><td className="p-1.5 border border-gray-200">5.9.3</td><td className="p-1.5 border border-gray-200 text-gray-500">固定版本，不用 ^</td></tr>
            <tr><td className="p-1.5 border border-gray-200 font-mono">express</td><td className="p-1.5 border border-gray-200">^4.21.2</td><td className="p-1.5 border border-gray-200 text-gray-500">后端框架</td></tr>
          </tbody>
        </table>
        <p className="text-[12px] text-green-700 font-medium mb-3">✅ Manus「Web App（tRPC + Manus Auth + Database）」模板默认就是这套版本，直接用模板即可，无需手动调整。</p>

        <p className="text-[12px] font-semibold text-gray-900 mb-1">② 品牌色与样式规范（必须与脉动网一致）</p>
        <p className="text-[12px] text-gray-600 mb-2">子项目的 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">client/src/index.css</span> 必须使用与脉动网相同的 CSS 变量体系，合并后视觉无缝衔接：</p>
        <table className="w-full text-[12px] border-collapse mb-3">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">变量 / 色值</th>
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">用途</th>
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">备注</th>
            </tr>
          </thead>
          <tbody>
            <tr><td className="p-1.5 border border-gray-200 font-mono">#D32F2F（脉动红）</td><td className="p-1.5 border border-gray-200">主色 / 按钮 / 强调</td><td className="p-1.5 border border-gray-200 text-gray-500">--brand-red</td></tr>
            <tr className="bg-gray-50"><td className="p-1.5 border border-gray-200 font-mono">#CBA471（至尊金）</td><td className="p-1.5 border border-gray-200">装饰边框 / 徽章</td><td className="p-1.5 border border-gray-200 text-gray-500">--brand-gold</td></tr>
            <tr><td className="p-1.5 border border-gray-200 font-mono">#FAF3ED（杏白底）</td><td className="p-1.5 border border-gray-200">全站背景色</td><td className="p-1.5 border border-gray-200 text-gray-500">--bg-cream</td></tr>
            <tr className="bg-gray-50"><td className="p-1.5 border border-gray-200 font-mono">#222222（核心黑）</td><td className="p-1.5 border border-gray-200">主要文字</td><td className="p-1.5 border border-gray-200 text-gray-500">--text-black</td></tr>
            <tr><td className="p-1.5 border border-gray-200 font-mono">#5A2E1C（深棕）</td><td className="p-1.5 border border-gray-200">管理员页面标题</td><td className="p-1.5 border border-gray-200 text-gray-500">规则/后台专用</td></tr>
            <tr className="bg-gray-50"><td className="p-1.5 border border-gray-200 font-mono">Nunito 字体</td><td className="p-1.5 border border-gray-200">全站字体</td><td className="p-1.5 border border-gray-200 text-gray-500">--font-sans，中文降级 PingFang SC</td></tr>
          </tbody>
        </table>

        <p className="text-[12px] font-semibold text-gray-900 mb-1">③ 后端路由命名规范（合并时不冲突）</p>
        <ul className="text-[12px] text-gray-700 space-y-1.5 mb-3">
          <li>子项目的 tRPC 路由文件统一命名为 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">server/子项目代号-router.ts</span>（如 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">server/mlm-bonus-router.ts</span>），<span className="font-semibold text-gray-900">不要直接写在 routers.ts 里</span>，方便合并时整文件 copy</li>
          <li>路由命名空间加子项目前缀，如 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">mlmBonus.getCompanies</span>、<span className="font-mono text-[11px] bg-gray-100 px-1 rounded">mlmBonus.simulate</span>，防止与脉动网现有过程名冲突</li>
          <li>合并时只需在脉动网 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">server/routers.ts</span> 顶部 import 并在 appRouter 里注册一行：<span className="font-mono text-[11px] bg-gray-100 px-1 rounded">mlmBonus: mlmBonusRouter</span></li>
        </ul>

        <p className="text-[12px] font-semibold text-gray-900 mb-1">④ 数据库字段规范（与脉动网 MySQL 兼容）</p>
        <table className="w-full text-[12px] border-collapse mb-3">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">字段类型</th>
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">规范</th>
            </tr>
          </thead>
          <tbody>
            <tr><td className="p-1.5 border border-gray-200">主键 ID</td><td className="p-1.5 border border-gray-200 text-gray-600"><span className="font-mono text-[11px] bg-gray-100 px-1 rounded">int().autoincrement().notNull()</span>，与脉动网一致，合并后外键关联无需转换</td></tr>
            <tr className="bg-gray-50"><td className="p-1.5 border border-gray-200">时间戳</td><td className="p-1.5 border border-gray-200 text-gray-600"><span className="font-mono text-[11px] bg-gray-100 px-1 rounded">timestamp(&#123; mode: 'string' &#125;)</span>，存 UTC 字符串，前端用 new Date(val).toLocaleString() 转本地时间</td></tr>
            <tr><td className="p-1.5 border border-gray-200">短文本</td><td className="p-1.5 border border-gray-200 text-gray-600"><span className="font-mono text-[11px] bg-gray-100 px-1 rounded">varchar(&#123; length: 255 &#125;)</span>，长文本用 text()</td></tr>
            <tr className="bg-gray-50"><td className="p-1.5 border border-gray-200">金额/比例</td><td className="p-1.5 border border-gray-200 text-gray-600"><span className="font-mono text-[11px] bg-gray-100 px-1 rounded">decimal(&#123; precision: 18, scale: 6 &#125;)</span>，不用 float 防精度丢失</td></tr>
            <tr><td className="p-1.5 border border-gray-200">JSON 数据</td><td className="p-1.5 border border-gray-200 text-gray-600"><span className="font-mono text-[11px] bg-gray-100 px-1 rounded">json()</span>，MySQL 原生 JSON 列</td></tr>
            <tr className="bg-gray-50"><td className="p-1.5 border border-gray-200">表命名</td><td className="p-1.5 border border-gray-200 text-gray-600">加子项目前缀，如 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">mlm_companies</span>、<span className="font-mono text-[11px] bg-gray-100 px-1 rounded">mlm_schemes</span>，防止合并时表名冲突</td></tr>
          </tbody>
        </table>

        <p className="text-[12px] font-semibold text-gray-900 mb-1">⑤ 禁止引入的依赖（会与脉动网冲突）</p>
        <ul className="text-[12px] text-[#D32F2F] space-y-1 mb-3">
          <li>❌ <span className="font-mono text-[11px] bg-red-50 px-1 rounded">react-router-dom</span>：脉动网用 wouter，引入会导致路由冲突</li>
          <li>❌ <span className="font-mono text-[11px] bg-red-50 px-1 rounded">axios</span>：统一用 tRPC，不引入额外 HTTP 客户端</li>
          <li>❌ <span className="font-mono text-[11px] bg-red-50 px-1 rounded">moment.js</span>：用原生 Date API 或 date-fns，体积小且无时区问题</li>
          <li>❌ 任何 CSS-in-JS 库（styled-components、emotion）：统一用 Tailwind</li>
        </ul>

        <div className="bg-green-50 border border-green-200 rounded-lg p-2.5">
          <p className="text-[12px] font-semibold text-green-800">✅ 对齐检查清单（新建子项目时逐项确认）</p>
          <ul className="text-[12px] text-green-700 space-y-1 mt-1">
            <li>□ 使用 Manus「Web App（tRPC + Manus Auth + Database）」模板（版本自动对齐）</li>
            <li>□ index.css 已复制脉动网品牌色变量（#D32F2F / #CBA471 / #FAF3ED / Nunito）</li>
            <li>□ 后端路由独立文件，命名加子项目前缀</li>
            <li>□ 数据库表名加子项目前缀（如 mlm_xxx）</li>
            <li>□ 时间戳用 timestamp mode:string，金额用 decimal</li>
            <li>□ 未引入 react-router-dom / axios / moment</li>
          </ul>
        </div>
      </RuleSection>

      {/* H-2 基础设施位置 */}
      <RuleSection icon={Database} title="② 基础设施在哪里找">
        <p className="font-semibold text-gray-900 mb-2">子项目的数据库、服务器、存储桶全部在 Manus 平台，与脉动网腾讯云完全独立：</p>
        <table className="w-full text-[12px] border-collapse mb-3">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">资源</th>
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">位置</th>
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">如何找到</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-1.5 border border-gray-200 font-medium">服务器</td>
              <td className="p-1.5 border border-gray-200">Manus 云（Cloudflare + Cloud Run）</td>
              <td className="p-1.5 border border-gray-200 text-gray-500">Manus 后台 Dashboard 面板，无需 SSH</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="p-1.5 border border-gray-200 font-medium">数据库</td>
              <td className="p-1.5 border border-gray-200">TiDB Cloud（AWS us-east-1）</td>
              <td className="p-1.5 border border-gray-200 text-gray-500">Manus 后台 Database 面板，点左下角设置查看连接串</td>
            </tr>
            <tr>
              <td className="p-1.5 border border-gray-200 font-medium">存储桶</td>
              <td className="p-1.5 border border-gray-200">Manus S3 对象存储</td>
              <td className="p-1.5 border border-gray-200 text-gray-500">代码中用 storagePut/storageGet 操作，无需手动登录控制台</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="p-1.5 border border-gray-200 font-medium">环境变量</td>
              <td className="p-1.5 border border-gray-200">Manus Secrets</td>
              <td className="p-1.5 border border-gray-200 text-gray-500">Manus 后台 Settings → Secrets</td>
            </tr>
            <tr>
              <td className="p-1.5 border border-gray-200 font-medium">域名/SSL</td>
              <td className="p-1.5 border border-gray-200">Cloudflare（自动）</td>
              <td className="p-1.5 border border-gray-200 text-gray-500">Manus 后台 Settings → Domains</td>
            </tr>
          </tbody>
        </table>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
          <p className="text-[12px] font-semibold text-blue-800 mb-1">奖金平台举例（CHKNJmtWXcig3PadPxMzN3）</p>
          <div className="text-[12px] text-blue-700 space-y-0.5 font-mono">
            <div>数据库：TiDB Cloud · gateway03.us-east-1.prod.aws.tidbcloud.com:4000</div>
            <div>数据库名：CHKNJmtWXcig3PadPxMzN3（与项目 ID 同名）</div>
            <div>服务器：Autoscale 模式，min-instances=0，闲置自动休眠</div>
            <div>存储桶：Manus S3，通过 BUILT_IN_FORGE_API_KEY 鉴权</div>
          </div>
        </div>
        <p className="text-[12px] text-gray-500 mt-2">
          <span className="text-[#D32F2F] font-medium">注意</span>：子项目数据库与脉动网腾讯云 MySQL（124.223.54.69:3306 / crm_db）完全独立，互不影响。脉动网的用户数据仍在腾讯云，子项目只存子项目自己的业务数据。
        </p>
      </RuleSection>

      {/* H-3 SSO 单点登录 */}
      <RuleSection icon={Fingerprint} title="③ SSO 单点登录实现（HMAC 签名方案）">
        <p className="mb-2">子项目不建立独立账号体系，用户必须从脉动网跳入，自动登录。实现方式为 HMAC-SHA256 签名验证，两端共享一个密钥。</p>
        <p className="font-semibold text-gray-900 mb-1">完整流程：</p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>用户在脉动网点击入口（如积分商城「奖金制度」）</li>
          <li>脉动网前端调用后端 <span className="font-mono text-[12px] bg-gray-100 px-1 rounded">trpc.auth.mlmSsoLink</span> 生成签名链接</li>
          <li>脉动网后端用 HMAC-SHA256 对 <span className="font-mono text-[12px] bg-gray-100 px-1 rounded">uid:name:ts</span> 签名，ts 为当前 Unix 时间戳（秒）</li>
          <li>生成跳转 URL：<span className="font-mono text-[12px] bg-gray-100 px-1 rounded break-all">https://子项目域名/api/auth/external-login?uid=xxx&name=xxx&ts=xxx&sign=xxx&redirect=/</span></li>
          <li>子项目验证签名（有效期 5 分钟，防重放），验证通过后写入 session，用户自动登录</li>
        </ol>
        <div className="bg-gray-50 rounded-xl p-3 mt-3 font-mono text-[12px] space-y-1">
          <div className="text-gray-500">// 脉动网后端（server/routers.ts）生成签名</div>
          <div>const ts = Math.floor(Date.now() / 1000).toString();</div>
          <div>const msg = <span className="text-green-700">`$&#123;uid&#125;:$&#123;name&#125;:$&#123;ts&#125;`</span>;</div>
          <div>const sign = hmac(<span className="text-green-700">HAOYOUJI_SHARED_SECRET</span>, msg);</div>
          <div className="text-gray-500 mt-1">// 子项目后端（server/_core/oauth.ts）验证签名</div>
          <div>const age = Date.now()/1000 - Number(ts);</div>
          <div>if (age &gt; 300) throw <span className="text-red-600">"链接已过期"</span>;</div>
          <div>if (sign !== expectedSign) throw <span className="text-red-600">"签名无效"</span>;</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-3">
          <p className="text-[12px] font-semibold text-amber-800">奖金平台举例</p>
          <ul className="text-[12px] text-amber-700 space-y-1 mt-1">
            <li>共享密钥：<span className="font-mono">mlm-bonus-shared-secret-2026</span>（两端环境变量 HAOYOUJI_SHARED_SECRET 必须一致）</li>
            <li>脉动网代码：<span className="font-mono">server/routers.ts</span> → <span className="font-mono">auth.mlmSsoLink</span> 过程</li>
            <li>子项目代码：<span className="font-mono">server/_core/oauth.ts</span> → <span className="font-mono">/api/auth/external-login</span> 端点</li>
            <li>iframe 嵌入页：<span className="font-mono">client/src/pages/MlmBonusPage.tsx</span>（脉动网 /mlm-bonus 路径）</li>
          </ul>
        </div>
        <p className="text-[12px] text-gray-500 mt-2">
          子项目还需在 <span className="font-mono">server/_core/index.ts</span> 添加 CSP 响应头，允许脉动网域名 iframe 嵌入：<span className="font-mono text-[11px] bg-gray-100 px-1 rounded">frame-ancestors 'self' https://jiangyuchen.cn https://www.jiangyuchen.cn</span>。
        </p>
      </RuleSection>

      {/* H-4 自定义域名 */}
      <RuleSection icon={Globe} title="④ 自定义域名绑定">
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            <span className="font-semibold text-gray-900">腾讯云 DNS 添加 CNAME 记录</span>：
            <div className="bg-gray-50 rounded-lg p-2 mt-1 font-mono text-[12px]">
              <div>主机记录：<span className="font-semibold">子项目名</span>（如 <span className="text-blue-700">bonus</span>）</div>
              <div>记录类型：<span className="font-semibold">CNAME</span></div>
              <div>记录值：<span className="font-semibold">Manus 自动域名</span>（如 <span className="text-blue-700">mlmbonus-chknjmtw.manus.space</span>）</div>
            </div>
          </li>
          <li>
            <span className="font-semibold text-gray-900">Manus 后台绑定</span>：Settings → Domains → 填入 <span className="font-mono text-[12px] bg-gray-100 px-1 rounded">子项目名.jiangyuchen.cn</span> → 保存。SSL 证书由 Cloudflare 自动签发，无需手动操作。
          </li>
          <li>
            <span className="font-semibold text-gray-900">验证</span>：等待 DNS 生效（通常 5 分钟内），访问 <span className="font-mono text-[12px] bg-gray-100 px-1 rounded">https://子项目名.jiangyuchen.cn</span> 确认正常。
          </li>
        </ol>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-2">
          <p className="text-[12px] font-semibold text-amber-800">奖金平台举例</p>
          <p className="text-[12px] text-amber-700 mt-1">腾讯云 DNS：<span className="font-mono">bonus</span> CNAME → <span className="font-mono">mlmbonus-chknjmtw.manus.space</span><br/>最终访问地址：<span className="font-mono">https://bonus.jiangyuchen.cn</span></p>
        </div>
      </RuleSection>

      {/* H-5 代码备份规范 */}
      <RuleSection icon={FolderGit2} title="⑤ 代码备份到 GitHub 同一仓库">
        <p>
          子项目代码<span className="font-semibold text-gray-900">不单独建 GitHub 仓库</span>，统一备份到脉动网同一个仓库（<span className="font-mono text-[12px] bg-gray-100 px-1 rounded">runyi329/haoyouji-web</span>）的子目录，保持所有项目代码集中管理。
        </p>
        <p className="font-semibold text-gray-900 mt-2 mb-1">备份目录结构：</p>
        <div className="bg-gray-50 rounded-xl p-3 font-mono text-[12px] space-y-0.5">
          <div>runyi329/haoyouji-web/</div>
          <div className="pl-4">backups/</div>
          <div className="pl-8 text-blue-700">mlm-bonus-system/          ← 奖金平台备份</div>
          <div className="pl-12">client/src/                ← 前端源码</div>
          <div className="pl-12">server/                    ← 后端源码</div>
          <div className="pl-12">drizzle/                   ← 数据库 schema</div>
          <div className="pl-12 text-[#CBA471]">项目说明文档.md            ← 必须有！</div>
          <div className="pl-8">下一个子项目/</div>
          <div className="pl-12">...</div>
        </div>
        <p className="font-semibold text-gray-900 mt-2 mb-1">备份操作步骤：</p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>在 <span className="font-mono text-[12px] bg-gray-100 px-1 rounded">/home/ubuntu/haoyouji-web-fresh/backups/子项目名/</span> 创建目录</li>
          <li>将子项目的 <span className="font-mono text-[12px] bg-gray-100 px-1 rounded">client/src/</span>、<span className="font-mono text-[12px] bg-gray-100 px-1 rounded">server/</span>、<span className="font-mono text-[12px] bg-gray-100 px-1 rounded">drizzle/</span>、<span className="font-mono text-[12px] bg-gray-100 px-1 rounded">shared/</span> 复制过来</li>
          <li>写好「项目说明文档.md」（见 H-6）</li>
          <li>按脉动网推送规范提交：<span className="font-mono text-[12px] bg-gray-100 px-1 rounded">git pull --rebase → pnpm check → git push</span></li>
        </ol>
        <p className="text-[12px] text-gray-500 mt-2">备份不含 node_modules、.git、.manus-logs 等目录，恢复后需执行 pnpm install。</p>

        {/* 备份不触发部署的配置 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 mt-3">
          <p className="text-[12px] font-semibold text-blue-800">🛡️ 备份推送不会触发脉动网自动部署</p>
          <p className="text-[12px] text-blue-700 mt-1">脉动网的 <span className="font-mono">.github/workflows/bg-deploy.yml</span> 已配置 <span className="font-mono">paths-ignore</span>，<span className="font-semibold">仅 backups/** 的推送不会触发自动部署</span>。其他文件（包括规则文档 rulesData.tsx）修改后仍会正常触发部署。</p>
          <p className="text-[12px] font-semibold text-blue-800 mt-2">如何恢复触发？</p>
          <p className="text-[12px] text-blue-700 mt-0.5">若将来需要备份推送也触发部署，将 <span className="font-mono">bg-deploy.yml</span> 第 6-7 行的 <span className="font-mono">paths-ignore</span> 块删除即可恢复原行为。</p>
        </div>

        {/* 自动备份方案 */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-3">
          <p className="text-[12px] font-semibold text-amber-800">⚠️ 备份是手动的，不是自动的</p>
          <p className="text-[12px] text-amber-700 mt-1">Manus 沙箱是临时环境，没有常驻进程可以监听代码改动并自动推送。<span className="font-semibold text-amber-800">每次开发结束时，必须手动说一句话触发备份。</span></p>
          <p className="text-[12px] font-semibold text-amber-800 mt-2">触发备份的方式</p>
          <p className="text-[12px] text-amber-700 mt-0.5">只需对 AI 说一个字：<span className="font-mono bg-white px-1 rounded border border-amber-200 font-bold text-amber-900">「备份」</span>，AI 就会自动完成以下所有步骤：
          </p>
          <div className="bg-white rounded p-2 mt-1 font-mono text-[11px] border border-amber-100">
            <div>cp -r /home/ubuntu/子项目名/... haoyouji-web/backups/子项目名/</div>
            <div>cd haoyouji-web && git add backups/</div>
            <div>git commit -m "backup: 更新奖金平台代码 $(date +%Y-%m-%d)"</div>
            <div>git push origin main</div>
          </div>
          <p className="text-[12px] text-amber-700 mt-1.5">✅ 推送后不会触发脉动网部署（paths-ignore 已屏蔽）。</p>
        </div>
      </RuleSection>

      {/* H-6 项目说明文档 */}
      <RuleSection icon={BookMarked} title="⑥ 项目说明文档必须包含的内容">
        <p>每个子项目必须在备份目录里放一份「项目说明文档.md」，内容要覆盖以下所有章节，<span className="text-[#D32F2F] font-medium">缺一不可</span>：</p>
        <table className="w-full text-[12px] border-collapse mt-2">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">章节</th>
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">必须包含的内容</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-1.5 border border-gray-200 font-medium">项目基本信息</td>
              <td className="p-1.5 border border-gray-200 text-gray-600">项目名、Manus 项目 ID、创建时间、定位说明</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="p-1.5 border border-gray-200 font-medium">访问地址</td>
              <td className="p-1.5 border border-gray-200 text-gray-600">正式域名、Manus 自动域名（两个都写）</td>
            </tr>
            <tr>
              <td className="p-1.5 border border-gray-200 font-medium">基础设施</td>
              <td className="p-1.5 border border-gray-200 text-gray-600">数据库连接串、服务器位置、存储桶说明</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="p-1.5 border border-gray-200 font-medium">环境变量</td>
              <td className="p-1.5 border border-gray-200 text-gray-600">所有 Secrets 的键名、值、用途（含自定义变量）</td>
            </tr>
            <tr>
              <td className="p-1.5 border border-gray-200 font-medium">自定义域名</td>
              <td className="p-1.5 border border-gray-200 text-gray-600">腾讯云 DNS 记录配置 + Manus 绑定说明</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="p-1.5 border border-gray-200 font-medium">SSO 对接</td>
              <td className="p-1.5 border border-gray-200 text-gray-600">完整流程图、共享密钥、相关代码文件位置</td>
            </tr>
            <tr>
              <td className="p-1.5 border border-gray-200 font-medium">沙箱恢复步骤</td>
              <td className="p-1.5 border border-gray-200 text-gray-600">沙箱丢失后 4 步完整恢复流程（见 H-7）</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="p-1.5 border border-gray-200 font-medium">功能模块</td>
              <td className="p-1.5 border border-gray-200 text-gray-600">每个页面/引擎的文件路径和功能说明</td>
            </tr>
          </tbody>
        </table>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-2">
          <p className="text-[12px] font-semibold text-amber-800">奖金平台举例</p>
          <p className="text-[12px] text-amber-700 mt-1">文档位置：<span className="font-mono">runyi329/haoyouji-web → backups/mlm-bonus-system/项目说明文档.md</span><br/>最后更新：2026年7月12日，共 11 章节，含所有环境变量值和数据库连接串。</p>
        </div>
      </RuleSection>

      {/* H-7 沙箱丢失恢复 */}
      <RuleSection icon={RefreshCw} title="⑦ 沙箱丢失后如何恢复（4步）">
        <p className="text-[12px] text-gray-500 mb-2">Manus 沙箱是临时环境，可能因超时、休眠等原因丢失本地代码。但线上网站和数据库不受影响，始终正常运行。</p>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            <span className="font-semibold text-gray-900">找回 Manus 项目</span>：登录 Manus，在历史任务或项目列表中找到子项目（凭项目 ID 或名称）。线上网站和数据库完全不受影响，继续正常运行。
          </li>
          <li>
            <span className="font-semibold text-gray-900">克隆代码到新沙箱</span>：
            <div className="bg-gray-50 rounded-lg p-2 mt-1 font-mono text-[12px]">
              <div>cd /home/ubuntu</div>
              <div>gh repo clone runyi329/haoyouji-web</div>
              <div>cp -r haoyouji-web/backups/子项目名/ 子项目名/</div>
              <div>cd 子项目名 && pnpm install</div>
            </div>
          </li>
          <li>
            <span className="font-semibold text-gray-900">确认环境变量</span>：在 Manus 后台 Settings → Secrets 确认所有自定义变量已设置（特别是 HAOYOUJI_SHARED_SECRET）。系统变量（DATABASE_URL、JWT_SECRET 等）由 Manus 自动注入，无需手动配置。
          </li>
          <li>
            <span className="font-semibold text-gray-900">确认域名绑定</span>：在 Manus 后台 Settings → Domains 确认自定义域名已绑定。若绑定丢失，重新按 H-4 操作。
          </li>
        </ol>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-2">
          <p className="text-[12px] font-semibold text-amber-800">奖金平台举例</p>
          <p className="text-[12px] text-amber-700 mt-1">告诉新沙箱的 AI：「帮我从 GitHub runyi329/haoyouji-web 仓库的 backups/mlm-bonus-system/ 目录恢复奖金制度研究平台（Manus 项目 ID：CHKNJmtWXcig3PadPxMzN3），继续开发」，AI 即可按项目说明文档完整恢复。</p>
        </div>
      </RuleSection>

      {/* H-8 将来合并到脉动网主站 - 详细指南 */}
      <RuleSection icon={GitBranch} title="⑧ 合并到脉动网主站 — 完整操作指南">

        {/* 合并时机 */}
        <div className="bg-gradient-to-br from-[#1A2B4A] to-[#243660] rounded-xl p-3 text-white mb-3">
          <p className="text-[12px] font-semibold text-[#E0B97D] mb-1">何时合并？满足以下任一条件即可启动</p>
          <ul className="text-[12px] text-white/80 space-y-1">
            <li>• 子项目日活用户稳定 &gt; 50 人，需要与主站用户体系深度整合</li>
            <li>• 功能与主站高度重叠，维护两套代码成本过高</li>
            <li>• 需要使用主站的积分、会员、通知等核心能力</li>
            <li>• 用户反馈 SSO 跳转体验不佳，希望无缝切换</li>
          </ul>
        </div>

        {/* 合并前检查 */}
        <p className="text-[12px] font-semibold text-gray-900 mb-1">▶ 合并前必做检查（避免返工）</p>
        <table className="w-full text-[12px] border-collapse mb-3">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">检查项</th>
              <th className="text-left p-1.5 font-semibold text-gray-700 border border-gray-200">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr><td className="p-1.5 border border-gray-200">技术栈版本一致</td><td className="p-1.5 border border-gray-200 text-gray-600">对照 H-1.5 检查清单，确认 react/tRPC/drizzle/tailwind 版本与脉动网一致</td></tr>
            <tr className="bg-gray-50"><td className="p-1.5 border border-gray-200">路由命名无冲突</td><td className="p-1.5 border border-gray-200 text-gray-600">在脉动网 server/routers.ts 搜索子项目前缀，确认无同名过程</td></tr>
            <tr><td className="p-1.5 border border-gray-200">表名无冲突</td><td className="p-1.5 border border-gray-200 text-gray-600">在脉动网 drizzle/schema.ts 搜索子项目表名前缀，确认无重名</td></tr>
            <tr className="bg-gray-50"><td className="p-1.5 border border-gray-200">数据已备份</td><td className="p-1.5 border border-gray-200 text-gray-600">从 Manus 后台 Database 面板导出子项目全量数据，本地保存</td></tr>
            <tr><td className="p-1.5 border border-gray-200">脉动网代码已拉最新</td><td className="p-1.5 border border-gray-200 text-gray-600">cd haoyouji-web && git pull --rebase，确保基于最新代码操作</td></tr>
          </tbody>
        </table>

        {/* 第一阶段：前端合并 */}
        <p className="text-[12px] font-bold text-[#D32F2F] mb-1">第一阶段：前端合并</p>
        <ol className="text-[12px] text-gray-700 list-decimal pl-5 space-y-2 mb-3">
          <li>
            <span className="font-semibold text-gray-900">复制页面文件</span>：将子项目 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">client/src/pages/</span> 下所有页面文件复制到脉动网同路径。若有同名文件，先重命名加子项目前缀（如 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">MlmHome.tsx</span>）。
          </li>
          <li>
            <span className="font-semibold text-gray-900">复制组件文件</span>：将子项目 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">client/src/components/</span> 下的专属组件复制到脉动网同路径，跳过已存在的通用组件（Button、Card 等）。
          </li>
          <li>
            <span className="font-semibold text-gray-900">修改 tRPC 调用路径</span>：子项目页面里的 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">trpc.xxx.useQuery()</span> 改为 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">trpc.mlmBonus.xxx.useQuery()</span>（加上子项目命名空间前缀）。
          </li>
          <li>
            <span className="font-semibold text-gray-900">删除 SSO 相关代码</span>：删除子项目页面里的 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">Login.tsx</span>、外部登录跳转逻辑，改为直接使用脉动网的 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">useAuth()</span> 获取当前用户。
          </li>
          <li>
            <span className="font-semibold text-gray-900">注册路由</span>：在脉动网 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">client/src/App.tsx</span> 添加路由，如：
            <div className="bg-gray-50 rounded-lg p-2 mt-1 font-mono text-[11px]">
              <div>{`<Route path="/mlm-bonus" component={MlmHome} />`}</div>
              <div>{`<Route path="/mlm-bonus/:id" component={MlmDetail} />`}</div>
            </div>
          </li>
          <li>
            <span className="font-semibold text-gray-900">在脉动网导航中添加入口</span>：在侧边栏或首页积分商城区域添加跳转链接，替换原来的 iframe 入口。
          </li>
        </ol>

        {/* 第二阶段：后端合并 */}
        <p className="text-[12px] font-bold text-[#D32F2F] mb-1">第二阶段：后端合并</p>
        <ol className="text-[12px] text-gray-700 list-decimal pl-5 space-y-2 mb-3">
          <li>
            <span className="font-semibold text-gray-900">复制路由文件</span>：将子项目 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">server/mlm-bonus-router.ts</span> 复制到脉动网 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">server/</span> 目录。
          </li>
          <li>
            <span className="font-semibold text-gray-900">修改路由文件中的 import 路径</span>：将路由文件顶部的 import 路径（如 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">../_core/trpc</span>）调整为脉动网的相对路径。
          </li>
          <li>
            <span className="font-semibold text-gray-900">删除 SSO 验证端点</span>：删除或注释掉 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">/api/auth/external-login</span> 端点，以及 HMAC 签名验证逻辑。
          </li>
          <li>
            <span className="font-semibold text-gray-900">替换用户来源</span>：路由文件里所有通过 JWT 解析用户 ID 的地方，改为直接读 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">ctx.user.id</span>（脉动网 protectedProcedure 自动注入）。
          </li>
          <li>
            <span className="font-semibold text-gray-900">在主路由注册</span>：在脉动网 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">server/routers.ts</span> 顶部 import，并在 appRouter 里加一行：
            <div className="bg-gray-50 rounded-lg p-2 mt-1 font-mono text-[11px]">
              <div>import {'{ mlmBonusRouter }'} from "./mlm-bonus-router";</div>
              <div className="mt-1">// 在 appRouter 的 router({`{...}`}) 里加：</div>
              <div>mlmBonus: mlmBonusRouter,</div>
            </div>
          </li>
          <li>
            <span className="font-semibold text-gray-900">删除脉动网中的 SSO 生成端点</span>：删除 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">server/routers.ts</span> 里的 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">auth.mlmSsoLink</span> 过程（约第 2790 行），以及 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">HAOYOUJI_SHARED_SECRET</span> 环境变量的使用。
          </li>
        </ol>

        {/* 第三阶段：数据库迁移 */}
        <p className="text-[12px] font-bold text-[#D32F2F] mb-1">第三阶段：数据库迁移</p>
        <ol className="text-[12px] text-gray-700 list-decimal pl-5 space-y-2 mb-3">
          <li>
            <span className="font-semibold text-gray-900">导出子项目数据</span>：在 Manus 后台 Database 面板，对每张业务表执行导出，或通过 TiDB Cloud 控制台导出 SQL dump。
          </li>
          <li>
            <span className="font-semibold text-gray-900">合并 Schema 定义</span>：将子项目 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">drizzle/schema.ts</span> 里的表定义（<span className="font-mono text-[11px] bg-gray-100 px-1 rounded">mlm_companies</span> 等）追加到脉动网 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">drizzle/schema.ts</span> 末尾。
          </li>
          <li>
            <span className="font-semibold text-gray-900">生成并执行迁移 SQL</span>：
            <div className="bg-gray-50 rounded-lg p-2 mt-1 font-mono text-[11px]">
              <div>pnpm drizzle-kit generate  # 生成迁移 SQL</div>
              <div className="text-gray-400"># 读取生成的 .sql 文件，在脉动网 Database 面板执行</div>
            </div>
          </li>
          <li>
            <span className="font-semibold text-gray-900">导入历史数据</span>：将第 1 步导出的数据，通过脉动网 Database 面板或 MySQL 客户端导入到对应表。注意：<span className="text-[#D32F2F] font-medium">用户 ID 字段需要映射</span>——子项目的用户 ID 是脉动网通过 SSO 传入的，与脉动网 users 表的 ID 一致，无需转换。
          </li>
          <li>
            <span className="font-semibold text-gray-900">验证数据完整性</span>：执行几条关键查询，确认记录数、关键字段值与子项目原数据库一致。
          </li>
        </ol>

        {/* 第四阶段：域名与收尾 */}
        <p className="text-[12px] font-bold text-[#D32F2F] mb-1">第四阶段：域名处理与收尾</p>
        <ol className="text-[12px] text-gray-700 list-decimal pl-5 space-y-2 mb-3">
          <li>
            <span className="font-semibold text-gray-900">冒烟测试</span>：在脉动网开发环境完整走一遍子项目的核心功能，确认数据读写、用户权限、页面跳转均正常。
          </li>
          <li>
            <span className="font-semibold text-gray-900">部署脉动网</span>：提交代码，推送到 GitHub，等待 GitHub Actions 自动部署完成（绿灯 ✅）。
          </li>
          <li>
            <span className="font-semibold text-gray-900">设置 301 重定向</span>：在腾讯云 DNS 将 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">子项目名.jiangyuchen.cn</span> 的 CNAME 改为指向脉动网，或在 Nginx/Cloudflare 配置 301 重定向到 <span className="font-mono text-[11px] bg-gray-100 px-1 rounded">jiangyuchen.cn/对应路径</span>，保留旧链接 6 个月可访问。
          </li>
          <li>
            <span className="font-semibold text-gray-900">归档子项目</span>：在 Manus 后台将子项目设为不可见（Settings → General → Visibility: Private），保留 30 天后确认无问题再删除。
          </li>
          <li>
            <span className="font-semibold text-gray-900">更新项目说明文档</span>：在 GitHub 备份目录的「项目说明文档.md」末尾追加「合并记录」章节，写明合并日期、合并到脉动网的哪个路径、数据迁移情况。
          </li>
        </ol>

        {/* 奖金平台举例 */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3">
          <p className="text-[12px] font-semibold text-amber-800">奖金平台（bonus.jiangyuchen.cn）合并举例</p>
          <ul className="text-[12px] text-amber-700 space-y-1 mt-1">
            <li>• 前端：pages/simulators/ 下各公司模拟器页面 → 脉动网 /mlm-bonus/* 路由</li>
            <li>• 后端：server/mlm-bonus-router.ts + server/mlm-bonus-engine.ts → 脉动网 mlmBonus 命名空间</li>
            <li>• 数据库：mlm_companies / mlm_schemes / mlm_simulations 三张表 → 脉动网 MySQL</li>
            <li>• 删除：auth.mlmSsoLink 过程、HAOYOUJI_SHARED_SECRET 环境变量、MlmBonusPage.tsx iframe 入口</li>
            <li>• 域名：bonus.jiangyuchen.cn → 301 → jiangyuchen.cn/mlm-bonus</li>
          </ul>
        </div>

        {/* 合并检查清单 */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-2.5">
          <p className="text-[12px] font-semibold text-green-800">✅ 合并完成检查清单（逐项确认后才算完成）</p>
          <ul className="text-[12px] text-green-700 space-y-1 mt-1">
            <li>□ 前端页面在脉动网路由下正常渲染，无白屏/报错</li>
            <li>□ 登录用户可正常读写数据，未登录用户被正确拦截</li>
            <li>□ 历史数据已导入，记录数与原数据库一致</li>
            <li>□ 旧域名 301 重定向已生效（浏览器访问旧域名自动跳转）</li>
            <li>□ 子项目在 Manus 已设为不可见</li>
            <li>□ 项目说明文档已追加合并记录章节</li>
            <li>□ 脉动网 routers.ts 中 SSO 生成端点已删除</li>
          </ul>
        </div>
      </RuleSection>

      <p className="text-center text-[11px] text-gray-300 pt-1">
        规则 005 · 项目创建规则 · 仅超级管理员可见
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
  {
    id: "002",
    title: "邮箱配置·数据导出·数据导入",
    summary:
      "三合一：①邮箱配置（发件统一 SMTP、收件调用脉动网绑定邮箱）②数据导出（参照牙伴 A580 五步轻模板）③数据导入存档。",
    content: <EmailConfigRuleContent />,
  },
  {
    id: "003",
    title: "返回·刷新·保存·提示",
    summary:
      "通用交互规范：①返回按钮从哪来回哪去 ②刷新强制整页重载 ③保存有正反馈且再进为只读展示态 ④提示默认居中显示。",
    content: <UIInteractionRuleContent />,
  },
  {
    id: "004",
    title: "开发预览与部署纪律",
    summary:
      "实时热修改与部署纪律：①预览端口锁定3000、占用则杀进程腾出绝不顺延 ②临时地址不变不重发、不可放桌面 ③地址变更须显式提示给新址 ④未提交改动口头播报、满10次提醒 ⑤绝对禁止AI自行提交部署 ⑥统一推送 runyi329/haoyouji-web · main 自动部署。",
    content: <DevPreviewDeployRuleContent />,
  },
  {
    id: "005",
    title: "项目创建规则",
    summary:
      "新建项目总规范：A角色与归属权限 B会员权限 C项目骨架 D初始化清单 E多项目登录皮肤路由 F图片/视频/文件上传规范 G金融数据获取规则 H Manus子项目创建规范（独立项目+SSO单点登录+自定义域名+代码备份+说明文档+沙箱恢复+合并路径，以奖金平台bonus.jiangyuchen.cn为举例）。",
    content: <ProjectCreationRuleContent />,
  },
  {
    id: "006",
    title: "企业微信 AI API 绑定规则",
    summary:
      "企微 AI 全部 API 配置与换账号指南：①企微应用配置（不随 AI 账号变化）②Manus API Key 及任务 ID 绑定方式③DeepSeek API Key 配置④换 Manus 账号的完整步骤⑤换 DeepSeek 账号的完整步骤⑥服务器 .env 完整 AI 配置参考。",
    content: <WeComAIBindingRuleContent />,
  },
];

/** ===== 006 · 企业微信 AI API 绑定规则 详情正文 ===== */
function WeComAIBindingRuleContent() {
  return (
    <>
      {/* 概述 */}
      <div className="bg-gradient-to-br from-[#1A2B4A] to-[#243660] rounded-2xl p-4 text-white shadow-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <Bot className="w-5 h-5 text-[#CBA471]" />
          <span className="font-bold text-base">企业微信 AI API 绑定规则</span>
        </div>
        <p className="text-sm text-white/80 leading-relaxed">
          本规则记录企业微信 AI 功能所需的全部 API 配置项、当前绑定的账号信息，以及更换 Manus / DeepSeek 账号时需要修改哪些地方。换账号时，将本规则发给新 AI 即可快速完成迁移。
        </p>
      </div>

      {/* 一、企业微信配置 */}
      <RuleSection icon={Server} title="一、企业微信应用配置（不随 AI 账号变化）">
        <p className="text-xs text-gray-500 mb-2">以下配置绑定的是腾讯企业微信应用本身，与 AI 账号无关，换 AI 账号时无需修改。</p>
        <div className="bg-gray-50 rounded-xl p-3 space-y-2 font-mono text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">WECOM_CORP_ID</span>
            <span className="text-gray-900 font-semibold">wwbbaccf1da5f886d9</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">WECOM_AGENT_ID</span>
            <span className="text-gray-900 font-semibold">1000002</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">WECOM_SECRET</span>
            <span className="text-gray-900 font-semibold break-all">3-XQAnU8_8iKPA74O6_Gw3YQPdOIA2nIv4ILXpxcZ2g</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">WECOM_TOKEN</span>
            <span className="text-gray-900 font-semibold">pEhNzolV5wrJ7Xk7</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">WECOM_ENCODING_AES_KEY</span>
            <span className="text-gray-900 font-semibold break-all">myX82WWfAVfunhJyaLrqIyZozz1q7f8hVx1t4rSDKAy</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">获取路径：企业微信管理后台 → 应用管理 → 自建应用 → 选择对应应用 → 查看 AgentID / Secret / 回调配置。</p>
      </RuleSection>

      {/* 二、Manus 配置 */}
      <RuleSection icon={Key} title="二、Manus API 配置">
        <p className="text-xs text-gray-500 mb-2">Manus 负责处理需要联网搜索、生成图片/视频/PPT 等复杂任务（Max / 标准 / 轻量模式）。</p>
        <div className="bg-gray-50 rounded-xl p-3 space-y-2 font-mono text-xs">
          <div>
            <span className="text-gray-500">MANUS_API_KEY（当前）</span>
            <div className="text-gray-900 font-semibold break-all mt-1">sk-CR8TOKZLGtXfij6m_2UNN8XQcjq75tcEYTtYv6Y9mWm3-bGLAxU54FiOK4IESdLl_Xcr1FVbceWQJD4XaNv4lNYnsxqw</div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3 mb-1 font-semibold">Key 获取方式：</p>
        <ol className="list-decimal pl-5 space-y-1 text-xs text-gray-600">
          <li>登录 <span className="font-mono text-[#1A2B4A]">manus.im</span>，进入「设置」→「API」</li>
          <li>点击「生成 API Key」，复制完整 Key（以 sk- 开头）</li>
          <li>注意：Key 只显示一次，生成后立即复制保存</li>
        </ol>
        <p className="text-xs text-gray-500 mt-3 mb-1 font-semibold">每个用户还需要绑定 Manus 任务 ID：</p>
        <ol className="list-decimal pl-5 space-y-1 text-xs text-gray-600">
          <li>在 Manus 里创建一个新任务（对话）</li>
          <li>从浏览器地址栏复制任务 ID（URL 中 /task/ 后面的字符串）</li>
          <li>在「AI 管理 → 企微AI → 用户 Tab」里，找到对应用户，填入任务 ID 并保存</li>
        </ol>
      </RuleSection>

      {/* 三、DeepSeek 配置 */}
      <RuleSection icon={Bot} title="三、DeepSeek API 配置">
        <p className="text-xs text-gray-500 mb-2">DeepSeek 负责快速对话（快速 / 深思模式），按 token 计费，不消耗 Manus 积分。</p>
        <div className="bg-gray-50 rounded-xl p-3 space-y-2 font-mono text-xs">
          <div>
            <span className="text-gray-500">DEEPSEEK_API_KEY（当前）</span>
            <div className="text-gray-900 font-semibold break-all mt-1">REDACTED_KEY_1</div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3 mb-1 font-semibold">Key 获取方式：</p>
        <ol className="list-decimal pl-5 space-y-1 text-xs text-gray-600">
          <li>登录 <span className="font-mono text-[#1A2B4A]">platform.deepseek.com</span>，进入「API Keys」</li>
          <li>点击「创建 API Key」，复制完整 Key（以 sk- 开头）</li>
          <li>充值：平台支持微信/支付宝充值，按需充值即可，无月费</li>
        </ol>
      </RuleSection>

      {/* 四、换 Manus 账号步骤 */}
      <RuleSection icon={RefreshCcw} title="四、换 Manus 账号的步骤">
        <p className="text-xs text-gray-500 mb-2">当 Manus 积分用完且无法充值，需要切换到新 Manus 账号时，按以下步骤操作：</p>
        <ol className="list-decimal pl-5 space-y-2 text-xs text-gray-700">
          <li>
            <span className="font-semibold text-gray-900">获取新账号的 API Key</span>：登录新 Manus 账号 → 设置 → API → 生成 Key，复制保存
          </li>
          <li>
            <span className="font-semibold text-gray-900">SSH 登录服务器修改 .env</span>：
            <div className="bg-gray-100 rounded-lg p-2 mt-1 font-mono text-[11px] leading-relaxed">
              <div>服务器 IP：124.223.54.69</div>
              <div>用户名：root</div>
              <div>密码：Miao@20190603</div>
              <div className="mt-1">ssh root@124.223.54.69</div>
              <div>cd /root/haoyouji-web</div>
              <div>nano .env</div>
              <div className="text-[#D32F2F] mt-1"># 找到 MANUS_API_KEY 这行，替换为新 Key</div>
              <div>MANUS_API_KEY=sk-新的Key粘贴在这里</div>
              <div className="mt-1"># 保存退出：Ctrl+O 回车，Ctrl+X</div>
              <div>pm2 restart openclaw</div>
            </div>
          </li>
          <li>
            <span className="font-semibold text-gray-900">重新绑定每个用户的 Manus 任务 ID</span>：在新账号里为每个用户创建新任务，在「AI 管理 → 企微AI → 用户 Tab」里更新任务 ID
          </li>
          <li>
            <span className="font-semibold text-gray-900">验证</span>：在企业微信里发一条消息，确认 AI 正常响应
          </li>
        </ol>
        <p className="text-xs text-[#D32F2F] mt-2 font-medium">注意：其他所有配置（企微应用、DeepSeek、菜单、路由规则等）不需要修改。</p>
      </RuleSection>

      {/* 五、换 DeepSeek 账号步骤 */}
      <RuleSection icon={RefreshCcw} title="五、换 DeepSeek 账号的步骤">
        <p className="text-xs text-gray-500 mb-2">当 DeepSeek API Key 余额不足或需要切换账号时：</p>
        <ol className="list-decimal pl-5 space-y-2 text-xs text-gray-700">
          <li>
            <span className="font-semibold text-gray-900">方案 A（推荐）：直接充值</span>：登录 platform.deepseek.com → 充值，无需换 Key，立即生效
          </li>
          <li>
            <span className="font-semibold text-gray-900">方案 B：换新 Key</span>：生成新 Key 后，SSH 登录服务器，修改 .env 中的 DEEPSEEK_API_KEY，然后 pm2 restart openclaw
          </li>
        </ol>
        <p className="text-xs text-gray-400 mt-2">DeepSeek 按 token 计费，充值后立即可用，无需重启服务。</p>
      </RuleSection>

      {/* 六、.env 文件完整配置参考 */}
      <RuleSection icon={FileText} title="六、服务器 .env 完整 AI 相关配置参考">
        <p className="text-xs text-gray-500 mb-2">以下为当前服务器 .env 中与 AI 相关的完整配置，换账号时对照修改：</p>
        <div className="bg-gray-900 rounded-xl p-3 font-mono text-[11px] text-green-400 leading-relaxed overflow-x-auto">
          <div className="text-gray-500"># DeepSeek API</div>
          <div>DEEPSEEK_API_KEY="REDACTED_KEY_1"</div>
          <div className="mt-2 text-gray-500"># 企业微信应用</div>
          <div>WECOM_CORP_ID=wwbbaccf1da5f886d9</div>
          <div>WECOM_AGENT_ID=1000002</div>
          <div>WECOM_SECRET=3-XQAnU8_8iKPA74O6_Gw3YQPdOIA2nIv4ILXpxcZ2g</div>
          <div>WECOM_TOKEN=pEhNzolV5wrJ7Xk7</div>
          <div>WECOM_ENCODING_AES_KEY=myX82WWfAVfunhJyaLrqIyZozz1q7f8hVx1t4rSDKAy</div>
          <div className="mt-2 text-gray-500"># Manus API</div>
          <div className="text-yellow-400">MANUS_API_KEY=sk-CR8TOKZLGtXfij6m_2UNN8XQcjq75tcEYTtYv6Y9mWm3-bGLAxU54FiOK4IESdLl_Xcr1FVbceWQJD4XaNv4lNYnsxqw</div>
          <div className="text-gray-500 mt-1"># 换账号时只需替换上面黄色这行</div>
        </div>
      </RuleSection>

      <p className="text-center text-[11px] text-gray-300 pt-1">
        规则 006 · 企业微信 AI API 绑定规则 · 仅超级管理员可见
      </p>
    </>
  );
}

/** 按编号查规则 */
export function getRuleById(id: string): Rule | undefined {
  return RULES.find((r) => r.id === id);
}
