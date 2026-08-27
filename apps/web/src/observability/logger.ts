import { getActiveTraceId } from "./tracer";

export type Breadcrumb = {
  timestamp: string;
  name: string;
  traceId: string | null;
  metadata?: Record<string, unknown>;
};

const MAX_BREADCRUMBS = 50;
const breadcrumbsBuffer: Breadcrumb[] = [];

export function addBreadcrumb(name: string, metadata?: Record<string, unknown>): void {
  const item: Breadcrumb = {
    timestamp: new Date().toISOString(),
    name,
    traceId: getActiveTraceId(),
    metadata
  };

  breadcrumbsBuffer.push(item);
  if (breadcrumbsBuffer.length > MAX_BREADCRUMBS) {
    breadcrumbsBuffer.shift();
  }
}

export function getRecentBreadcrumbs(): Breadcrumb[] {
  return [...breadcrumbsBuffer];
}

export function clearBreadcrumbs(): void {
  breadcrumbsBuffer.length = 0;
}

export const clientLog = {
  info(message: string, context?: Record<string, unknown>) {
    addBreadcrumb(`log.info: ${message}`, context);
    console.info(`[TagStudio] ${message}`, context ?? "");
  },
  warn(message: string, context?: Record<string, unknown>) {
    addBreadcrumb(`log.warn: ${message}`, context);
    console.warn(`[TagStudio] ${message}`, context ?? "");
  },
  error(message: string, error?: unknown, context?: Record<string, unknown>) {
    const errorDetails = error instanceof Error ? { error: error.message, stack: error.stack } : { error };
    addBreadcrumb(`log.error: ${message}`, { ...context, ...errorDetails });
    console.error(`[TagStudio] ${message}`, error ?? "", context ?? "");
  }
};
