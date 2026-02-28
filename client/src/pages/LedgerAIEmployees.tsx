import { useState, useRef } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Bot, Play, Pause, Square,
  MessageSquare, Clock, CheckCircle, AlertCircle, Loader2,
  Sparkles, Send, HelpCircle, XCircle, ChevronDown, ChevronUp
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// 任务状态映射
const TASK_STATUS: Record<string, { label: string; color: string; bgColor: string; Icon: any }> = {
  draft:     { label: "草稿",   color: "#9E9E9E", bgColor: "#F5F5F5", Icon: AlertCircle },
  pending:   { label: "待确认", color: "#F57C00", bgColor: "#FFF3E0", Icon: Clock },
  running:   { label: "运行中", color: "#388E3C", bgColor: "#E8F5E9", Icon: Play },
  paused:    { label: "已暂停", color: "#F57C00", bgColor: "#FFF3E0", Icon: Pause },
  stopped:   { label: "已停止", color: "#9E9E9E", bgColor: "#F5F5F5", Icon: Square },
  completed: { label: "已完成", color: "#1976D2", bgColor: "#E3F2FD", Icon: CheckCircle },
};

// 频率标签
const SCHEDULE_LABELS: Record<string, string> = {
  once: "一次性",
  every_minute: "每分钟",
  every_5_minutes: "每5分钟",
  every_10_minutes: "每10分钟",
  every_30_minutes: "每30分钟",
  every_hour: "每小时",
  daily: "每日",
  weekly: "每周",
  monthly: "每月",
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
  const [parsedTask, setParsedTask] = useState<any>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 获取当前用户信息
  const { data: currentUser } = trpc.auth.me.useQuery();

  // 获取已添加的AI分身列表
  const { data: aiEmployees = [], refetch } = trpc.ledger.getAIEmployees.useQuery({
    ledgerId,
  });

  // 获取AI分身任务列表
  const { data: tasks = [], refetch: refetchTasks } = trpc.ledger.getAIEmployeeTasks.useQuery({
    ledgerId,
  });

  // 当前用户是否已开启AI分身
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

  // 解析任务（调用DeepSeek API）
  const parseMutation = trpc.ledger.parseAIEmployeeTask.useMutation({
    onSuccess: (data: any) => {
      if (data.success && data.parsed) {
        setParsedTask(data.parsed);
        toast.success("任务方案已生成");
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "任务解析失败，请重试");
    },
  });

  // 确认并创建任务
  const createTaskMutation = trpc.ledger.createAIEmployeeTask.useMutation({
    onSuccess: () => {
      toast.success("任务已创建并开始执行");
      setParsedTask(null);
      setTaskInput("");
      setShowTaskForm(false);
      refetchTasks();
    },
    onError: (error: any) => {
      toast.error(error.message || "任务创建失败");
    },
  });

  // 更新任务状态
  const updateStatusMutation = trpc.ledger.updateAIEmployeeTaskStatus.useMutation({
    onSuccess: () => {
      toast.success("任务状态已更新");
      refetchTasks();
    },
    onError: (error: any) => {
      toast.error(error.message || "操作失败");
    },
  });

  const handleToggle = (enabled: boolean) => {
    toggleMutation.mutate({ ledgerId, enabled });
  };

  // 调用DeepSeek解析任务
  const handleParseTask = async () => {
    if (!taskInput.trim()) {
      toast.error("请输入任务描述");
      return;
    }
    setParsedTask(null);
    parseMutation.mutate({
      ledgerId,
      taskDescription: taskInput.trim(),
    });
  };

  // 确认并创建任务
  const handleConfirmTask = () => {
    if (!parsedTask) return;
    createTaskMutation.mutate({
      ledgerId,
      taskDescription: taskInput.trim(),
      parsedPlan: parsedTask,
    });
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

        {showHelp && (
          <div className="px-5 py-4 bg-red-50/40 border-b border-red-100">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#D32F2F] to-[#FF5252] flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-600 leading-relaxed">
                  开启 AI 分身后，系统将以您的身份创建一个 AI 成员加入账本。
                  AI 分身可接受自然语言指令，由 DeepSeek 大模型驱动，自动执行记账任务。
                </p>
              </div>
              <button onClick={() => setShowHelp(false)} className="text-gray-400 text-xs mt-0.5">×</button>
            </div>
          </div>
        )}

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
              用自然语言描述您希望 AI 分身执行的记账任务，DeepSeek 将为您解析并生成执行方案。
            </p>

            {/* 示例提示 */}
            <div className="mb-3 flex flex-wrap gap-2">
              {[
                "每日从账本扣除50元生活费",
                "每周一记录500元工资收入",
                "每月1日记录3000元房租支出",
                "记一笔200元的餐饮支出",
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
                disabled={parseMutation.isPending || !taskInput.trim()}
                className="absolute right-2 bottom-2 p-2 bg-[#1976D2] text-white rounded-lg disabled:opacity-40 transition-colors"
              >
                {parseMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* AI解析中 */}
            {parseMutation.isPending && (
              <div className="mt-4 flex items-center gap-3 p-4 bg-blue-50 rounded-xl">
                <Loader2 className="w-5 h-5 text-[#1976D2] animate-spin" />
                <div>
                  <p className="text-sm font-medium text-[#1976D2]">DeepSeek 正在解析您的任务...</p>
                  <p className="text-xs text-blue-400 mt-0.5">正在理解任务意图并生成执行方案</p>
                </div>
              </div>
            )}

            {/* 解析结果 */}
            {parsedTask && !parseMutation.isPending && (
              parsedTask.rejected ? (
                /* AI拒绝执行的任务 */
                <div className="mt-4 border border-orange-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-orange-50 border-b border-orange-200">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-orange-600" />
                      <span className="text-sm font-medium text-orange-800">无法执行该任务</span>
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <p className="text-sm text-gray-700">{parsedTask.summary}</p>
                    {parsedTask.reject_reason && (
                      <div className="bg-orange-50 p-3 rounded-lg">
                        <p className="text-xs text-orange-700">
                          <span className="font-medium">提示：</span>{parsedTask.reject_reason}
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-gray-400">
                      AI 分身只能在账本中添加收入或支出记录，无法执行其他操作。
                    </p>
                    <button
                      onClick={() => setParsedTask(null)}
                      className="w-full py-2.5 text-sm text-gray-500 bg-gray-100 rounded-xl"
                    >
                      重新描述任务
                    </button>
                  </div>
                </div>
              ) : (
                /* 正常任务方案 */
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
                    <div className="flex gap-4">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">执行频率</p>
                        <span className="inline-block text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-md font-medium">
                          {SCHEDULE_LABELS[parsedTask.schedule_type] || parsedTask.schedule_type}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">执行时间</p>
                        <p className="text-sm text-gray-700">{parsedTask.schedule_detail}</p>
                      </div>
                    </div>
                    {parsedTask.actions?.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-1">执行动作</p>
                        <div className="space-y-2">
                          {parsedTask.actions.map((action: any, i: number) => (
                            <div key={i} className="flex items-start gap-2 bg-gray-50 p-3 rounded-lg">
                              <div className="w-5 h-5 rounded-full bg-[#1976D2] text-white flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                                {i + 1}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm text-gray-700">
                                  {action.transaction_type === 'income' ? '收入' : '支出'}{' '}
                                  {action.amount_min !== undefined && action.amount_max !== undefined
                                    ? `¥${action.amount_min}-${action.amount_max}（随机）`
                                    : `¥${action.amount}`}
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  分类：{action.category_name || '其他'}
                                  {action.description ? ` · ${action.description}` : ''}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={handleConfirmTask}
                        disabled={createTaskMutation.isPending}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#388E3C] text-white text-sm font-medium rounded-xl disabled:opacity-50"
                      >
                        {createTaskMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                        {parsedTask.schedule_type === 'once' ? '确认并立即执行' : '确认并开始工作'}
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
              )
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
            {tasks.length > 0 && (
              <span className="text-xs text-gray-400">({tasks.length})</span>
            )}
          </div>
        </div>

        {tasks.length > 0 ? (
          <div className="divide-y divide-gray-50">
            {tasks.map((task: any) => {
              const statusInfo = TASK_STATUS[task.status] || TASK_STATUS.draft;
              const StatusIcon = statusInfo.Icon;
              const isExpanded = expandedTaskId === task.id;
              const plan = task.parsed_plan;

              return (
                <div key={task.id} className="px-5 py-4">
                  {/* 任务头部 */}
                  <div
                    className="flex items-start gap-3 cursor-pointer"
                    onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: statusInfo.bgColor }}
                    >
                      <StatusIcon className="w-4 h-4" style={{ color: statusInfo.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {plan?.summary || task.task_description}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className="inline-block text-xs px-1.5 py-0.5 rounded font-medium"
                          style={{ backgroundColor: statusInfo.bgColor, color: statusInfo.color }}
                        >
                          {statusInfo.label}
                        </span>
                        <span className="text-xs text-gray-400">
                          {SCHEDULE_LABELS[task.schedule_type] || task.schedule_type}
                        </span>
                        {task.execution_count > 0 && (
                          <span className="text-xs text-gray-400">
                            · 已执行 {task.execution_count} 次
                          </span>
                        )}
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                    )}
                  </div>

                  {/* 展开详情 */}
                  {isExpanded && (
                    <div className="mt-3 ml-11 space-y-3">
                      {/* 原始描述 */}
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-400 mb-1">原始描述</p>
                        <p className="text-sm text-gray-700">{task.task_description}</p>
                      </div>

                      {/* 执行动作 */}
                      {plan?.actions && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1.5">执行动作</p>
                          {plan.actions.map((action: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-sm text-gray-700 mb-1">
                              <div className="w-4 h-4 rounded-full bg-[#1976D2] text-white flex items-center justify-center text-[10px]">
                                {i + 1}
                              </div>
                              <span>
                                {action.transaction_type === 'income' ? '收入' : '支出'}{' '}
                                {action.amount_min !== undefined && action.amount_max !== undefined
                                  ? `¥${action.amount_min}-${action.amount_max}（随机）`
                                  : `¥${action.amount}`}
                                {action.category_name ? ` · ${action.category_name}` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 时间信息 */}
                      <div className="flex gap-4 text-xs text-gray-400">
                        <span>创建：{new Date(task.created_at).toLocaleString('zh-CN')}</span>
                        {task.last_executed_at && (
                          <span>上次执行：{new Date(task.last_executed_at).toLocaleString('zh-CN')}</span>
                        )}
                      </div>

                      {/* 操作按钮 */}
                      {(task.status === 'running' || task.status === 'paused') && (
                        <div className="flex gap-2 pt-1">
                          {task.status === 'running' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateStatusMutation.mutate({ taskId: task.id, status: 'paused' });
                              }}
                              className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg"
                            >
                              <Pause className="w-3 h-3" /> 暂停
                            </button>
                          )}
                          {task.status === 'paused' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateStatusMutation.mutate({ taskId: task.id, status: 'running' });
                              }}
                              className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-lg"
                            >
                              <Play className="w-3 h-3" /> 继续
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateStatusMutation.mutate({ taskId: task.id, status: 'stopped' });
                            }}
                            className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg"
                          >
                            <Square className="w-3 h-3" /> 停止
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center">
            <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">暂无进行中的任务</p>
            <p className="text-xs text-gray-300 mt-1">给 AI 分身布置任务后将在这里显示</p>
          </div>
        )}
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
