import { useState, useRef, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Bot, Plus, Trash2, Play, Pause, Square,
  MessageSquare, Clock, CheckCircle, AlertCircle, Loader2,
  User, Sparkles, Send, ChevronDown, ChevronUp
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// AI分身默认头像颜色方案（专业线条风格）
const AI_COLORS = [
  "#D32F2F", "#1976D2", "#388E3C", "#F57C00",
  "#7B1FA2", "#00796B", "#C2185B", "#455A64",
];

// 任务状态映射
const TASK_STATUS: Record<string, { label: string; color: string; Icon: any }> = {
  draft:    { label: "草稿",   color: "#9E9E9E", Icon: AlertCircle },
  pending:  { label: "待确认", color: "#F57C00", Icon: Clock },
  running:  { label: "运行中", color: "#388E3C", Icon: Play },
  paused:   { label: "已暂停", color: "#F57C00", Icon: Pause },
  stopped:  { label: "已停止", color: "#9E9E9E", Icon: Square },
  completed:{ label: "已完成", color: "#1976D2", Icon: CheckCircle },
};

// AI头像组件（带AI标签）
function AIAvatar({ name, color, size = 48 }: { name: string; color: string; size?: number }) {
  const initial = name.replace(/^AI/, "").charAt(0) || "A";
  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <div
        className="w-full h-full rounded-full flex items-center justify-center text-white font-bold"
        style={{ backgroundColor: color, fontSize: size * 0.38 }}
      >
        {initial}
      </div>
      <div
        className="absolute -top-1 -left-1 bg-gradient-to-r from-[#D32F2F] to-[#FF5252] text-white rounded-md flex items-center justify-center font-bold shadow-sm"
        style={{ fontSize: Math.max(8, size * 0.18), padding: "1px 3px", lineHeight: 1.2 }}
      >
        AI
      </div>
    </div>
  );
}

