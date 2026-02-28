import { useState, useRef } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Bot, Play, Pause, Square,
  MessageSquare, Clock, CheckCircle, AlertCircle, Loader2,
  Sparkles, Send, HelpCircle
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// 任务状态映射
const TASK_STATUS: Record<string, { label: string; color: string; Icon: any }> = {
  draft:    { label: "草稿",   color: "#9E9E9E", Icon: AlertCircle },
  pending:  { label: "待确认", color: "#F57C00", Icon: Clock },
  running:  { label: "运行中", color: "#388E3C", Icon: Play },
  paused:   { label: "已暂停", color: "#F57C00", Icon: Pause },
  stopped:  { label: "已停止", color: "#9E9E9E", Icon: Square },
  completed:{ label: "已完成", color: "#1976D2", Icon: CheckCircle },
};

// AI头像组件（用户真实头像 + 底部AI标识）
function AIAvatar({ avatarUrl, name, size = 48 }: { avatarUrl?: string | null; name: string; size?: number }) {
  const initial = name.replace(/^AI/, "").charAt(0) || "A";
  const tagH = Math.max(14, size * 0.3);
  const tagFont = Math.max(8, size * 0.2);
  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        <div
          className="w-full h-full rounded-full flex items-center justify-center text-white font-bold bg-gray-400"
          style={{ fontSize: size * 0.38 }}
        >
          {initial}
        </div>
      )}
      {/* AI标识 - 底部居中 */}
      <div
        className="absolute left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#D32F2F] to-[#FF5252] text-white rounded-full flex items-center justify-center font-bold shadow"
        style={{
          bottom: -tagH / 4,
          height: tagH,
          minWidth: tagH * 1.6,
          fontSize: tagFont,
          padding: "0 4px",
          lineHeight: 1,
          letterSpacing: 0.5,
          border: "2px solid white",
        }}
      >
        AI
      </div>
    </div>
  );
}

