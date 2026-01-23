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

export default function AIManagement() {
  const [, setLocation] = useLocation();
  // toast is imported from sonner
  const [config, setConfig] = useState<PromptsConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // 加载配置
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/ai/prompts');
      const result = await response.json();
      
      if (result.success) {
        setConfig(result.data);
      } else {
        toast({
          title: '加载失败',
          description: result.error || '无法加载 AI 配置',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('加载 AI 配置错误:', error);
      toast({
        title: '加载失败',
        description: '网络错误，请稍后重试',
        variant: 'destructive',
      });
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
        toast({
          title: '保存成功',
          description: 'AI 配置已更新',
        });
      } else {
        toast({
          title: '保存失败',
          description: result.error || '无法保存 AI 配置',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('保存 AI 配置错误:', error);
      toast({
        title: '保存失败',
        description: '网络错误，请稍后重试',
        variant: 'destructive',
      });
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
        toast({
          title: '重置成功',
          description: 'AI 配置已恢复为默认值',
        });
      } else {
        toast({
          title: '重置失败',
          description: result.error || '无法重置 AI 配置',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('重置 AI 配置错误:', error);
      toast({
        title: '重置失败',
        description: '网络错误，请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
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
      <Tabs defaultValue="prompts" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="prompts">提示词管理</TabsTrigger>
          <TabsTrigger value="parameters">参数配置</TabsTrigger>
          <TabsTrigger value="companyReports">企业报告</TabsTrigger>
        </TabsList>

        {/* 提示词管理 */}
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
