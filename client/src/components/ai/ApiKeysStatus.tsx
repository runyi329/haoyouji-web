import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Key, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface ApiKey {
  name: string;
  description: string;
  configured: boolean;
  value: string | null;
}

export default function ApiKeysStatus() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadApiStatus();
  }, []);

  const loadApiStatus = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/ai/assistant/api-status');
      const result = await response.json();
      
      if (result.success) {
        setApiKeys(result.data.apiKeys);
      } else {
        toast.error(result.error || '无法加载API配置状态');
      }
    } catch (error: any) {
      console.error('加载API状态错误:', error);
      toast.error('网络错误，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            API 配置状态
          </CardTitle>
          <CardDescription>
            查看当前配置的API密钥状态
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
          <Key className="w-5 h-5" />
          API 配置状态
        </CardTitle>
        <CardDescription>
          当前配置的API密钥状态。如需修改，请在服务器的 .env 文件中配置。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {apiKeys.map((apiKey) => (
            <div
              key={apiKey.name}
              className="flex items-start justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono font-semibold">{apiKey.name}</code>
                  {apiKey.configured ? (
                    <Badge variant="default" className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      已配置
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="flex items-center gap-1">
                      <XCircle className="w-3 h-3" />
                      未配置
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {apiKey.description}
                </p>
                {apiKey.configured && apiKey.value && (
                  <code className="text-xs text-muted-foreground mt-1 block">
                    {apiKey.value}
                  </code>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 bg-muted rounded-lg">
          <p className="text-xs text-muted-foreground">
            <strong>提示：</strong>如需修改API密钥，请在服务器上编辑 <code className="font-mono">/root/haoyouji-web/.env</code> 文件，
            然后运行 <code className="font-mono">pm2 restart haoyouji-web</code> 重启服务。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
