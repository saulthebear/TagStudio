import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@tagstudio/ui";

import { recordClientError } from "./telemetry";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallbackTitle?: string;
  onOpenDiagnostics?: () => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    recordClientError(error, {
      errorType: error.name || "ReactRenderError",
      stackTrace: error.stack,
      context: {
        componentStack: errorInfo.componentStack
      },
      immediateFlush: true
    });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <section className="panel m-4 p-6 bg-red-950/40 border border-red-800 rounded-lg text-red-100 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-red-200">
              {this.props.fallbackTitle || "An unexpected UI error occurred"}
            </h2>
            <div className="flex gap-2">
              {this.props.onOpenDiagnostics ? (
                <Button variant="secondary" onClick={this.props.onOpenDiagnostics}>
                  Diagnostics
                </Button>
              ) : null}
              <Button variant="default" onClick={this.handleReset}>
                Try Again
              </Button>
            </div>
          </div>

          <p className="text-sm font-mono bg-black/40 p-3 rounded border border-red-900/60 overflow-x-auto text-red-300">
            {this.state.error?.message || "Unknown error"}
          </p>

          {this.state.errorInfo?.componentStack ? (
            <details className="text-xs text-red-400 cursor-pointer">
              <summary className="font-semibold select-none mb-1">Component Stack</summary>
              <pre className="p-2 bg-black/50 rounded overflow-x-auto font-mono text-[11px] leading-relaxed">
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          ) : null}
        </section>
      );
    }

    return this.props.children;
  }
}
