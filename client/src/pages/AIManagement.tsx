import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ArrowLeft, Save, RotateCcw, Loader2 } from 'lucide-react';
import CompanyReportManagement from '@/components/CompanyReportManagement';

interface PromptsConfig {
  systemPrompt: string;
  userPromptTemplate: string;
  temperature: number;
  maxTokens: number;
}

interface AIAssistantConfig {
  segment1: string;
  segment2: string;
  segment3: string;
  segment4: string;
}

export default function AIManagement() {
  const [, setLocation] = useLocation();
  // toast is imported from sonner
  const [config, setConfig] = useState<PromptsConfig | null>(null);
  const [assistantConfig, setAssistantConfig] = useState<AIAssistantConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);
  const [isAssistantSaving, setIsAssistantSaving] = useState(false);

  // 加载配置
  useEffect(() => {
    loadConfig();
    loadAssistantConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/ai/prompts');
      const result = await response.json();
      
      if (result.success) {
        setConfig(result.data);
      } else {
        toast.error(result.error || '无法加载 AI 配置');
      }
    } catch (error) {
      console.error('加载 AI 配置错误:', error);
      toast.error('网络错误，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    try {
      setIsSaving(true);
      const response = await fetch('/api/ai/prompts', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('AI 配置已更新');
      } else {
        toast.error(result.error || '无法保存 AI 配置');
      }
    } catch (error) {
      console.error('保存 AI 配置错误:', error);
      toast.error('网络错误，请稍后重试');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('确定要重置为默认配置吗？此操作不可撤销。')) {
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch('/api/ai/prompts/reset', {
        method: 'POST',
      });

      const result = await response.json();

      if (result.success) {
        setConfig(result.data);
        toast.success('AI 配置已恢复为默认值');
      } else {
        toast.error(result.error || '无法重置 AI 配置');
      }
    } catch (error) {
      console.error('重置 AI 配置错误:', error);
      toast.error('网络错误，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  // AI助手配置管理
  const loadAssistantConfig = async () => {
    try {
      setIsAssistantLoading(true);
      const response = await fetch('/api/ai/assistant/prompts');
      const result = await response.json();
      
      if (result.success) {
        setAssistantConfig(result.data);
      } else {
        toast.error(result.error || '无法加载 AI 助手配置');
      }
    } catch (error) {
      console.error('加载 AI 助手配置错误:', error);
      toast.error('网络错误，请稍后重试');
    } finally {
      setIsAssistantLoading(false);
    }
  };

  const handleAssistantSave = async () => {
    if (!assistantConfig) return;

    try {
      setIsAssistantSaving(true);
      const response = await fetch('/api/ai/assistant/prompts', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(assistantConfig),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('AI 助手配置已更新');
      } else {
        toast.error(result.error || '无法保存 AI 助手配置');
      }
    } catch (error) {
      console.error('保存 AI 助手配置错误:', error);
      toast.error('网络错误，请稍后重试');
    } finally {
      setIsAssistantSaving(false);
    }
  };

  const handleAssistantReset = async () => {
    if (!confirm('确定要重置为默认配置吗？此操作不可撤销。')) {
      return;
    }

    try {
      setIsAssistantLoading(true);
      const response = await fetch('/api/ai/assistant/prompts/reset', {
        method: 'POST',
      });

      const result = await response.json();

      if (result.success) {
        setAssistantConfig(result.data);
        toast.success('AI 助手配置已恢复为默认值');
      } else {
        toast.error(result.error || '无法重置 AI 助手配置');
      }
    } catch (error) {
      console.error('重置 AI 助手配置错误:', error);
      toast.error('网络错误，请稍后重试');
    } finally {
      setIsAssistantLoading(false);
    }
  };

  if (isLoading || !config) {
    return (
      <div className="container max-w-4xl py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/')}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">AI 管理</h1>
            <p className="text-sm text-muted-foreground">管理 AI 提示词和参数配置</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={isSaving}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            重置
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                保存
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 内容 */}
      <Tabs defaultValue="assistant" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="assistant">AI助手</TabsTrigger>
          <TabsTrigger value="code-memo">代码备忘录</TabsTrigger>
          <TabsTrigger value="prompts">企业认证</TabsTrigger>
          <TabsTrigger value="parameters">参数配置</TabsTrigger>
          <TabsTrigger value="companyReports">企业报告</TabsTrigger>
        </TabsList>

        {/* AI助手 */}
        <TabsContent value="assistant" className="space-y-6">
          {isAssistantLoading ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : assistantConfig ? (
            <>
              <div className="flex justify-end gap-2 mb-4">
                <Button
                  variant="outline"
                  onClick={handleAssistantReset}
                  disabled={isAssistantSaving}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  重置
                </Button>
                <Button
                  onClick={handleAssistantSave}
                  disabled={isAssistantSaving}
                >
                  {isAssistantSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      保存
                    </>
                  )}
                </Button>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>核心角色定义</CardTitle>
                  <CardDescription>
                    定义 AI 助手的基本角色和职责，说明它是什么、做什么。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={assistantConfig.segment1}
                    onChange={(e) => setAssistantConfig({ ...assistantConfig, segment1: e.target.value })}
                    placeholder="例：你是一个专业的人脉管理助手，帮助用户查询和分析他们的人脉数据..."
                    className="min-h-[120px] font-mono text-sm"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>行为规则</CardTitle>
                  <CardDescription>
                    定义 AI 助手的行为准则，包括如何处理查询、哪些事情可以做、哪些不可以做。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={assistantConfig.segment2}
                    onChange={(e) => setAssistantConfig({ ...assistantConfig, segment2: e.target.value })}
                    placeholder="例：1. 只回答用户问的问题，不要提供无关信息\n2. 如果找到了，直接列出结果..."
                    className="min-h-[150px] font-mono text-sm"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>输出格式要求</CardTitle>
                  <CardDescription>
                    定义 AI 助手的回答格式，包括如何组织信息、使用什么样式。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={assistantConfig.segment3}
                    onChange={(e) => setAssistantConfig({ ...assistantConfig, segment3: e.target.value })}
                    placeholder="例：使用清晰的列表格式，每个结果包含姓名、公司、职位..."
                    className="min-h-[120px] font-mono text-sm"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>示例演示</CardTitle>
                  <CardDescription>
                    提供具体的问答示例，帮助 AI 理解期望的回答方式。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={assistantConfig.segment4}
                    onChange={(e) => setAssistantConfig({ ...assistantConfig, segment4: e.target.value })}
                    placeholder="例：用户问：有没有北京的人脉？\n回答：找到 2 位北京的人脉：\n1. 张三..."
                    className="min-h-[200px] font-mono text-sm"
                  />
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* 代码备忘录 */}
        <TabsContent value="code-memo" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>📝 代码层面的安全限制</CardTitle>
              <CardDescription>
                以下是在代码中实现的安全限制，这些是强制执行的，无法通过提示词绕过。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 速率限制 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">① 速率限制（Rate Limiting）</h3>
                <p className="text-sm text-muted-foreground">
                  防止用户恶意批量操作，限制每个用户在一定时间内的操作次数。
                </p>
                <div className="rounded-lg bg-muted p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="font-medium text-sm">添加人脉</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        每分钟: 10次 | 每小时: 50次 | 每天: 200次
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-sm">修改人脉</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        每分钟: 20次 | 每小时: 100次 | 每天: 500次
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-sm">删除人脉</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        每分钟: 5次 | 每小时: 20次 | 每天: 50次
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-sm">添加联络记录</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        每分钟: 15次 | 每小时: 100次 | 每天: 500次
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-sm">标签操作</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        每分钟: 20次 | 每小时: 100次 | 每天: 500次
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-sm">扩展字段操作</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        每分钟: 20次 | 每小时: 100次 | 每天: 500次
                      </p>
                    </div>
                  </div>
                  <div className="pt-3 border-t">
                    <p className="text-xs text-muted-foreground">
                      <strong>修改方法：</strong>
                    </p>
                    <ol className="text-xs text-muted-foreground mt-2 space-y-1 list-decimal list-inside">
                      <li>打开文件：<code className="bg-background px-1 py-0.5 rounded">server/ai-rate-limit.ts</code></li>
                      <li>找到 <code className="bg-background px-1 py-0.5 rounded">RATE_LIMITS</code> 配置对象</li>
                      <li>修改对应操作的 <code className="bg-background px-1 py-0.5 rounded">perMinute</code> / <code className="bg-background px-1 py-0.5 rounded">perHour</code> / <code className="bg-background px-1 py-0.5 rounded">perDay</code> 数值</li>
                      <li>重新构建：<code className="bg-background px-1 py-0.5 rounded">pnpm run build</code></li>
                      <li>重启服务器</li>
                    </ol>
                  </div>
                </div>
              </div>

              {/* 操作日志 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">② 操作日志（Operation Logs）</h3>
                <p className="text-sm text-muted-foreground">
                  记录所有AI操作，便于追溯和审计。
                </p>
                <div className="rounded-lg bg-muted p-4 space-y-3">
                  <p className="text-sm">每次AI执行操作时，会自动记录以下信息：</p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>用户ID</li>
                    <li>操作类型（添加/修改/删除等）</li>
                    <li>操作详情（如：添加了哪个人脉）</li>
                    <li>操作时间</li>
                  </ul>
                  <div className="pt-3 border-t">
                    <p className="text-xs text-muted-foreground">
                      <strong>查看日志：</strong>
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      连接数据库，查询 <code className="bg-background px-1 py-0.5 rounded">ai_operation_logs</code> 表
                    </p>
                  </div>
                </div>
              </div>

              {/* 权限检查 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">③ 权限检查（Permission Check）</h3>
                <p className="text-sm text-muted-foreground">
                  确保用户只能操作自己的数据，无法跨账户操作。
                </p>
                <div className="rounded-lg bg-muted p-4 space-y-3">
                  <p className="text-sm">所有操作函数都会检查：</p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>用户是否有权访问该人脉</li>
                    <li>人脉是否属于该用户</li>
                    <li>是否是共享给该用户的人脉（VIP 3功能）</li>
                  </ul>
                  <div className="pt-3 border-t">
                    <p className="text-xs text-muted-foreground">
                      <strong>实现位置：</strong>
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      <code className="bg-background px-1 py-0.5 rounded">server/ai-tools.ts</code> 中的 <code className="bg-background px-1 py-0.5 rounded">getAllVisibleContactIds()</code> 函数
                    </p>
                  </div>
                </div>
              </div>

              {/* 提示 */}
              <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4">
                <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">
                  ⚠️ 重要提示
                </p>
                <p className="text-xs text-yellow-800 dark:text-yellow-300 mt-2">
                  以上限制是在<strong>代码层面</strong>强制执行的，无法通过修改提示词绕过。如需调整，必须修改代码并重新部署。
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 企业认证 */}
        <TabsContent value="prompts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>System Prompt</CardTitle>
              <CardDescription>
                定义 AI 的角色和行为方式。这是 AI 的"身份设定"，会影响所有回复的风格和方向。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={config.systemPrompt}
                onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
                placeholder="输入 System Prompt..."
                className="min-h-[150px] font-mono text-sm"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>User Prompt Template</CardTitle>
              <CardDescription>
                用户提示词模板。使用 {`{{name}}`}、{`{{company}}`} 等变量，支持 {`{{#if field}}...{{/if}}`} 条件语句。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={config.userPromptTemplate}
                onChange={(e) => setConfig({ ...config, userPromptTemplate: e.target.value })}
                placeholder="输入 User Prompt Template..."
                className="min-h-[400px] font-mono text-sm"
              />
              <div className="mt-4 p-4 bg-muted rounded-lg text-sm">
                <p className="font-medium mb-2">可用变量：</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>{`{{name}}`} - 姓名</li>
                  <li>{`{{company}}`} - 公司</li>
                  <li>{`{{position}}`} - 职位</li>
                  <li>{`{{wechat}}`} - 微信号</li>
                  <li>{`{{phone}}`} - 手机号</li>
                  <li>{`{{email}}`} - 邮箱</li>
                  <li>{`{{notes}}`} - 备注</li>
                  <li>{`{{tags}}`} - 标签（自动转为逗号分隔）</li>
                  <li>{`{{contactHistory}}`} - 联系记录（自动格式化）</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 参数配置 */}
        <TabsContent value="parameters" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Temperature</CardTitle>
              <CardDescription>
                控制 AI 回复的随机性和创造性。值越高越随机，值越低越确定。建议范围：0.0-1.0
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>当前值：{config.temperature.toFixed(2)}</Label>
                <span className="text-sm text-muted-foreground">
                  {config.temperature < 0.3 ? '保守' : config.temperature < 0.7 ? '平衡' : '创造'}
                </span>
              </div>
              <Slider
                value={[config.temperature]}
                onValueChange={([value]) => setConfig({ ...config, temperature: value })}
                min={0}
                max={2}
                step={0.1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0.0 (确定)</span>
                <span>1.0 (平衡)</span>
                <span>2.0 (随机)</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Max Tokens</CardTitle>
              <CardDescription>
                控制 AI 回复的最大长度。1 token ≈ 0.75 个中文字。建议范围：1000-3000
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>当前值：{config.maxTokens}</Label>
                <span className="text-sm text-muted-foreground">
                  约 {Math.round(config.maxTokens * 0.75)} 个中文字
                </span>
              </div>
              <Slider
                value={[config.maxTokens]}
                onValueChange={([value]) => setConfig({ ...config, maxTokens: value })}
                min={100}
                max={4000}
                step={100}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>100</span>
                <span>2000</span>
                <span>4000</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 企业报告管理 */}
        <TabsContent value="companyReports" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>AI 企业报告管理</CardTitle>
              <CardDescription>
                管理企查查报告，使用 DeepSeek AI 自动格式化企业信息
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CompanyReportManagement />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
