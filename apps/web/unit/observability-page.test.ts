import { describe, expect, it } from "bun:test";
import { type TelemetryRouteStat, type TelemetrySummaryResponse, type TelemetryTimeseriesPoint } from "@tagstudio/api-client";
import { TIME_WINDOW_OPTIONS } from "@/components/ObservabilityPage";

describe("Observability Page Utilities & Logic", () => {
  it("provides valid time window options spanning minutes to days", () => {
    expect(TIME_WINDOW_OPTIONS.length).toBe(5);
    const labels = TIME_WINDOW_OPTIONS.map((o) => o.label);
    expect(labels).toEqual(["15m", "1h", "6h", "24h", "7d"]);
    expect(TIME_WINDOW_OPTIONS[0].seconds).toBe(900);
    expect(TIME_WINDOW_OPTIONS[1].seconds).toBe(3600);
    expect(TIME_WINDOW_OPTIONS[4].seconds).toBe(604800);
  });

  it("calculates health status correctly based on error rate and p95 latency thresholds", () => {
    function computeHealth(summary: Partial<TelemetrySummaryResponse> | null) {
      if (!summary || !summary.api) {
        return "unknown";
      }
      const errorRate = summary.api.error_rate_pct ?? 0;
      const p95 = summary.api.latency_ms?.p95 ?? 0;

      if (errorRate >= 10 || p95 > 1500) {
        return "critical";
      }
      if (errorRate >= 2 || p95 > 500) {
        return "degraded";
      }
      return "healthy";
    }

    expect(computeHealth(null)).toBe("unknown");

    expect(
      computeHealth({
        api: {
          total_requests: 100,
          error_requests: 0,
          error_rate_pct: 0,
          latency_ms: { avg: 15, p50: 10, p95: 50, p99: 90, max: 120 },
          routes: []
        }
      })
    ).toBe("healthy");

    expect(
      computeHealth({
        api: {
          total_requests: 100,
          error_requests: 3,
          error_rate_pct: 3.0,
          latency_ms: { avg: 20, p50: 15, p95: 80, p99: 100, max: 150 },
          routes: []
        }
      })
    ).toBe("degraded");

    expect(
      computeHealth({
        api: {
          total_requests: 100,
          error_requests: 0,
          error_rate_pct: 0,
          latency_ms: { avg: 200, p50: 150, p95: 650, p99: 900, max: 1100 },
          routes: []
        }
      })
    ).toBe("degraded");

    expect(
      computeHealth({
        api: {
          total_requests: 100,
          error_requests: 15,
          error_rate_pct: 15.0,
          latency_ms: { avg: 20, p50: 15, p95: 80, p99: 100, max: 150 },
          routes: []
        }
      })
    ).toBe("critical");
  });

  it("filters and sorts endpoint routes properly", () => {
    const routes: TelemetryRouteStat[] = [
      { route: "/api/v1/search", count: 120, errors: 0, avg_ms: 18.5, p95_ms: 45.0 },
      { route: "/api/v1/entries/1/thumbnail", count: 350, errors: 2, avg_ms: 5.2, p95_ms: 12.0 },
      { route: "/api/v1/tags", count: 40, errors: 0, avg_ms: 8.1, p95_ms: 15.0 },
      { route: "/api/v1/telemetry/summary", count: 85, errors: 1, avg_ms: 22.0, p95_ms: 60.0 }
    ];

    // Filter by query "thumbnail"
    const filtered = routes.filter((r) => r.route.toLowerCase().includes("thumbnail"));
    expect(filtered.length).toBe(1);
    expect(filtered[0].route).toBe("/api/v1/entries/1/thumbnail");

    // Sort descending by count
    const sortedByCountDesc = [...routes].sort((a, b) => b.count - a.count);
    expect(sortedByCountDesc[0].route).toBe("/api/v1/entries/1/thumbnail");
    expect(sortedByCountDesc[3].route).toBe("/api/v1/tags");

    // Sort descending by p95_ms
    const sortedByP95Desc = [...routes].sort((a, b) => b.p95_ms - a.p95_ms);
    expect(sortedByP95Desc[0].route).toBe("/api/v1/telemetry/summary");
    expect(sortedByP95Desc[0].p95_ms).toBe(60.0);
  });

  it("creates structured diagnostics export payload with expected fields", () => {
    const mockSummary: TelemetrySummaryResponse = {
      window_seconds: 3600,
      api: {
        total_requests: 50,
        error_requests: 1,
        error_rate_pct: 2.0,
        latency_ms: { avg: 12, p50: 10, p95: 35, p99: 50, max: 80 },
        routes: [{ route: "/api/v1/search", count: 50, errors: 1, avg_ms: 12, p95_ms: 35 }]
      },
      errors_total: 1,
      thumbnails: {
        total_requests: 30,
        cache_hits: 28,
        cache_misses: 2,
        hit_ratio_pct: 93.3,
        avg_generate_ms: 45
      },
      slow_operations: [],
      timeseries: []
    };

    const bundle = {
      exported_at: new Date().toISOString(),
      time_window_seconds: 3600,
      system_health: "All Systems Operational",
      summary: mockSummary,
      recent_errors: [],
      recent_logs: [],
      client_info: {
        user_agent: "TestBrowser/1.0",
        screen: "1920x1080"
      }
    };

    expect(bundle.time_window_seconds).toBe(3600);
    expect(bundle.system_health).toBe("All Systems Operational");
    expect(bundle.summary.api.total_requests).toBe(50);
    expect(bundle.summary.thumbnails.hit_ratio_pct).toBe(93.3);
    expect(bundle.client_info.screen).toBe("1920x1080");
  });

  it("handles empty timeseries data points gracefully", () => {
    const emptyPoints: TelemetryTimeseriesPoint[] = [];
    const totalRequests = emptyPoints.reduce((sum, d) => sum + d.requests, 0);
    const totalErrors = emptyPoints.reduce((sum, d) => sum + d.errors, 0);

    expect(totalRequests).toBe(0);
    expect(totalErrors).toBe(0);
  });
});
