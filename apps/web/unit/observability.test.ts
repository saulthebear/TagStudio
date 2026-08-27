import { describe, expect, it } from "bun:test";

import {
  addBreadcrumb,
  clearBreadcrumbs,
  clientLog,
  getRecentBreadcrumbs
} from "@/observability/logger";
import {
  generateTraceId,
  getActiveTraceId,
  setActiveTraceId,
  withTrace,
  withTraceAsync
} from "@/observability/tracer";

describe("Observability Tracer", () => {
  it("generates unique non-empty trace IDs", () => {
    const id1 = generateTraceId();
    const id2 = generateTraceId();
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  it("sets and gets active trace ID correctly", () => {
    setActiveTraceId("test-trace-123");
    expect(getActiveTraceId()).toBe("test-trace-123");
    setActiveTraceId(null);
    expect(getActiveTraceId()).toBeNull();
  });

  it("manages scope in withTrace synchronously", () => {
    expect(getActiveTraceId()).toBeNull();
    let innerTrace: string | null = null;
    withTrace(() => {
      innerTrace = getActiveTraceId();
    }, "custom-trace-abc");

    expect(innerTrace).toBe("custom-trace-abc");
    expect(getActiveTraceId()).toBeNull();
  });

  it("manages scope in withTraceAsync asynchronously", async () => {
    expect(getActiveTraceId()).toBeNull();
    let innerTrace: string | null = null;
    await withTraceAsync(async () => {
      await new Promise((r) => setTimeout(r, 5));
      innerTrace = getActiveTraceId();
    }, "async-trace-xyz");

    expect(innerTrace).toBe("async-trace-xyz");
    expect(getActiveTraceId()).toBeNull();
  });
});

describe("Observability Logger & Breadcrumbs", () => {
  it("records breadcrumbs with trace ID and timestamp", () => {
    clearBreadcrumbs();
    setActiveTraceId("trace-bread-1");
    addBreadcrumb("user.clicked_button", { buttonId: "save" });

    const breadcrumbs = getRecentBreadcrumbs();
    expect(breadcrumbs.length).toBe(1);
    expect(breadcrumbs[0].name).toBe("user.clicked_button");
    expect(breadcrumbs[0].traceId).toBe("trace-bread-1");
    expect(breadcrumbs[0].metadata?.buttonId).toBe("save");
    expect(breadcrumbs[0].timestamp).toBeTruthy();
    setActiveTraceId(null);
  });

  it("caps breadcrumbs at maximum buffer capacity (50)", () => {
    clearBreadcrumbs();
    for (let i = 0; i < 60; i++) {
      addBreadcrumb(`event_${i}`);
    }

    const breadcrumbs = getRecentBreadcrumbs();
    expect(breadcrumbs.length).toBe(50);
    expect(breadcrumbs[0].name).toBe("event_10");
    expect(breadcrumbs[49].name).toBe("event_59");
  });

  it("clientLog methods add breadcrumbs", () => {
    clearBreadcrumbs();
    clientLog.info("info message", { x: 1 });
    clientLog.warn("warn message", { y: 2 });
    clientLog.error("error message", new Error("test crash"), { z: 3 });

    const breadcrumbs = getRecentBreadcrumbs();
    expect(breadcrumbs.length).toBe(3);
    expect(breadcrumbs[0].name).toContain("log.info: info message");
    expect(breadcrumbs[1].name).toContain("log.warn: warn message");
    expect(breadcrumbs[2].name).toContain("log.error: error message");
  });
});
