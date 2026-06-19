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
];

/** 按编号查规则 */
export function getRuleById(id: string): Rule | undefined {
  return RULES.find((r) => r.id === id);
}