const LedgerAIEmployees = () => {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const ledgerId = parseInt(id || "0");

  // 状态
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskInput, setTaskInput] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
  const [aiParsing, setAiParsing] = useState(false);
  const [parsedTask, setParsedTask] = useState<any>(null);
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 获取当前用户信息
  const { data: currentUser } = trpc.auth.me.useQuery();

  // 获取已添加的AI分身列表
  const { data: aiEmployees = [], refetch } = trpc.ledger.getAIEmployees.useQuery({
    ledgerId,
  });

  // 获取AI任务列表
  const { data: aiTasks = [], refetch: refetchTasks } = trpc.ledger.getAITasks?.useQuery?.({
    ledgerId,
  }) ?? { data: [], refetch: () => {} };

  // 添加AI分身
  const addAIEmployeeMutation = trpc.ledger.addAIEmployee.useMutation({
    onSuccess: () => {
      toast.success("AI分身添加成功");
      setShowAddForm(false);
      setNewName("");
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "添加失败");
    },
  });

  // 删除AI分身
  const removeAIEmployeeMutation = trpc.ledger.removeAIEmployee.useMutation({
    onSuccess: () => {
      toast.success("AI分身已删除");
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "删除失败");
    },
  });

  // 处理添加AI分身
  const handleAdd = () => {
    const userName = currentUser?.username || "用户";
    const aiName = newName.trim() || `AI${userName}`;
    const colorIndex = aiEmployees.length % AI_COLORS.length;
    addAIEmployeeMutation.mutate({
      ledgerId,
      avatarType: `color_${colorIndex}`,
      nickname: aiName,
    });
  };

  // 模拟DeepSeek解析任务
  const handleParseTask = async () => {
    if (!taskInput.trim()) {
      toast.error("请输入任务描述");
      return;
    }
    setAiParsing(true);
    setParsedTask(null);

    // 模拟AI解析延迟
    setTimeout(() => {
      // 解析用户输入，生成任务方案
      const input = taskInput.trim();
      let parsed: any = {
        summary: "",
        actions: [],
        schedule: "",
        confirmed: false,
      };

      // 简单的意图识别
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

  // 确认并启动任务
  const handleConfirmTask = () => {
    toast.success("任务已启动，AI分身将按计划执行");
    setParsedTask(null);
    setTaskInput("");
    setShowTaskForm(false);
  };

  return (
    <div className="min-h-screen bg-[#F9F9F9] pb-20">
      {/* 顶部导航 - 红色主题 */}
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

      {/* 功能介绍卡片 */}
      <div className="mx-4 mt-4 bg-white rounded-2xl p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D32F2F] to-[#FF5252] flex items-center justify-center flex-shrink-0">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-900 mb-1">AI 分身</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              为您的账本创建AI分身，它可以作为记账成员参与收支记录，
              更可以接受自然语言指令，自动执行定时记账、周期扣款等任务。
            </p>
          </div>
        </div>
      </div>

      {/* 我的AI分身 */}
      <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#D32F2F]" />
            <h3 className="text-sm font-semibold text-gray-900">我的 AI 分身</h3>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {aiEmployees.length}
            </span>
          </div>
          <button
            onClick={() => {
              const userName = currentUser?.username || "用户";
              setNewName(`AI${userName}`);
              setShowAddForm(true);
            }}
            className="flex items-center gap-1 text-xs text-[#D32F2F] font-medium px-3 py-1.5 bg-red-50 rounded-full"
          >
            <Plus className="w-3.5 h-3.5" />
            添加分身
          </button>
        </div>

        {/* 添加表单 */}
        {showAddForm && (
          <div className="px-5 py-4 bg-red-50/50 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <AIAvatar
                name={newName || "AI"}
                color={AI_COLORS[aiEmployees.length % AI_COLORS.length]}
                size={44}
              />
              <div className="flex-1">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="输入AI分身名称"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#D32F2F] bg-white"
                />
              </div>
              <button
                onClick={handleAdd}
                disabled={addAIEmployeeMutation.isPending}
                className="px-4 py-2 bg-[#D32F2F] text-white text-sm rounded-lg disabled:opacity-50"
              >
                {addAIEmployeeMutation.isPending ? "添加中..." : "确认"}
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-3 py-2 text-sm text-gray-500"
              >
                取消
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2 ml-14">
              默认名称为 AI + 您的用户名，您也可以自定义名称
            </p>
          </div>
        )}

        {/* AI分身列表 */}
        {aiEmployees.length === 0 && !showAddForm ? (
          <div className="py-12 text-center">
            <Bot className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">还没有AI分身</p>
            <p className="text-xs text-gray-300 mt-1">点击上方"添加分身"开始创建</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {aiEmployees.map((employee: any, index: number) => {
              const colorIndex = index % AI_COLORS.length;
              const color = AI_COLORS[colorIndex];
              const displayName = employee.nickname || "AI分身";
              return (
                <div key={employee.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <AIAvatar name={displayName} color={color} size={44} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{displayName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">AI 分身成员</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedEmployee(employee.id);
                        setShowTaskForm(true);
                      }}
                      className="flex items-center gap-1 text-xs text-[#1976D2] px-3 py-1.5 bg-blue-50 rounded-full"
                    >
                      <MessageSquare className="w-3 h-3" />
                      布置任务
                    </button>
                    <button
                      onClick={() => removeAIEmployeeMutation.mutate({
                        ledgerId,
                        employeeId: employee.id,
                      })}
                      disabled={removeAIEmployeeMutation.isPending}
                      className="p-1.5 text-gray-400 hover:text-[#D32F2F] hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AI任务布置面板 */}
      {showTaskForm && (
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
              用自然语言描述您希望AI分身执行的任务，DeepSeek 将为您解析并生成执行方案。
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

        {/* 示例任务（展示用） */}
        <div className="divide-y divide-gray-50">
          {/* 空状态 */}
          <div className="py-12 text-center">
            <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">暂无进行中的任务</p>
            <p className="text-xs text-gray-300 mt-1">给AI分身布置任务后将在这里显示</p>
          </div>
        </div>
      </div>

      {/* 底部说明 */}
      <div className="mx-4 mt-4 mb-8 px-1">
        <p className="text-xs text-gray-400 leading-relaxed">
          AI分身由 DeepSeek 大模型驱动，可理解自然语言指令并自动执行记账任务。
          任务执行过程中，您可以随时暂停或停止。所有操作记录可在修改记录中查看。
        </p>
      </div>
    </div>
  );
};

export default LedgerAIEmployees;
