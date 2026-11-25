import * as React from 'react';
import { reportClientError } from '@/lib/errorReporter';

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    reportClientError({
      errorName: error.name || 'ReactRenderError',
      message: error.message || 'Component render crash',
      stack: [error.stack || '', errorInfo.componentStack || ''].filter(Boolean).join('\n'),
    });
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <h1 className="text-base font-bold text-slate-900">页面渲染出现异常</h1>
            <p className="mt-2 text-xs text-slate-500 leading-relaxed">
              该问题已自动上报给开发团队进行排查修复，你可以先刷新页面继续使用。
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
            >
              重新加载页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
