let activeTraceId: string | null = null;

export function generateTraceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

export function getActiveTraceId(): string | null {
  return activeTraceId;
}

export function setActiveTraceId(traceId: string | null): void {
  activeTraceId = traceId;
}

export function withTrace<T>(fn: () => T, customTraceId?: string): T {
  const previous = activeTraceId;
  activeTraceId = customTraceId ?? generateTraceId();
  try {
    return fn();
  } finally {
    activeTraceId = previous;
  }
}

export async function withTraceAsync<T>(fn: () => Promise<T>, customTraceId?: string): Promise<T> {
  const previous = activeTraceId;
  activeTraceId = customTraceId ?? generateTraceId();
  try {
    return await fn();
  } finally {
    activeTraceId = previous;
  }
}
