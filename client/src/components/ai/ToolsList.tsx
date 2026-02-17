import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wrench, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

interface Tool {
  name: string;
  description: string;
  category: string;
  parameters: ToolParameter[];
}

export default function ToolsList() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadTools();
  }, []);

  const loadTools = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/ai/assistant/tools');
      const result = await response.json();
      
      if (result.success) {
        setTools(result.data.tools);
      } else {
        toast.error(result.error || '无法加载工具列表');
      }
    } catch (error: any) {
      console.error('加载工具列表错误:', error);
      toast.error('网络错误，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTool = (toolName: string) => {
    const newExpanded = new Set(expandedTools);
    if (newExpanded.has(toolName)) {
      newExpanded.delete(toolName);
    } else {
      newExpanded.add(toolName);
    }
    setExpandedTools(newExpanded);
  };

  // 按分类分组工具
  const toolsByCategory = tools.reduce((acc, tool) => {
    if (!acc[tool.category]) {
      acc[tool.category] = [];
    }
    acc[tool.category].push(tool);
    return acc;
  }, {} as Record<string, Tool[]>);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            工具列表
          </CardTitle>
          <CardDescription>
            AI助手可以调用的所有工具
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="w-5 h-5" />
          工具列表
          <Badge variant="secondary">{tools.length} 个工具</Badge>
        </CardTitle>
        <CardDescription>
          AI助手可以调用的所有工具。当用户提问时，AI会根据问题自动选择合适的工具。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(toolsByCategory).map(([category, categoryTools]) => (
          <div key={category} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">{category}</h3>
            <div className="space-y-2">
              {categoryTools.map((tool) => {
                const isExpanded = expandedTools.has(tool.name);
                return (
                  <div
                    key={tool.name}
                    className="border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div
                      className="flex items-start justify-between cursor-pointer"
                      onClick={() => toggleTool(tool.name)}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                          <code className="text-sm font-mono font-semibold">{tool.name}</code>
                          {tool.parameters.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {tool.parameters.length} 个参数
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 ml-6">
                          {tool.description}
                        </p>
                      </div>
                    </div>

                    {isExpanded && tool.parameters.length > 0 && (
                      <div className="mt-3 ml-6 pl-4 border-l-2 space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground">参数列表：</p>
                        {tool.parameters.map((param) => (
                          <div key={param.name} className="text-xs">
                            <div className="flex items-center gap-2">
                              <code className="font-mono font-semibold">{param.name}</code>
                              <Badge variant={param.required ? "default" : "secondary"} className="text-xs">
                                {param.type}
                              </Badge>
                              {param.required && (
                                <Badge variant="destructive" className="text-xs">必填</Badge>
                              )}
                            </div>
                            <p className="text-muted-foreground mt-1">{param.description}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
