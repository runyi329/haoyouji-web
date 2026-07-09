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
}

// 判断是否是 chunk 加载失败（部署后旧缓存导致）
function isChunkLoadError(error: Error): boolean {
  const msg = error.message || '';
  const name = error.name || '';
  return (
    msg.includes('Importing a module script failed') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Unable to preload CSS') ||
    msg.includes('error loading dynamically imported module') ||
    name === 'ChunkLoadError' ||
    /Loading chunk \d+ failed/.test(msg)
  );
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
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string }) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // chunk 加载失败：直接自动刷新，用户无感知
    if (isChunkLoadError(error)) {
      console.warn('检测到 chunk 加载失败（可能是新版本部署），自动刷新页面...');
      window.location.reload();
      return;
    }

    // 上报到服务器
    reportErrorToServer(error, errorInfo.componentStack);

    // 不再自动重置（会导致 Safari 检测到循环跳转），由用户手动点刷新
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // chunk 加载失败不进入错误展示状态，等 componentDidCatch 里刷新
    if (isChunkLoadError(error)) {
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const errMsg = this.state.error?.message || '未知错误';

      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-2">页面出现错误</h2>
            <p className="text-sm text-gray-600 mb-4">请点击下方按钮刷新页面</p>

            {errMsg && (
              <div className="p-3 w-full rounded bg-red-50 border border-red-200 mb-6">
                <p className="text-sm font-medium text-red-700">{errMsg}</p>
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
