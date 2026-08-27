import { type TelemetryEventItem } from "@tagstudio/api-client";

import { api } from "@/api/client";
import { addBreadcrumb, getRecentBreadcrumbs } from "./logger";
import { getActiveTraceId } from "./tracer";

const queuedEvents: TelemetryEventItem[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 5000;
const MAX_QUEUE_SIZE = 100;

export async function flushTelemetry(): Promise<void> {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }

  if (queuedEvents.length === 0) {
    return;
  }

  const batch = queuedEvents.splice(0, queuedEvents.length);
  try {
    await api.postTelemetryEvents({ events: batch });
  } catch {
    // If backend is unreachable or busy, don't crash the frontend.
    // Drop older events if buffer gets too large to prevent unbounded memory growth.
    if (queuedEvents.length < MAX_QUEUE_SIZE) {
      queuedEvents.unshift(...batch.slice(-20));
    }
  }
}

function scheduleFlush(): void {
  if (flushTimeout) {
    return;
  }
  flushTimeout = setTimeout(() => {
    flushTimeout = null;
    void flushTelemetry();
  }, FLUSH_INTERVAL_MS);
}

export function recordClientError(
  error: Error | string,
  options: {
    errorType?: string;
    stackTrace?: string;
    context?: Record<string, unknown>;
    immediateFlush?: boolean;
  } = {}
): void {
  const message = typeof error === "string" ? error : error.message;
  const stack = options.stackTrace || (error instanceof Error ? error.stack : undefined);
  const errorType = options.errorType || (error instanceof Error ? error.name : "ClientError");
  const traceId = getActiveTraceId() || undefined;

  const breadcrumbs = getRecentBreadcrumbs();
  const metadata = {
    ...(options.context ?? {}),
    recent_breadcrumbs: breadcrumbs.slice(-10)
  };

  queuedEvents.push({
    kind: "error",
    name: "client_error",
    error_type: errorType,
    message,
    stack_trace: stack,
    trace_id: traceId,
    metadata
  });

  addBreadcrumb(`error: ${message}`, { errorType, traceId });

  if (options.immediateFlush !== false) {
    void flushTelemetry();
  } else {
    scheduleFlush();
  }
}

export function recordTiming(
  name: string,
  durationMs: number,
  metadata?: Record<string, unknown>
): void {
  queuedEvents.push({
    kind: "timing",
    name,
    duration_ms: Math.round(durationMs * 100) / 100,
    trace_id: getActiveTraceId() || undefined,
    metadata
  });
  scheduleFlush();
}

export function recordBreadcrumbEvent(
  name: string,
  metadata?: Record<string, unknown>
): void {
  addBreadcrumb(name, metadata);
  queuedEvents.push({
    kind: "breadcrumb",
    name,
    trace_id: getActiveTraceId() || undefined,
    metadata
  });
  scheduleFlush();
}

let globalHandlersInstalled = false;

export function installGlobalErrorHandlers(): void {
  if (globalHandlersInstalled || typeof window === "undefined") {
    return;
  }
  globalHandlersInstalled = true;

  window.addEventListener("error", (event) => {
    recordClientError(event.error || event.message, {
      errorType: "UncaughtException",
      stackTrace: event.error?.stack,
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      }
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    recordClientError(reason instanceof Error ? reason : String(reason), {
      errorType: "UnhandledPromiseRejection",
      stackTrace: reason instanceof Error ? reason.stack : undefined
    });
  });
}
