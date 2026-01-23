import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, RefreshCw, Eye, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ReactMarkdown from 'react-markdown';

interface ContactHistoryRecord {
  date: string;
  type: string;
  content: string;
}

interface Contact {
  id?: string;
  name: string;
  company?: string;
  position?: string;
  wechat?: string;
  phone?: string;
  email?: string;
  notes?: string;
  tags?: string[];
  contactHistory?: ContactHistoryRecord[];
}

interface AIBackgroundCheckProps {
  contact: Contact;
  onDataUpdate?: (newData: Partial<Contact>) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showButton?: boolean; // 是否显示内部按钮，默认 true
}

interface AISearchResult {
  rawAnalysis: string;
  searchQuery: {
    name: string;
    company?: string;
    position?: string;
  };
  timestamp: string;
  source: string;
  contactId?: string;
}

interface HistoryRecord {
  id: string;
  contactId: string;
  timestamp: string;
  source: string;
  summary: string;
}

export function AIBackgroundCheck({ contact, onDataUpdate, open: externalOpen, onOpenChange: externalOnOpenChange, showButton = true }: AIBackgroundCheckProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AISearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [internalDialogOpen, setInternalDialogOpen] = useState(false);
  
  // 使用外部控制或内部状态
  const isDialogOpen = externalOpen !== undefined ? externalOpen : internalDialogOpen;
  const setIsDialogOpen = (open: boolean) => {
    if (externalOnOpenChange) {
      externalOnOpenChange(open);
    } else {
      setInternalDialogOpen(open);
    }
  };
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [lastSearchTime, setLastSearchTime] = useState<string | null>(null);

  // 获取历史记录
  useEffect(() => {
    if (contact.id) {
      fetchHistory();
    }
  }, [contact.id]);

  const fetchHistory = async () => {
    if (!contact.id) return;

    try {
      const response = await fetch(`/api/ai/background-check/${contact.id}/history`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data.data.history || []);
        setLastSearchTime(data.data.lastSearchTime);
      }
    } catch (err) {
      console.error('获取历史记录失败:', err);
    }
  };

  const handleSearch = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/background-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: contact.name,
          company: contact.company,
          position: contact.position,
          wechat: contact.wechat,
          phone: contact.phone,
          email: contact.email,
          notes: contact.notes,
          tags: contact.tags,
          contactHistory: contact.contactHistory,
          contactId: contact.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || '搜索失败');
      }

      setResult(data.data);
      setIsDialogOpen(true);
      
      // 刷新历史记录
      await fetchHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败，请稍后重试');
      console.error('AI 背调错误:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getButtonText = () => {
    if (isLoading) return 'AI 搜索中...';
    if (lastSearchTime) {
      const timeDiff = Date.now() - new Date(lastSearchTime).getTime();
      const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      
      if (daysDiff === 0) return '更新背调 (今天)';
      if (daysDiff < 30) return `更新背调 (${daysDiff}天前)`;
      if (daysDiff < 90) return `更新背调 (${Math.floor(daysDiff / 30)}个月前)`;
      return `更新背调 (${Math.floor(daysDiff / 30)}个月前)`;
    }
    return 'AI 背调';
  };

  const getButtonIcon = () => {
    if (isLoading) return <Loader2 className="mr-2 h-4 w-4 animate-spin" />;
    if (lastSearchTime) return <RefreshCw className="mr-2 h-4 w-4" />;
    return <Sparkles className="mr-2 h-4 w-4" />;
  };

  // 当外部控制打开时，自动触发搜索
  const [hasAutoSearched, setHasAutoSearched] = useState(false);
  
  useEffect(() => {
    if (externalOpen && !hasAutoSearched && !isLoading) {
      setHasAutoSearched(true);
      handleSearch();
    }
    if (!externalOpen) {
      setHasAutoSearched(false);
    }
  }, [externalOpen]);

  return (
    <>
      {showButton && (
        <div className="flex flex-col gap-2">
          <Button
          onClick={handleSearch}
          disabled={isLoading}
          variant={lastSearchTime ? 'outline' : 'default'}
          className="w-full"
        >
          {getButtonIcon()}
          {getButtonText()}
        </Button>

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-4">
              <p className="text-sm text-destructive">{error}</p>
              {error.includes('API Key') && (
                <p className="text-xs text-muted-foreground mt-2">
                  请访问{' '}
                  <a
                    href="https://platform.deepseek.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    platform.deepseek.com
                  </a>{' '}
                  获取 API Key
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {lastSearchTime && !isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>上次搜索: {new Date(lastSearchTime).toLocaleString('zh-CN')}</span>
            {history.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={() => setIsDialogOpen(true)}
              >
                <Eye className="h-3 w-3 mr-1" />
                查看历史
              </Button>
            )}
          </div>
        )}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {contact.name} 的 AI 背调报告
            </DialogTitle>
            <DialogDescription>
              {result && (
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <span className="text-xs">🤖</span>
                    AI 生成
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(result.timestamp).toLocaleString('zh-CN')}
                  </span>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 space-y-6">
            {isLoading && (
              <div className="space-y-6">
                {/* 骨架屏加载状态 */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <CardTitle className="text-base">AI 正在分析中...</CardTitle>
                    </div>
                    <CardDescription>
                      正在搜索公开信息并生成报告，预计需要 10-15 秒
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* 骨架屏元素 */}
                    <div className="space-y-3">
                      <div className="h-4 bg-muted rounded animate-pulse" />
                      <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
                      <div className="h-4 bg-muted rounded animate-pulse w-4/6" />
                    </div>
                    <div className="space-y-3 mt-6">
                      <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                      <div className="h-4 bg-muted rounded animate-pulse" />
                      <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
                    </div>
                    <div className="space-y-3 mt-6">
                      <div className="h-4 bg-muted rounded animate-pulse w-4/6" />
                      <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
                      <div className="h-4 bg-muted rounded animate-pulse" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {!isLoading && result && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">搜索结果</CardTitle>
                  <CardDescription>
                    基于: {result.searchQuery.name}
                    {result.searchQuery.company && ` · ${result.searchQuery.company}`}
                    {result.searchQuery.position && ` · ${result.searchQuery.position}`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{result.rawAnalysis}</ReactMarkdown>
                  </div>
                </CardContent>
              </Card>
            )}

            {history.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">历史记录</CardTitle>
                  <CardDescription>过往的 AI 背调记录</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {history.map((record) => (
                      <div
                        key={record.id}
                        className="flex items-start gap-3 p-3 rounded-lg border bg-muted/50"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {record.source}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(record.timestamp).toLocaleString('zh-CN')}
                            </span>
                          </div>
                          <p className="text-sm">{record.summary}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {!result && history.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>暂无搜索结果</p>
                <p className="text-sm mt-2">点击"AI 背调"按钮开始搜索</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
