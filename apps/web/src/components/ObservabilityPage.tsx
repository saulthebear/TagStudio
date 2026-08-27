import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type TelemetryErrorRecord,
  type TelemetrySummaryResponse
} from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  HardDrive,
  Layers,
  Minimize2,
  RefreshCw,
  Search,
  X
} from "lucide-react";

import { api } from "@/api/client";
import {
  EndpointBarChart,
  LatencyTrendChart,
  SlowOperationsCategoryChart,
  ThumbnailCacheGauge,
  ThroughputErrorChart
} from "@/components/ObservabilityCharts";

export type ObservabilityPageProps = {
  onBack: () => void;
  onMinimizeToModal?: () => void;
  initialTab?: ObservabilityTab;
};

export type ObservabilityTab = "overview" | "graphs" | "errors" | "slow" | "logs" | "system";

export type TimeWindowOption = {
  label: string;
  seconds: number;
};

export const TIME_WINDOW_OPTIONS: TimeWindowOption[] = [
  { label: "15m", seconds: 900 },
  { label: "1h", seconds: 3600 },
  { label: "6h", seconds: 21600 },
  { label: "24h", seconds: 86400 },
  { label: "7d", seconds: 604800 }
];

export function ObservabilityPage({
  onBack,
  onMinimizeToModal,
  initialTab = "overview"
}: ObservabilityPageProps) {
  const [activeTab, setActiveTab] = useState<ObservabilityTab>(initialTab);
  const [windowSeconds, setWindowSeconds] = useState<number>(3600);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(5000); // 0 = off, ms
  const [loading, setLoading] = useState(false);

  const [summary, setSummary] = useState<TelemetrySummaryResponse | null>(null);
  const [errors, setErrors] = useState<TelemetryErrorRecord[]>([]);
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);

  // Filter states
  const [routeSearchQuery, setRouteSearchQuery] = useState("");
  const [routeSortColumn, setRouteSortColumn] = useState<"route" | "count" | "errors" | "avg_ms" | "p95_ms">("count");
  const [routeSortAsc, setRouteSortAsc] = useState(false);
  const [selectedRouteFilter, setSelectedRouteFilter] = useState<string | null>(null);

  const [errorSearchQuery, setErrorSearchQuery] = useState("");
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  const [logFilterLevel, setLogFilterLevel] = useState<string>("all");
  const [logSearchQuery, setLogSearchQuery] = useState<string>("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "overview" || activeTab === "graphs" || activeTab === "slow") {
        const sum = await api.getTelemetrySummary(windowSeconds);
        setSummary(sum);
      } else if (activeTab === "errors") {
        const errs = await api.getTelemetryErrors(100);
        setErrors(errs);
        const sum = await api.getTelemetrySummary(windowSeconds);
        setSummary(sum);
      } else if (activeTab === "logs") {
        const logData = await api.getTelemetryLogs({
          limit: 200,
          level: logFilterLevel !== "all" ? logFilterLevel : undefined,
          query: logSearchQuery.trim() || undefined
        });
        setLogs(logData);
      } else if (activeTab === "system") {
        const sum = await api.getTelemetrySummary(windowSeconds);
        setSummary(sum);
      }
    } catch {
      // Ignore network errors when polling diagnostics
    } finally {
      setLoading(false);
    }
  }, [activeTab, logFilterLevel, logSearchQuery, windowSeconds]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (autoRefreshInterval <= 0) {
      return;
    }
    const interval = setInterval(() => {
      void fetchData();
    }, autoRefreshInterval);
    return () => clearInterval(interval);
  }, [autoRefreshInterval, fetchData]);

  // System Health status calculation
  const healthStatus = useMemo(() => {
    if (!summary) {
      return { status: "unknown", label: "Checking...", color: "text-slate-400 bg-slate-800" };
    }
    const errorRate = summary.api.error_rate_pct;
    const p95 = summary.api.latency_ms.p95;

    if (errorRate >= 10 || p95 > 1500) {
      return { status: "critical", label: "System Disrupted", color: "text-red-400 bg-red-950/80 border-red-800" };
    }
    if (errorRate >= 2 || p95 > 500) {
      return { status: "degraded", label: "Performance Degraded", color: "text-amber-400 bg-amber-950/80 border-amber-800" };
    }
    return { status: "healthy", label: "All Systems Operational", color: "text-emerald-400 bg-emerald-950/80 border-emerald-800" };
  }, [summary]);

  // Filtered & Sorted Routes
  const filteredRoutes = useMemo(() => {
    if (!summary?.api.routes) {
      return [];
    }
    let list = summary.api.routes;
    if (routeSearchQuery.trim()) {
      const q = routeSearchQuery.toLowerCase();
      list = list.filter((r) => r.route.toLowerCase().includes(q));
    }
    if (selectedRouteFilter) {
      list = list.filter((r) => r.route === selectedRouteFilter);
    }
    return [...list].sort((a, b) => {
      const valA = a[routeSortColumn];
      const valB = b[routeSortColumn];
      if (typeof valA === "string" && typeof valB === "string") {
        return routeSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return routeSortAsc ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
    });
  }, [summary, routeSearchQuery, selectedRouteFilter, routeSortColumn, routeSortAsc]);

  // Filtered Errors
  const filteredErrors = useMemo(() => {
    let list = errors;
    if (selectedTraceId) {
      list = list.filter((err) => err.trace_id === selectedTraceId);
    }
    if (errorSearchQuery.trim()) {
      const q = errorSearchQuery.toLowerCase();
      list = list.filter(
        (err) =>
          err.message.toLowerCase().includes(q) ||
          err.error_type.toLowerCase().includes(q) ||
          err.source.toLowerCase().includes(q) ||
          (err.trace_id && err.trace_id.toLowerCase().includes(q))
      );
    }
    return list;
  }, [errors, selectedTraceId, errorSearchQuery]);

  const handleExportDiagnostics = useCallback(() => {
    const bundle = {
      exported_at: new Date().toISOString(),
      time_window_seconds: windowSeconds,
      system_health: healthStatus.label,
      summary,
      recent_errors: errors.slice(0, 25),
      recent_logs: logs.slice(0, 50),
      client_info: {
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
        screen: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "unknown"
      }
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tagstudio-diagnostics-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [errors, healthStatus.label, logs, summary, windowSeconds]);

  return (
    <div className="observability-page flex flex-col h-screen w-full bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      {/* Top Header Bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-900/90 flex-shrink-0 gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
            onClick={onBack}
            title="Back to File Grid"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Files</span>
          </Button>

          <div className="flex items-center gap-2 border-l border-slate-700 pl-3">
            <Activity className="w-5 h-5 text-blue-400" />
            <h1 className="text-base font-bold text-slate-100 tracking-tight">
              System Diagnostics & Observability
            </h1>
            <span
              className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ml-2 ${healthStatus.color}`}
            >
              {healthStatus.label}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {/* Time Window Selector */}
          <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-lg p-0.5">
            {TIME_WINDOW_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.seconds}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  windowSeconds === opt.seconds
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                onClick={() => setWindowSeconds(opt.seconds)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Auto Refresh Toggle */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300">
            <div
              className={`w-2 h-2 rounded-full ${
                autoRefreshInterval > 0 ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
              }`}
            />
            <select
              className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer"
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
            >
              <option value={0} className="bg-slate-900 text-slate-200">
                Live: Off
              </option>
              <option value={2000} className="bg-slate-900 text-slate-200">
                Live: 2s
              </option>
              <option value={5000} className="bg-slate-900 text-slate-200">
                Live: 5s
              </option>
              <option value={10000} className="bg-slate-900 text-slate-200">
                Live: 10s
              </option>
            </select>
          </div>

          <Button
            variant="secondary"
            className="p-1.5 h-8 w-8 flex items-center justify-center"
            onClick={() => void fetchData()}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>

          <Button
            variant="secondary"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
            onClick={handleExportDiagnostics}
            title="Export Diagnostics Report (JSON)"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>

          {onMinimizeToModal ? (
            <Button
              variant="secondary"
              className="p-1.5 h-8 w-8 flex items-center justify-center text-slate-300 hover:text-white"
              onClick={onMinimizeToModal}
              title="Minimize to Modal"
            >
              <Minimize2 className="w-4 h-4" />
            </Button>
          ) : null}
        </div>
      </header>

      {/* Main Tab Navigation */}
      <nav className="flex items-center px-6 border-b border-slate-800 bg-slate-900/60 flex-shrink-0 gap-2">
        <button
          type="button"
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === "overview"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
          }`}
          onClick={() => setActiveTab("overview")}
        >
          <Activity className="w-4 h-4" />
          Overview
        </button>
        <button
          type="button"
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === "graphs"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
          }`}
          onClick={() => setActiveTab("graphs")}
        >
          <Layers className="w-4 h-4" />
          Interactive Graphs
        </button>
        <button
          type="button"
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === "errors"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
          }`}
          onClick={() => setActiveTab("errors")}
        >
          <AlertTriangle className="w-4 h-4" />
          Errors & Traces
          {summary && summary.errors_total > 0 ? (
            <span className="px-1.5 py-0.2 bg-red-500 text-white rounded-full text-[10px] font-bold">
              {summary.errors_total}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === "slow"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
          }`}
          onClick={() => setActiveTab("slow")}
        >
          <Clock className="w-4 h-4" />
          Slow Operations
          {summary && summary.slow_operations.length > 0 ? (
            <span className="px-1.5 py-0.2 bg-amber-500 text-black rounded-full text-[10px] font-bold">
              {summary.slow_operations.length}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === "logs"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
          }`}
          onClick={() => setActiveTab("logs")}
        >
          <FileText className="w-4 h-4" />
          Live Logs
        </button>
        <button
          type="button"
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === "system"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
          }`}
          onClick={() => setActiveTab("system")}
        >
          <HardDrive className="w-4 h-4" />
          System & Info
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-6">
        {activeTab === "overview" && (
          <div className="flex flex-col gap-6 max-w-7xl w-full mx-auto">
            {summary ? (
              <>
                {/* Metrics Cards Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col gap-1 shadow-sm">
                    <span className="text-xs text-slate-400 font-medium">p50 Latency</span>
                    <span className="text-2xl font-bold text-slate-100">
                      {summary.api.latency_ms.p50} <span className="text-xs font-normal text-slate-400">ms</span>
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Avg: {summary.api.latency_ms.avg} ms
                    </span>
                  </div>

                  <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col gap-1 shadow-sm">
                    <span className="text-xs text-slate-400 font-medium">p95 Latency</span>
                    <span className="text-2xl font-bold text-amber-400">
                      {summary.api.latency_ms.p95} <span className="text-xs font-normal text-slate-400">ms</span>
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Max: {summary.api.latency_ms.max} ms
                    </span>
                  </div>

                  <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col gap-1 shadow-sm">
                    <span className="text-xs text-slate-400 font-medium">Thumbnail Cache Hit</span>
                    <span className="text-2xl font-bold text-emerald-400">
                      {summary.thumbnails.hit_ratio_pct}%
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {summary.thumbnails.cache_hits} hits / {summary.thumbnails.total_requests} requests
                    </span>
                  </div>

                  <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col gap-1 shadow-sm">
                    <span className="text-xs text-slate-400 font-medium">Total API Requests</span>
                    <span className="text-2xl font-bold text-slate-100">
                      {summary.api.total_requests}
                    </span>
                    <span
                      className={`text-[11px] font-mono ${
                        summary.api.error_requests > 0 ? "text-red-400 font-semibold" : "text-slate-400"
                      }`}
                    >
                      {summary.api.error_requests} errors ({summary.api.error_rate_pct}%)
                    </span>
                  </div>
                </div>

                {/* Primary Interactive Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ThroughputErrorChart
                    data={summary.timeseries || []}
                    height={220}
                    title="API Requests & Errors Timeline"
                  />
                  <LatencyTrendChart
                    data={summary.timeseries || []}
                    height={220}
                    title="Latency Percentiles (p50, p95, Avg)"
                  />
                </div>

                {/* Performance Breakdown Table & Cache Gauge */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Searchable Endpoint Performance Table */}
                  <div className="lg:col-span-2 flex flex-col gap-3 p-4 bg-slate-900/90 border border-slate-800 rounded-xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                          Endpoint Performance
                        </h3>
                        {selectedRouteFilter && (
                          <button
                            type="button"
                            className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-900/80 text-blue-200 rounded text-[10px]"
                            onClick={() => setSelectedRouteFilter(null)}
                          >
                            <span>Filter: {selectedRouteFilter}</span>
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Table Search Filter */}
                      <div className="relative">
                        <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="text"
                          className="bg-slate-950/80 border border-slate-700/80 rounded px-2.5 py-1 pl-7 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-48 sm:w-60"
                          placeholder="Filter endpoints..."
                          value={routeSearchQuery}
                          onChange={(e) => setRouteSearchQuery(e.target.value)}
                        />
                      </div>
                    </div>

                    {filteredRoutes.length > 0 ? (
                      <div className="border border-slate-800 rounded-lg overflow-x-auto max-w-full bg-slate-950/40">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="sticky top-0 bg-slate-800/95 text-slate-300 font-semibold backdrop-blur z-10">
                            <tr>
                              <th
                                className="p-2.5 cursor-pointer hover:text-white"
                                onClick={() => {
                                  if (routeSortColumn === "route") {
                                    setRouteSortAsc(!routeSortAsc);
                                  } else {
                                    setRouteSortColumn("route");
                                    setRouteSortAsc(true);
                                  }
                                }}
                              >
                                Route
                              </th>
                              <th
                                className="p-2.5 text-right cursor-pointer hover:text-white"
                                onClick={() => {
                                  if (routeSortColumn === "count") {
                                    setRouteSortAsc(!routeSortAsc);
                                  } else {
                                    setRouteSortColumn("count");
                                    setRouteSortAsc(false);
                                  }
                                }}
                              >
                                Requests
                              </th>
                              <th
                                className="p-2.5 text-right cursor-pointer hover:text-white"
                                onClick={() => {
                                  if (routeSortColumn === "errors") {
                                    setRouteSortAsc(!routeSortAsc);
                                  } else {
                                    setRouteSortColumn("errors");
                                    setRouteSortAsc(false);
                                  }
                                }}
                              >
                                Errors
                              </th>
                              <th
                                className="p-2.5 text-right cursor-pointer hover:text-white"
                                onClick={() => {
                                  if (routeSortColumn === "avg_ms") {
                                    setRouteSortAsc(!routeSortAsc);
                                  } else {
                                    setRouteSortColumn("avg_ms");
                                    setRouteSortAsc(false);
                                  }
                                }}
                              >
                                Avg Latency
                              </th>
                              <th
                                className="p-2.5 text-right cursor-pointer hover:text-white"
                                onClick={() => {
                                  if (routeSortColumn === "p95_ms") {
                                    setRouteSortAsc(!routeSortAsc);
                                  } else {
                                    setRouteSortColumn("p95_ms");
                                    setRouteSortAsc(false);
                                  }
                                }}
                              >
                                p95 Latency
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono">
                            {filteredRoutes.map((route) => (
                              <tr
                                key={route.route}
                                className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                                onClick={() =>
                                  setSelectedRouteFilter(
                                    selectedRouteFilter === route.route ? null : route.route
                                  )
                                }
                              >
                                <td className="p-2.5 text-slate-200 font-sans font-medium">
                                  {route.route}
                                </td>
                                <td className="p-2.5 text-right text-slate-300">{route.count}</td>
                                <td
                                  className={`p-2.5 text-right font-bold ${
                                    route.errors > 0 ? "text-red-400" : "text-slate-500"
                                  }`}
                                >
                                  {route.errors}
                                </td>
                                <td className="p-2.5 text-right text-slate-300">{route.avg_ms} ms</td>
                                <td className="p-2.5 text-right text-slate-300">{route.p95_ms} ms</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic p-6 bg-slate-950/20 rounded border border-slate-800/40 text-center">
                        No endpoints match the filter criteria.
                      </p>
                    )}
                  </div>

                  {/* Cache and Slow Operations Column */}
                  <div className="flex flex-col gap-6">
                    <ThumbnailCacheGauge
                      totalRequests={summary.thumbnails.total_requests}
                      cacheHits={summary.thumbnails.cache_hits}
                      cacheMisses={summary.thumbnails.cache_misses}
                      hitRatioPct={summary.thumbnails.hit_ratio_pct}
                      avgGenerateMs={summary.thumbnails.avg_generate_ms}
                    />

                    <SlowOperationsCategoryChart
                      slowOperations={summary.slow_operations}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="p-12 text-center text-slate-500">Loading system diagnostics summary...</div>
            )}
          </div>
        )}

        {/* Tab 2: Interactive Graphs Deep Dive */}
        {activeTab === "graphs" && (
          <div className="flex flex-col gap-6 max-w-7xl w-full mx-auto">
            {summary ? (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ThroughputErrorChart
                    data={summary.timeseries || []}
                    height={280}
                    title="API Traffic & Error Rates Over Time"
                  />
                  <LatencyTrendChart
                    data={summary.timeseries || []}
                    height={280}
                    title="Latency Percentile Trends (p50, p95, Avg)"
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <EndpointBarChart
                    routes={summary.api.routes}
                    selectedRoute={selectedRouteFilter}
                    onSelectRoute={(route) =>
                      setSelectedRouteFilter(selectedRouteFilter === route ? null : route)
                    }
                    maxRoutes={12}
                  />

                  <div className="flex flex-col gap-6">
                    <ThumbnailCacheGauge
                      totalRequests={summary.thumbnails.total_requests}
                      cacheHits={summary.thumbnails.cache_hits}
                      cacheMisses={summary.thumbnails.cache_misses}
                      hitRatioPct={summary.thumbnails.hit_ratio_pct}
                      avgGenerateMs={summary.thumbnails.avg_generate_ms}
                    />

                    <SlowOperationsCategoryChart
                      slowOperations={summary.slow_operations}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="p-12 text-center text-slate-500">Loading interactive metric graphs...</div>
            )}
          </div>
        )}

        {/* Tab 3: Errors & Traces */}
        {activeTab === "errors" && (
          <div className="flex flex-col gap-4 max-w-7xl w-full mx-auto">
            {/* Filter Bar */}
            <div className="flex items-center justify-between gap-3 p-3 bg-slate-900/90 border border-slate-800 rounded-xl">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  className="w-full bg-slate-950/80 border border-slate-700/80 rounded px-2.5 py-1.5 pl-8 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="Search error messages, types, trace IDs..."
                  value={errorSearchQuery}
                  onChange={(e) => setErrorSearchQuery(e.target.value)}
                />
              </div>

              {selectedTraceId && (
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-blue-900/80 text-blue-200 text-xs font-mono"
                  onClick={() => setSelectedTraceId(null)}
                >
                  <span>Trace: {selectedTraceId}</span>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Error Stream */}
            {filteredErrors.length > 0 ? (
              <div className="flex flex-col gap-3">
                {filteredErrors.map((err) => (
                  <details
                    key={err.id}
                    className="group border border-red-900/60 bg-red-950/20 rounded-lg p-3.5 text-xs flex flex-col gap-2 shadow-sm"
                  >
                    <summary className="cursor-pointer flex items-center justify-between font-medium text-red-200 select-none">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-red-900/80 text-red-100 font-mono text-[10px] uppercase font-bold">
                          {err.source}
                        </span>
                        <span className="font-semibold text-slate-100">{err.error_type}:</span>
                        <span className="truncate max-w-xl text-red-200">{err.message}</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(err.timestamp).toLocaleTimeString()}
                      </span>
                    </summary>

                    <div className="pt-3 flex flex-col gap-2.5 text-slate-300 font-mono text-[11px] border-t border-red-900/40 mt-2">
                      {err.trace_id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">Trace ID: </span>
                          <button
                            type="button"
                            className="text-blue-400 hover:underline hover:text-blue-300"
                            onClick={() => setSelectedTraceId(err.trace_id)}
                            title="Filter by Trace ID"
                          >
                            {err.trace_id}
                          </button>
                        </div>
                      ) : null}

                      {err.context ? (
                        <div>
                          <span className="text-slate-500">Context & Breadcrumbs: </span>
                          <pre className="p-2.5 bg-black/50 rounded mt-1 overflow-x-auto text-slate-300 text-[10.5px] max-h-56">
                            {JSON.stringify(err.context, null, 2)}
                          </pre>
                        </div>
                      ) : null}

                      {err.stack_trace ? (
                        <div>
                          <span className="text-slate-500">Stack Trace: </span>
                          <pre className="p-2.5 bg-black/70 rounded mt-1 overflow-x-auto text-red-300/90 leading-relaxed max-h-60">
                            {err.stack_trace}
                          </pre>
                        </div>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div className="p-16 text-center text-slate-500 flex flex-col items-center gap-3 bg-slate-900/50 border border-slate-800 rounded-xl">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                <span className="text-sm text-slate-300 font-medium">
                  No errors recorded in the system. Everything running smoothly!
                </span>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Slow Operations */}
        {activeTab === "slow" && (
          <div className="flex flex-col gap-4 max-w-7xl w-full mx-auto">
            {summary && summary.slow_operations.length > 0 ? (
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/90 shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-800/80 text-slate-300 font-semibold">
                    <tr>
                      <th className="p-3">Category</th>
                      <th className="p-3">Operation</th>
                      <th className="p-3 text-right">Duration</th>
                      <th className="p-3">Time</th>
                      <th className="p-3">Trace ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {summary.slow_operations.map((op, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="p-3 text-slate-400">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[10px] uppercase font-bold">
                            {op.category}
                          </span>
                        </td>
                        <td className="p-3 text-slate-200 font-medium">{op.operation}</td>
                        <td className="p-3 text-right text-amber-400 font-bold text-sm">
                          {op.duration_ms} ms
                        </td>
                        <td className="p-3 text-slate-400 text-[11px]">
                          {new Date(op.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="p-3 text-blue-400 text-[11px]">
                          {op.trace_id || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-16 text-center text-slate-500 bg-slate-900/50 border border-slate-800 rounded-xl">
                No slow operations (&ge;50ms) detected in this time window.
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Live Logs */}
        {activeTab === "logs" && (
          <div className="flex flex-col gap-3 max-w-7xl w-full mx-auto">
            {/* Log Controls */}
            <div className="flex items-center gap-3 p-3 bg-slate-900/90 border border-slate-800 rounded-xl">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  className="w-full bg-slate-950/80 border border-slate-700/80 rounded px-2.5 py-1.5 pl-8 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="Search logs (JSON, event name, trace ID)..."
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      void fetchData();
                    }
                  }}
                />
              </div>

              <select
                className="bg-slate-950/80 border border-slate-700/80 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                value={logFilterLevel}
                onChange={(e) => setLogFilterLevel(e.target.value)}
              >
                <option value="all">All Levels</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>

              <Button variant="secondary" onClick={() => void fetchData()}>
                Filter
              </Button>
            </div>

            {/* Log Viewer */}
            {logs.length > 0 ? (
              <div className="flex flex-col gap-1 font-mono text-[11px] max-h-[68vh] overflow-y-auto bg-slate-950/90 border border-slate-800 p-3 rounded-xl divide-y divide-slate-800/40 shadow-inner">
                {logs.map((record, index) => {
                  const level = String(record.level || "info").toLowerCase();
                  const badgeColor =
                    level === "error"
                      ? "text-red-400 bg-red-950/80 border-red-800"
                      : level === "warning"
                        ? "text-amber-400 bg-amber-950/80 border-amber-800"
                        : "text-blue-400 bg-blue-950/80 border-blue-800";

                  return (
                    <div key={index} className="py-2 flex flex-col gap-1">
                      <div className="flex items-center gap-2.5">
                        <span className="text-slate-500 text-[10px]">
                          {record.timestamp ? String(record.timestamp).slice(11, 19) : ""}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded border text-[9px] uppercase font-bold ${badgeColor}`}
                        >
                          {level}
                        </span>
                        <span className="text-slate-400 text-[10.5px] truncate max-w-[140px]">
                          {String(record.logger || "")}
                        </span>
                        <span className="text-slate-100 font-semibold">
                          {String(record.event || "")}
                        </span>
                      </div>

                      <div className="text-[10.5px] text-slate-400 pl-4 flex flex-wrap gap-x-4">
                        {Object.entries(record)
                          .filter(
                            ([k]) => !["event", "logger", "level", "timestamp", "exception"].includes(k)
                          )
                          .map(([k, v]) => (
                            <span key={k}>
                              <span className="text-slate-500">{k}=</span>
                              <span className="text-slate-300">{JSON.stringify(v)}</span>
                            </span>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-16 text-center text-slate-500 bg-slate-900/50 border border-slate-800 rounded-xl">
                No logs found matching criteria.
              </div>
            )}
          </div>
        )}

        {/* Tab 6: System & Info */}
        {activeTab === "system" && (
          <div className="flex flex-col gap-6 max-w-7xl w-full mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col gap-3">
                <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  Observability Architecture
                </span>
                <div className="flex flex-col gap-2 text-xs text-slate-300">
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Metrics Engine:</span>
                    <span className="font-mono text-slate-200">SQLite WAL MetricsStore</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Log Storage:</span>
                    <span className="font-mono text-slate-200">Structured JSONL Logger</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Tracing:</span>
                    <span className="font-mono text-slate-200">W3C / Custom Correlation Trace IDs</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Retention:</span>
                    <span className="font-mono text-slate-200">30 Days Auto-Pruning</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col gap-3">
                <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  Client Environment
                </span>
                <div className="flex flex-col gap-2 text-xs text-slate-300">
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Viewport:</span>
                    <span className="font-mono text-slate-200">
                      {typeof window !== "undefined" ? `${window.innerWidth} x ${window.innerHeight}` : "-"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Platform:</span>
                    <span className="font-mono text-slate-200">
                      {typeof navigator !== "undefined" ? navigator.platform : "-"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Local Time:</span>
                    <span className="font-mono text-slate-200">{new Date().toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
