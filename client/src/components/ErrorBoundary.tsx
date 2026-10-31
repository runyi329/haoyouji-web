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

const CHUNK_RECOVERY_KEY = 'maidong:chunk-recovery-at';
const CHUNK_RECOVERY_WINDOW_MS = 60_000;

function canRetryChunkLoadOnce(): boolean {
  try {
    const previousAttempt = Number(sessionStorage.getItem(CHUNK_RECOVERY_KEY) || 0);
    if (Number.isFinite(previousAttempt) && Date.now() - previousAttempt < CHUNK_RECOVERY_WINDOW_MS) {
      return false;
    }
    sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(Date.now()));
    return true;
  } catch {
    // 存储不可用时宁可展示可操作错误页，也不要进入无限刷新。
    return false;
  }
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
    reportErrorToServer(error, errorInfo.componentStack);

    // 首次 chunk 失败允许受控重试一次；网络仍不稳定或旧资源已失效时保留可见错误页，
    // 避免 Safari/PWA 无限刷新后看起来像白屏。
    if (isChunkLoadError(error) && canRetryChunkLoadOnce()) {
      console.warn('检测到 chunk 加载失败，执行一次受控刷新...');
      window.setTimeout(() => window.location.reload(), 120);
      return;
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const errMsg = this.state.error?.message || '未知错误';
      const isChunkError = this.state.error ? isChunkLoadError(this.state.error) : false;

      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-2">{isChunkError ? '页面资源暂时无法连接' : '页面出现错误'}</h2>
            <p className="text-sm text-gray-600 mb-4">
              {isChunkError ? '请检查网络后重新连接，若刚更新应用可稍后再试。' : '请点击下方按钮刷新页面'}
            </p>

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
