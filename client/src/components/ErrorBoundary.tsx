import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: { componentStack?: string } | null;
  errorCount: number;
}

// 上报错误到服务器，方便排查
function reportErrorToServer(error: Error, componentStack?: string) {
  try {
    fetch('/api/log-client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {}); // 静默失败，不影响用户
  } catch {}
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, errorCount: 0 };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string }) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // 上报到服务器
    reportErrorToServer(error, errorInfo.componentStack);
    
    // 如果错误次数小于3，尝试自动恢复
    if (this.state.errorCount < 3) {
      setTimeout(() => {
        this.setState({ 
          hasError: false, 
          error: null,
          errorInfo: null,
          errorCount: this.state.errorCount + 1 
        });
      }, 1000);
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const errMsg = this.state.error?.message || '未知错误';
      const errStack = this.state.error?.stack || '';
      const compStack = (this.state.errorInfo as any)?.componentStack || '';

      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-2">页面出现错误</h2>
            <p className="text-sm text-gray-600 mb-4">正在尝试自动恢复，或点击下方按钮刷新页面</p>

            {errMsg && (
              <div className="p-3 w-full rounded bg-red-50 border border-red-200 mb-3">
                <p className="text-sm font-medium text-red-700">{errMsg}</p>
              </div>
            )}

            {(errStack || compStack) && (
              <div className="p-4 w-full rounded bg-muted overflow-auto mb-6 max-h-40">
                <pre className="text-xs text-muted-foreground whitespace-break-spaces">
                  {errStack || compStack}
                </pre>
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-lg",
                "bg-[#A80000] text-white",
                "hover:opacity-90 cursor-pointer transition-opacity"
              )}
            >
              <RotateCcw size={16} />
              刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
