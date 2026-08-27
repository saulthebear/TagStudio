import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type TelemetryErrorRecord,
  type TelemetrySummaryResponse
} from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";
import {
  Activity,
  AlertTriangle,
  Clock,
  FileText,
  Layers,
  Maximize2,
  RefreshCw,
  Search
} from "lucide-react";

import { api } from "@/api/client";
import { ModalHeader } from "@/components/ModalHeader";
import { ModalLayerPortal } from "@/components/ModalLayerPortal";
import { useDraggableModalPosition } from "@/hooks/useDraggableModalPosition";

export type DiagnosticsModalProps = {
  open: boolean;
  onClose: () => void;
  onExpandToFullPage?: () => void;
};

type DiagnosticsTab = "overview" | "errors" | "slow" | "logs";

export function DiagnosticsModal({ open, onClose, onExpandToFullPage }: DiagnosticsModalProps) {
  const [activeTab, setActiveTab] = useState<DiagnosticsTab>("overview");
  const [summary, setSummary] = useState<TelemetrySummaryResponse | null>(null);
  const [errors, setErrors] = useState<TelemetryErrorRecord[]>([]);
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [routeSearchQuery, setRouteSearchQuery] = useState<string>("");
  const [logFilterLevel, setLogFilterLevel] = useState<string>("all");
  const [logSearchQuery, setLogSearchQuery] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const draggable = useDraggableModalPosition({
    open,
    margin: 16,
    initialPlacement: "center",
    panelId: "diagnostics-modal",
    savePositionOnClose: false
  });

  const fetchData = useCallback(async () => {
    if (!open) {
      return;
    }
    setLoading(true);
    try {
      if (activeTab === "overview" || activeTab === "slow") {
        const sum = await api.getTelemetrySummary(3600);
        setSummary(sum);
      } else if (activeTab === "errors") {
        const errs = await api.getTelemetryErrors(50);
        setErrors(errs);
      } else if (activeTab === "logs") {
        const logData = await api.getTelemetryLogs({
          limit: 100,
          level: logFilterLevel !== "all" ? logFilterLevel : undefined,
          query: logSearchQuery.trim() || undefined
        });
        setLogs(logData);
      }
    } catch {
      // Ignore network errors when fetching diagnostics
    } finally {
      setLoading(false);
    }
  }, [activeTab, logFilterLevel, logSearchQuery, open]);

  useEffect(() => {
    if (open) {
      void fetchData();
    }
  }, [fetchData, open]);

  useEffect(() => {
    if (!open || !autoRefresh) {
      return;
    }
    const interval = setInterval(() => {
      void fetchData();
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData, open]);

  const filteredRoutes = useMemo(() => {
    if (!summary?.api.routes) {
      return [];
    }
    if (!routeSearchQuery.trim()) {
      return summary.api.routes;
    }
    const q = routeSearchQuery.toLowerCase();
    return summary.api.routes.filter((r) => r.route.toLowerCase().includes(q));
  }, [summary, routeSearchQuery]);

  if (!open) {
    return null;
  }

  return (
    <ModalLayerPortal open={open} dimBackdrop={true} onBackdropClick={onClose}>
      <div
        ref={draggable.panelRef}
        className={`overlay-panel panel diagnostics-panel modal-draggable-panel max-w-4xl w-full max-h-[85vh] flex flex-col min-h-0 overflow-hidden bg-slate-900 border border-slate-700 text-slate-100 shadow-2xl rounded-xl ${
          draggable.isDragging ? "modal-panel-dragging" : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Diagnostics & Observability"
        style={draggable.panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader
          title="Diagnostics & Observability"
          dragHandleProps={draggable.dragHandleProps}
          onClose={onClose}
        />

        {/* Tab Header & Action Bar */}
        <div className="flex items-center justify-between px-6 py-2 border-b border-slate-800 bg-slate-950/40 flex-shrink-0">
          <nav className="flex gap-2">
            <button
              type="button"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === "overview"
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
              onClick={() => setActiveTab("overview")}
            >
              <Activity className="w-3.5 h-3.5" />
              Overview
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === "errors"
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
              onClick={() => setActiveTab("errors")}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Recent Errors
              {summary && summary.errors_total > 0 ? (
                <span className="ml-1 px-1.5 py-0.2 bg-red-500/80 text-white rounded-full text-[10px]">
                  {summary.errors_total}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === "slow"
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
              onClick={() => setActiveTab("slow")}
            >
              <Clock className="w-3.5 h-3.5" />
              Slow Operations
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === "logs"
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
              onClick={() => setActiveTab("logs")}
            >
              <FileText className="w-3.5 h-3.5" />
              Local Logs
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-400 select-none cursor-pointer">
              <input
                type="checkbox"
                className="toggle-base"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>
            <Button
              variant="secondary"
              className="p-1.5 h-7 w-7 flex items-center justify-center"
              onClick={() => void fetchData()}
              disabled={loading}
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            {onExpandToFullPage ? (
              <Button
                variant="secondary"
                className="p-1.5 h-7 w-7 flex items-center justify-center text-slate-300 hover:text-white"
                onClick={onExpandToFullPage}
                title="Expand to Full-Page View"
                aria-label="Expand to Full-Page View"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </Button>
            ) : null}
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto flex-1 min-h-0 flex flex-col gap-6 text-sm">
          {activeTab === "overview" ? (
            <>
              {summary ? (
                <div className="flex flex-col gap-6">
                  {/* Metrics Cards Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-lg flex flex-col gap-1">
                      <span className="text-xs text-slate-400 font-medium">p50 Latency</span>
                      <span className="text-2xl font-bold text-slate-100">
                        {summary.api.latency_ms.p50} <span className="text-xs font-normal text-slate-400">ms</span>
                      </span>
                      <span className="text-[11px] text-slate-400">Avg: {summary.api.latency_ms.avg} ms</span>
                    </div>

                    <div className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-lg flex flex-col gap-1">
                      <span className="text-xs text-slate-400 font-medium">p95 Latency</span>
                      <span className="text-2xl font-bold text-slate-100">
                        {summary.api.latency_ms.p95} <span className="text-xs font-normal text-slate-400">ms</span>
                      </span>
                      <span className="text-[11px] text-slate-400">Max: {summary.api.latency_ms.max} ms</span>
                    </div>

                    <div className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-lg flex flex-col gap-1">
                      <span className="text-xs text-slate-400 font-medium">Thumbnail Cache Hit</span>
                      <span className="text-2xl font-bold text-emerald-400">
                        {summary.thumbnails.hit_ratio_pct}%
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {summary.thumbnails.cache_hits} hits / {summary.thumbnails.total_requests} reqs
                      </span>
                    </div>

                    <div className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-lg flex flex-col gap-1">
                      <span className="text-xs text-slate-400 font-medium">API Requests</span>
                      <span className="text-2xl font-bold text-slate-100">
                        {summary.api.total_requests}
                      </span>
                      <span
                        className={`text-[11px] ${
                          summary.api.error_requests > 0 ? "text-amber-400 font-medium" : "text-slate-400"
                        }`}
                      >
                        {summary.api.error_requests} errors ({summary.api.error_rate_pct}%)
                      </span>
                    </div>
                  </div>

                  {/* Route Latency Table with Search & Scroll Bounding */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Endpoint Performance (Past Hour)
                      </h3>
                      <div className="relative">
                        <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="text"
                          className="bg-slate-950/60 border border-slate-700/80 rounded px-2 py-0.5 pl-6 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-36 sm:w-48"
                          placeholder="Filter routes..."
                          value={routeSearchQuery}
                          onChange={(e) => setRouteSearchQuery(e.target.value)}
                        />
                      </div>
                    </div>

                    {filteredRoutes.length > 0 ? (
                      <div className="border border-slate-800 rounded-lg overflow-x-auto max-w-full bg-slate-950/30 max-h-64 overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="sticky top-0 bg-slate-800/95 text-slate-300 font-semibold backdrop-blur z-10">
                            <tr>
                              <th className="p-2.5">Route</th>
                              <th className="p-2.5 text-right">Requests</th>
                              <th className="p-2.5 text-right">Errors</th>
                              <th className="p-2.5 text-right">Avg Latency</th>
                              <th className="p-2.5 text-right">p95 Latency</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono">
                            {filteredRoutes.map((route) => (
                              <tr key={route.route} className="hover:bg-slate-800/30">
                                <td className="p-2.5 text-slate-200">{route.route}</td>
                                <td className="p-2.5 text-right text-slate-300">{route.count}</td>
                                <td
                                  className={`p-2.5 text-right ${
                                    route.errors > 0 ? "text-red-400 font-bold" : "text-slate-500"
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
                      <p className="text-xs text-slate-500 italic p-4 bg-slate-950/20 rounded border border-slate-800/40">
                        No requests recorded matching filter in current window.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500">Loading summary metrics...</div>
              )}
            </>
          ) : null}

          {activeTab === "errors" ? (
            <div className="flex flex-col gap-3">
              {errors.length > 0 ? (
                errors.map((err) => (
                  <details
                    key={err.id}
                    className="group border border-red-900/60 bg-red-950/20 rounded-lg p-3 text-xs flex flex-col gap-2"
                  >
                    <summary className="cursor-pointer flex items-center justify-between font-medium text-red-200 select-none">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-red-900/80 text-red-100 font-mono text-[10px] uppercase">
                          {err.source}
                        </span>
                        <span className="font-semibold">{err.error_type}:</span>
                        <span className="truncate max-w-md">{err.message}</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(err.timestamp).toLocaleTimeString()}
                      </span>
                    </summary>

                    <div className="pt-2 flex flex-col gap-2 text-slate-300 font-mono text-[11px]">
                      {err.trace_id ? (
                        <div>
                          <span className="text-slate-500">Trace ID: </span>
                          <span className="text-blue-400">{err.trace_id}</span>
                        </div>
                      ) : null}

                      {err.context ? (
                        <div>
                          <span className="text-slate-500">Context: </span>
                          <pre className="p-2 bg-black/40 rounded mt-1 overflow-x-auto text-slate-400">
                            {JSON.stringify(err.context, null, 2)}
                          </pre>
                        </div>
                      ) : null}

                      {err.stack_trace ? (
                        <div>
                          <span className="text-slate-500">Stack Trace: </span>
                          <pre className="p-2 bg-black/60 rounded mt-1 overflow-x-auto text-red-300/90 leading-relaxed max-h-48">
                            {err.stack_trace}
                          </pre>
                        </div>
                      ) : null}
                    </div>
                  </details>
                ))
              ) : (
                <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-2">
                  <Layers className="w-8 h-8 text-slate-600" />
                  <span>No errors recorded in the system. Everything running smoothly!</span>
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "slow" ? (
            <div className="flex flex-col gap-3">
              {summary && summary.slow_operations.length > 0 ? (
                <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/30">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-800/60 text-slate-400 font-semibold">
                      <tr>
                        <th className="p-2.5">Category</th>
                        <th className="p-2.5">Operation</th>
                        <th className="p-2.5 text-right">Duration</th>
                        <th className="p-2.5">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {summary.slow_operations.map((op, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30">
                          <td className="p-2.5 text-slate-400">
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                              {op.category}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-200 font-medium">{op.operation}</td>
                          <td className="p-2.5 text-right text-amber-400 font-bold">
                            {op.duration_ms} ms
                          </td>
                          <td className="p-2.5 text-slate-500 text-[11px]">
                            {new Date(op.timestamp).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-12 text-center text-slate-500">
                  No slow operations (&ge;50ms) detected.
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "logs" ? (
            <div className="flex flex-col gap-3">
              {/* Log Filters Bar */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    className="w-full bg-slate-950/60 border border-slate-700/80 rounded px-2.5 py-1.5 pl-8 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    placeholder="Search logs (JSON, event, trace_id)..."
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
                  className="bg-slate-950/60 border border-slate-700/80 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
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

              {/* Log Stream */}
              {logs.length > 0 ? (
                <div className="flex flex-col gap-1 font-mono text-[11px] max-h-[50vh] overflow-y-auto bg-slate-950/80 border border-slate-800 p-3 rounded-lg divide-y divide-slate-800/40">
                  {logs.map((record, index) => {
                    const level = String(record.level || "info").toLowerCase();
                    const badgeColor =
                      level === "error"
                        ? "text-red-400 bg-red-950/60 border-red-800"
                        : level === "warning"
                          ? "text-amber-400 bg-amber-950/60 border-amber-800"
                          : "text-blue-400 bg-blue-950/60 border-blue-800";

                    return (
                      <div key={index} className="py-1.5 flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 text-[10px]">
                            {record.timestamp ? String(record.timestamp).slice(11, 19) : ""}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded border text-[9px] uppercase font-bold ${badgeColor}`}
                          >
                            {level}
                          </span>
                          <span className="text-slate-400 text-[10px] truncate max-w-[120px]">
                            {String(record.logger || "")}
                          </span>
                          <span className="text-slate-200 font-semibold">
                            {String(record.event || "")}
                          </span>
                        </div>

                        {/* Extra metadata snippet */}
                        <div className="text-[10px] text-slate-400 pl-4">
                          {Object.entries(record)
                            .filter(
                              ([k]) => !["event", "logger", "level", "timestamp", "exception"].includes(k)
                            )
                            .map(([k, v]) => (
                              <span key={k} className="mr-3">
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
                <div className="p-8 text-center text-slate-500">No logs found matching criteria.</div>
              )}
            </div>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/30 flex items-center justify-between flex-shrink-0">
          {onExpandToFullPage ? (
            <Button
              variant="secondary"
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
              onClick={onExpandToFullPage}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Open Full Page</span>
            </Button>
          ) : <div />}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </ModalLayerPortal>
  );
}