// 开关组件
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none ${
        checked ? "bg-[#D32F2F]" : "bg-gray-200"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

const LedgerAIEmployees = () => {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const ledgerId = parseInt(id || "0");

  // 状态
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskInput, setTaskInput] = useState("");
  const [aiParsing, setAiParsing] = useState(false);
  const [parsedTask, setParsedTask] = useState<any>(null);
  const [showHelp, setShowHelp] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 获取当前用户信息
  const { data: currentUser } = trpc.auth.me.useQuery();

  // 获取已添加的AI分身列表
  const { data: aiEmployees = [], refetch } = trpc.ledger.getAIEmployees.useQuery({
    ledgerId,
  });

  // 当前用户是否已开启AI分身（用宿松比较防止number/string类型不匹配）
  // eslint-disable-next-line eqeqeq
  const myAI = aiEmployees.find((e: any) => e.userId == currentUser?.id);
  const isEnabled = !!myAI;

  // 开关AI分身
  const toggleMutation = trpc.ledger.toggleAIEmployee.useMutation({
    onSuccess: (data: any) => {
      if (data.enabled) {
        toast.success("AI分身已开启");
      } else {
        toast.success("AI分身已关闭");
      }
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "操作失败");
    },
  });

  const handleToggle = (enabled: boolean) => {
    toggleMutation.mutate({ ledgerId, enabled });
  };

  // 模拟DeepSeek解析任务
  const handleParseTask = async () => {
    if (!taskInput.trim()) {
      toast.error("请输入任务描述");
      return;
    }
    setAiParsing(true);
    setParsedTask(null);

    setTimeout(() => {
      const input = taskInput.trim();
      let parsed: any = {
        summary: "",
        actions: [],
        schedule: "",
        confirmed: false,
      };

      if (input.includes("每日") || input.includes("每天")) {
        const amountMatch = input.match(/(\d+(?:\.\d+)?)/);
        const amount = amountMatch ? amountMatch[1] : "100";
        parsed.summary = `每日自动记账任务`;
        parsed.schedule = "每天执行";
        parsed.actions = [
          { type: "add_transaction", desc: `自动添加一笔 ¥${amount} 的支出记录`, params: { amount, type: "expense" } }
        ];
        if (input.includes("扣除") || input.includes("扣款")) {
          parsed.actions[0].desc = `自动扣除 ¥${amount}`;
        }
      } else if (input.includes("每周")) {
        parsed.summary = `每周自动记账任务`;
        parsed.schedule = "每周一执行";
        const amountMatch = input.match(/(\d+(?:\.\d+)?)/);
        const amount = amountMatch ? amountMatch[1] : "500";
        parsed.actions = [
          { type: "add_transaction", desc: `每周自动添加 ¥${amount} 的记录`, params: { amount } }
        ];
      } else if (input.includes("每月") || input.includes("月底") || input.includes("月初")) {
        parsed.summary = `每月自动记账任务`;
        parsed.schedule = "每月1日执行";
        const amountMatch = input.match(/(\d+(?:\.\d+)?)/);
        const amount = amountMatch ? amountMatch[1] : "3000";
        parsed.actions = [
          { type: "add_transaction", desc: `每月自动添加 ¥${amount} 的记录`, params: { amount } }
        ];
      } else {
        parsed.summary = `自定义任务`;
        parsed.schedule = "按需执行";
        parsed.actions = [
          { type: "custom", desc: input, params: {} }
        ];
      }

      setParsedTask(parsed);
      setAiParsing(false);
    }, 2000);
  };

  const handleConfirmTask = () => {
    toast.success("任务已启动，AI分身将按计划执行");
    setParsedTask(null);
    setTaskInput("");
    setShowTaskForm(false);
  };

  const displayName = myAI?.nickname || myAI?.username || currentUser?.username || "AI分身";
  const displayAvatar = myAI?.avatarUrl || currentUser?.avatar;

  return (
    <div className="min-h-screen bg-[#F9F9F9] pb-20">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-[#D32F2F] to-[#B71C1C] text-white sticky top-0 z-10">
        <div className="flex items-center h-14 px-4">
          <button
            onClick={() => setLocation(`/ledger/${id}/settings`)}
            className="p-2 -ml-2"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="flex-1 text-center text-base font-medium">AI 分身</h1>
          <div className="w-9" />
        </div>
      </div>

      {/* 主开关卡片 */}
      <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm overflow-hidden">
        {/* 标题行 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#D32F2F]" />
            <h3 className="text-sm font-semibold text-gray-900">我的 AI 分身</h3>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="ml-0.5 text-gray-400 hover:text-[#D32F2F] transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
          <Toggle
            checked={isEnabled}
            onChange={handleToggle}
            disabled={toggleMutation.isPending}
          />
        </div>

        {/* 帮助说明 */}
        {showHelp && (
          <div className="px-5 py-4 bg-red-50/40 border-b border-red-100">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#D32F2F] to-[#FF5252] flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-600 leading-relaxed">
                  开启 AI 分身后，系统将以您的身份创建一个 AI 成员加入账本。
                  AI 分身可接受自然语言指令，自动执行定时记账、周期扣款等任务。
                </p>
              </div>
              <button onClick={() => setShowHelp(false)} className="text-gray-400 text-xs mt-0.5">×</button>
            </div>
          </div>
        )}

        {/* 开启状态：显示AI分身卡片 */}
        {isEnabled ? (
          <div className="px-5 py-4">
            <div className="flex items-center gap-4">
              <AIAvatar avatarUrl={displayAvatar} name={displayName} size={52} />
              <div className="flex-1">
                <p className="text-base font-semibold text-gray-900">{displayName}</p>
                <p className="text-xs text-gray-400 mt-0.5">AI 分身成员 · 已加入账本</p>
              </div>
              <button
                onClick={() => setShowTaskForm(true)}
                className="flex items-center gap-1.5 text-xs text-[#1976D2] px-3 py-2 bg-blue-50 rounded-full font-medium"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                布置任务
              </button>
            </div>
          </div>
        ) : (
          /* 关闭状态：空状态提示 */
          <div className="py-12 text-center">
            <Bot className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">AI 分身未开启</p>
            <p className="text-xs text-gray-300 mt-1">开启后将自动创建您的 AI 分身</p>
          </div>
        )}
      </div>

      {/* AI任务布置面板 */}
      {showTaskForm && isEnabled && (
        <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm overflow-hidden border border-blue-100">
          <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-blue-50 to-white border-b border-blue-100">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#1976D2]" />
              <h3 className="text-sm font-semibold text-gray-900">布置任务</h3>
            </div>
            <button
              onClick={() => {
                setShowTaskForm(false);
                setParsedTask(null);
                setTaskInput("");
              }}
              className="text-xs text-gray-400"
            >
              关闭
            </button>
          </div>

          <div className="p-5">
            <p className="text-xs text-gray-500 mb-3">
              用自然语言描述您希望 AI 分身执行的任务，DeepSeek 将为您解析并生成执行方案。
            </p>

            {/* 示例提示 */}
            <div className="mb-3 flex flex-wrap gap-2">
              {[
                "每日从账本扣除50元生活费",
                "每周一记录500元工资收入",
                "每月1日记录3000元房租支出",
              ].map((example) => (
                <button
                  key={example}
                  onClick={() => setTaskInput(example)}
                  className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1.5 rounded-full hover:bg-gray-200 transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>

            {/* 输入框 */}
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                placeholder="例如：每天从账本中扣除50元作为日常开支..."
                rows={3}
                className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#1976D2] resize-none bg-gray-50"
              />
              <button
                onClick={handleParseTask}
                disabled={aiParsing || !taskInput.trim()}
                className="absolute right-2 bottom-2 p-2 bg-[#1976D2] text-white rounded-lg disabled:opacity-40 transition-colors"
              >
                {aiParsing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* AI解析中 */}
            {aiParsing && (
              <div className="mt-4 flex items-center gap-3 p-4 bg-blue-50 rounded-xl">
                <Loader2 className="w-5 h-5 text-[#1976D2] animate-spin" />
                <div>
                  <p className="text-sm font-medium text-[#1976D2]">DeepSeek 正在解析您的任务...</p>
                  <p className="text-xs text-blue-400 mt-0.5">正在理解任务意图并生成执行方案</p>
                </div>
              </div>
            )}

            {/* 解析结果 */}
            {parsedTask && !aiParsing && (
              <div className="mt-4 border border-green-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-green-50 border-b border-green-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-800">任务方案已生成</span>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">任务概要</p>
                    <p className="text-sm text-gray-900 font-medium">{parsedTask.summary}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">执行计划</p>
                    <p className="text-sm text-gray-700">{parsedTask.schedule}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">执行动作</p>
                    <div className="space-y-2">
                      {parsedTask.actions.map((action: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 bg-gray-50 p-3 rounded-lg">
                          <div className="w-5 h-5 rounded-full bg-[#1976D2] text-white flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                            {i + 1}
                          </div>
                          <p className="text-sm text-gray-700">{action.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleConfirmTask}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#388E3C] text-white text-sm font-medium rounded-xl"
                    >
                      <Play className="w-4 h-4" />
                      确认并开始工作
                    </button>
                    <button
                      onClick={() => setParsedTask(null)}
                      className="px-4 py-2.5 text-sm text-gray-500 bg-gray-100 rounded-xl"
                    >
                      重新描述
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI任务列表 */}
      <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#F57C00]" />
            <h3 className="text-sm font-semibold text-gray-900">任务列表</h3>
          </div>
        </div>
        <div className="py-12 text-center">
          <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">暂无进行中的任务</p>
          <p className="text-xs text-gray-300 mt-1">给 AI 分身布置任务后将在这里显示</p>
        </div>
      </div>

      {/* 底部说明 */}
      <div className="mx-4 mt-4 mb-8 px-1">
        <p className="text-xs text-gray-400 leading-relaxed">
          AI 分身由 DeepSeek 大模型驱动，可理解自然语言指令并自动执行记账任务。
          任务执行过程中，您可以随时暂停或停止。所有操作记录可在修改记录中查看。
        </p>
      </div>
    </div>
  );
};

export default LedgerAIEmployees;
