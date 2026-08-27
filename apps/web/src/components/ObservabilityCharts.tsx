import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { type TelemetryRouteStat, type TelemetrySlowOperation, type TelemetryTimeseriesPoint } from "@tagstudio/api-client";

interface ChartDimensions {
  width: number;
  height: number;
}

function useContainerDimensions<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [dimensions, setDimensions] = useState<ChartDimensions>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const updateDimensions = () => {
      const { clientWidth, clientHeight } = element;
      if (clientWidth > 0 && clientHeight > 0) {
        setDimensions({ width: clientWidth, height: clientHeight });
      }
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return { ref, dimensions };
}

// ---------------------------------------------------------------------------
// 1. Throughput & Error Rate Timeline Chart
// ---------------------------------------------------------------------------
export type ThroughputErrorChartProps = {
  data: TelemetryTimeseriesPoint[];
  height?: number;
  title?: string;
};

export function ThroughputErrorChart({
  data,
  height = 200,
  title = "API Request Throughput & Error Rate"
}: ThroughputErrorChartProps) {
  const { ref, dimensions } = useContainerDimensions<HTMLDivElement>();
  const [hoveredPoint, setHoveredPoint] = useState<TelemetryTimeseriesPoint | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const gradientId = useId();

  const margin = { top: 20, right: 24, bottom: 28, left: 36 };
  const innerWidth = Math.max(0, dimensions.width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  const parsedData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      date: new Date(d.timestamp)
    }));
  }, [data]);

  const { xScale, yScale, areaPath, linePath, errorBarData } = useMemo(() => {
    if (parsedData.length === 0 || innerWidth === 0 || innerHeight === 0) {
      return {
        xScale: null,
        yScale: null,
        areaPath: "",
        linePath: "",
        errorBarData: []
      };
    }

    const xExtent = d3.extent(parsedData, (d) => d.date) as [Date, Date];
    const maxReqs = Math.max(1, d3.max(parsedData, (d) => d.requests) ?? 1);

    const x = d3.scaleTime().domain(xExtent).range([0, innerWidth]);
    const y = d3.scaleLinear().domain([0, maxReqs * 1.15]).range([innerHeight, 0]).nice();

    const areaGenerator = d3
      .area<(typeof parsedData)[0]>()
      .x((d) => x(d.date))
      .y0(innerHeight)
      .y1((d) => y(d.requests))
      .curve(d3.curveMonotoneX);

    const lineGenerator = d3
      .line<(typeof parsedData)[0]>()
      .x((d) => x(d.date))
      .y((d) => y(d.requests))
      .curve(d3.curveMonotoneX);

    const errors = parsedData.filter((d) => d.errors > 0);

    return {
      xScale: x,
      yScale: y,
      areaPath: areaGenerator(parsedData) ?? "",
      linePath: lineGenerator(parsedData) ?? "",
      errorBarData: errors
    };
  }, [parsedData, innerWidth, innerHeight]);

  const xTicks = useMemo(() => {
    if (!xScale) {
      return [];
    }
    return xScale.ticks(Math.max(3, Math.floor(innerWidth / 90)));
  }, [xScale, innerWidth]);

  const yTicks = useMemo(() => {
    if (!yScale) {
      return [];
    }
    return yScale.ticks(4);
  }, [yScale]);

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!xScale || parsedData.length === 0) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const xPos = e.clientX - rect.left - margin.left;
    if (xPos < 0 || xPos > innerWidth) {
      setHoveredPoint(null);
      setHoverPosition(null);
      return;
    }

    const targetDate = xScale.invert(xPos);
    const bisect = d3.bisector<(typeof parsedData)[0], Date>((d) => d.date).left;
    const index = bisect(parsedData, targetDate);
    const clampedIndex = Math.max(0, Math.min(parsedData.length - 1, index));
    const point = parsedData[clampedIndex];

    setHoveredPoint(point);
    setHoverPosition({
      x: xScale(point.date) + margin.left,
      y: (yScale ? yScale(point.requests) : 0) + margin.top
    });
  };

  const handlePointerLeave = () => {
    setHoveredPoint(null);
    setHoverPosition(null);
  };

  const totalRequests = useMemo(() => data.reduce((sum, d) => sum + d.requests, 0), [data]);
  const totalErrors = useMemo(() => data.reduce((sum, d) => sum + d.errors, 0), [data]);

  return (
    <div className="flex flex-col gap-2 p-4 bg-slate-900/90 border border-slate-800/80 rounded-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-200">{title}</span>
          <span className="text-[11px] text-slate-400 font-mono">
            ({totalRequests} requests, {totalErrors} errors)
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
            <span className="text-slate-300">Requests</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />
            <span className="text-slate-300">Errors</span>
          </div>
        </div>
      </div>

      <div ref={ref} className="relative w-full" style={{ height }}>
        {dimensions.width > 0 && parsedData.length > 0 && xScale && yScale ? (
          <svg
            width={dimensions.width}
            height={height}
            className="overflow-visible select-none"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
          >
            <defs>
              <linearGradient id={`${gradientId}-reqs`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            <g transform={`translate(${margin.left}, ${margin.top})`}>
              {/* Grid Lines */}
              {yTicks.map((tick) => (
                <g key={tick} transform={`translate(0, ${yScale(tick)})`}>
                  <line x1={0} x2={innerWidth} stroke="#334155" strokeDasharray="3 3" strokeOpacity={0.4} />
                  <text
                    x={-8}
                    y={3}
                    textAnchor="end"
                    className="text-[10px] fill-slate-500 font-mono select-none"
                  >
                    {tick}
                  </text>
                </g>
              ))}

              {/* Area & Line */}
              <path d={areaPath} fill={`url(#${gradientId}-reqs)`} />
              <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth={2} />

              {/* Error Bars */}
              {errorBarData.map((d, i) => {
                const cx = xScale(d.date);
                const cy = yScale(d.requests);
                return (
                  <g key={i}>
                    <circle cx={cx} cy={cy} r={4} fill="#ef4444" stroke="#7f1d1d" strokeWidth={1.5} />
                  </g>
                );
              })}

              {/* X Axis Ticks */}
              {xTicks.map((tick, i) => (
                <g key={i} transform={`translate(${xScale(tick)}, ${innerHeight})`}>
                  <line y1={0} y2={4} stroke="#475569" />
                  <text
                    y={14}
                    textAnchor="middle"
                    className="text-[10px] fill-slate-400 font-mono select-none"
                  >
                    {d3.timeFormat("%H:%M")(tick)}
                  </text>
                </g>
              ))}

              {/* Hover Crosshair */}
              {hoveredPoint && (
                <g transform={`translate(${xScale(new Date(hoveredPoint.timestamp))}, 0)`}>
                  <line
                    y1={0}
                    y2={innerHeight}
                    stroke="#94a3b8"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                  />
                  <circle
                    cy={yScale(hoveredPoint.requests)}
                    r={5}
                    fill="#3b82f6"
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                </g>
              )}
            </g>
          </svg>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-slate-500 italic">
            No activity data recorded in the current window.
          </div>
        )}

        {/* Hover Tooltip */}
        {hoveredPoint && hoverPosition && (
          <div
            className="absolute pointer-events-none z-20 bg-slate-950/95 border border-slate-700 shadow-xl rounded-lg px-2.5 py-1.5 text-xs text-slate-100 flex flex-col gap-0.5 transform -translate-x-1/2 -translate-y-full mb-2"
            style={{ left: hoverPosition.x, top: hoverPosition.y }}
          >
            <span className="text-[10px] text-slate-400 font-mono">
              {new Date(hoveredPoint.timestamp).toLocaleTimeString()}
            </span>
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="text-blue-400 font-medium">Requests:</span>
              <span className="font-bold">{hoveredPoint.requests}</span>
            </div>
            {hoveredPoint.errors > 0 ? (
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span className="text-red-400 font-medium">Errors:</span>
                <span className="font-bold text-red-400">{hoveredPoint.errors}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3 text-[10px] text-slate-400">
              <span>Avg Latency:</span>
              <span>{hoveredPoint.avg_latency_ms} ms</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Latency Trends Timeline (p50, p95, Avg)
// ---------------------------------------------------------------------------
export type LatencyTrendChartProps = {
  data: TelemetryTimeseriesPoint[];
  height?: number;
  title?: string;
};

export function LatencyTrendChart({
  data,
  height = 200,
  title = "API Latency Percentiles (p50, p95, Avg)"
}: LatencyTrendChartProps) {
  const { ref, dimensions } = useContainerDimensions<HTMLDivElement>();
  const [hoveredPoint, setHoveredPoint] = useState<TelemetryTimeseriesPoint | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);

  const margin = { top: 20, right: 24, bottom: 28, left: 36 };
  const innerWidth = Math.max(0, dimensions.width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  const parsedData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      date: new Date(d.timestamp)
    }));
  }, [data]);

  const { xScale, yScale, p50Path, p95Path, avgPath } = useMemo(() => {
    if (parsedData.length === 0 || innerWidth === 0 || innerHeight === 0) {
      return {
        xScale: null,
        yScale: null,
        p50Path: "",
        p95Path: "",
        avgPath: ""
      };
    }

    const xExtent = d3.extent(parsedData, (d) => d.date) as [Date, Date];
    const maxLatency = Math.max(
      10,
      d3.max(parsedData, (d) => Math.max(d.p95_ms, d.avg_latency_ms)) ?? 10
    );

    const x = d3.scaleTime().domain(xExtent).range([0, innerWidth]);
    const y = d3.scaleLinear().domain([0, maxLatency * 1.2]).range([innerHeight, 0]).nice();

    const makeLine = (accessor: (d: (typeof parsedData)[0]) => number) =>
      d3
        .line<(typeof parsedData)[0]>()
        .x((d) => x(d.date))
        .y((d) => y(accessor(d)))
        .curve(d3.curveMonotoneX)(parsedData) ?? "";

    return {
      xScale: x,
      yScale: y,
      p50Path: makeLine((d) => d.p50_ms),
      p95Path: makeLine((d) => d.p95_ms),
      avgPath: makeLine((d) => d.avg_latency_ms)
    };
  }, [parsedData, innerWidth, innerHeight]);

  const xTicks = useMemo(() => {
    if (!xScale) {
      return [];
    }
    return xScale.ticks(Math.max(3, Math.floor(innerWidth / 90)));
  }, [xScale, innerWidth]);

  const yTicks = useMemo(() => {
    if (!yScale) {
      return [];
    }
    return yScale.ticks(4);
  }, [yScale]);

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!xScale || parsedData.length === 0) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const xPos = e.clientX - rect.left - margin.left;
    if (xPos < 0 || xPos > innerWidth) {
      setHoveredPoint(null);
      setHoveredPoint(null);
      setHoverPosition(null);
      return;
    }

    const targetDate = xScale.invert(xPos);
    const bisect = d3.bisector<(typeof parsedData)[0], Date>((d) => d.date).left;
    const index = bisect(parsedData, targetDate);
    const clampedIndex = Math.max(0, Math.min(parsedData.length - 1, index));
    const point = parsedData[clampedIndex];

    setHoveredPoint(point);
    setHoverPosition({
      x: xScale(point.date) + margin.left,
      y: (yScale ? yScale(point.p95_ms) : 0) + margin.top
    });
  };

  const handlePointerLeave = () => {
    setHoveredPoint(null);
    setHoverPosition(null);
  };

  return (
    <div className="flex flex-col gap-2 p-4 bg-slate-900/90 border border-slate-800/80 rounded-xl">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-200">{title}</span>
        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 rounded-sm bg-amber-400 inline-block" />
            <span className="text-slate-300">p95</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 rounded-sm bg-cyan-400 inline-block" />
            <span className="text-slate-300">p50</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 rounded-sm bg-emerald-400 inline-block" />
            <span className="text-slate-300">Avg</span>
          </div>
        </div>
      </div>

      <div ref={ref} className="relative w-full" style={{ height }}>
        {dimensions.width > 0 && parsedData.length > 0 && xScale && yScale ? (
          <svg
            width={dimensions.width}
            height={height}
            className="overflow-visible select-none"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
          >
            <g transform={`translate(${margin.left}, ${margin.top})`}>
              {/* Grid Lines */}
              {yTicks.map((tick) => (
                <g key={tick} transform={`translate(0, ${yScale(tick)})`}>
                  <line x1={0} x2={innerWidth} stroke="#334155" strokeDasharray="3 3" strokeOpacity={0.4} />
                  <text
                    x={-8}
                    y={3}
                    textAnchor="end"
                    className="text-[10px] fill-slate-500 font-mono select-none"
                  >
                    {tick} ms
                  </text>
                </g>
              ))}

              {/* Latency Curves */}
              <path d={p95Path} fill="none" stroke="#fbbf24" strokeWidth={2} />
              <path d={p50Path} fill="none" stroke="#22d3ee" strokeWidth={1.75} strokeDasharray="4 2" />
              <path d={avgPath} fill="none" stroke="#34d399" strokeWidth={1.5} />

              {/* X Axis Ticks */}
              {xTicks.map((tick, i) => (
                <g key={i} transform={`translate(${xScale(tick)}, ${innerHeight})`}>
                  <line y1={0} y2={4} stroke="#475569" />
                  <text
                    y={14}
                    textAnchor="middle"
                    className="text-[10px] fill-slate-400 font-mono select-none"
                  >
                    {d3.timeFormat("%H:%M")(tick)}
                  </text>
                </g>
              ))}

              {/* Hover Crosshair */}
              {hoveredPoint && (
                <g transform={`translate(${xScale(new Date(hoveredPoint.timestamp))}, 0)`}>
                  <line
                    y1={0}
                    y2={innerHeight}
                    stroke="#94a3b8"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                  />
                  <circle
                    cy={yScale(hoveredPoint.p95_ms)}
                    r={4}
                    fill="#fbbf24"
                    stroke="#ffffff"
                    strokeWidth={1.5}
                  />
                </g>
              )}
            </g>
          </svg>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-slate-500 italic">
            No latency points recorded in the current window.
          </div>
        )}

        {/* Hover Tooltip */}
        {hoveredPoint && hoverPosition && (
          <div
            className="absolute pointer-events-none z-20 bg-slate-950/95 border border-slate-700 shadow-xl rounded-lg px-2.5 py-1.5 text-xs text-slate-100 flex flex-col gap-0.5 transform -translate-x-1/2 -translate-y-full mb-2"
            style={{ left: hoverPosition.x, top: hoverPosition.y }}
          >
            <span className="text-[10px] text-slate-400 font-mono">
              {new Date(hoveredPoint.timestamp).toLocaleTimeString()}
            </span>
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="text-amber-400 font-medium">p95:</span>
              <span className="font-bold">{hoveredPoint.p95_ms} ms</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="text-cyan-400 font-medium">p50:</span>
              <span className="font-bold">{hoveredPoint.p50_ms} ms</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="text-emerald-400 font-medium">Avg:</span>
              <span className="font-bold">{hoveredPoint.avg_latency_ms} ms</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Endpoint Latency & Request Comparison (Horizontal Bar Chart)
// ---------------------------------------------------------------------------
export type EndpointBarChartProps = {
  routes: TelemetryRouteStat[];
  selectedRoute?: string | null;
  onSelectRoute?: (route: string) => void;
  maxRoutes?: number;
};

export function EndpointBarChart({
  routes,
  selectedRoute,
  onSelectRoute,
  maxRoutes = 8
}: EndpointBarChartProps) {
  const topRoutes = useMemo(() => routes.slice(0, maxRoutes), [routes, maxRoutes]);
  const maxAvgLatency = useMemo(
    () => Math.max(10, d3.max(topRoutes, (r) => Math.max(r.avg_ms, r.p95_ms)) ?? 10),
    [topRoutes]
  );

  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-900/90 border border-slate-800/80 rounded-xl">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-200">Endpoint Latency Comparison</span>
        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
            <span className="text-slate-300">Avg Latency</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />
            <span className="text-slate-300">p95 Latency</span>
          </div>
        </div>
      </div>

      {topRoutes.length > 0 ? (
        <div className="flex flex-col gap-2.5 font-mono text-xs">
          {topRoutes.map((r) => {
            const avgWidthPct = Math.min(100, (r.avg_ms / maxAvgLatency) * 100);
            const p95WidthPct = Math.min(100, (r.p95_ms / maxAvgLatency) * 100);
            const isSelected = selectedRoute === r.route;

            return (
              <button
                type="button"
                key={r.route}
                className={`flex flex-col gap-1 p-2 rounded-lg text-left transition-colors ${
                  isSelected
                    ? "bg-blue-950/60 border border-blue-600"
                    : "hover:bg-slate-800/50 border border-transparent"
                }`}
                onClick={() => onSelectRoute?.(r.route)}
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-200 truncate max-w-[220px] font-semibold">
                    {r.route}
                  </span>
                  <div className="flex items-center gap-2 text-slate-400">
                    <span>{r.count} reqs</span>
                    {r.errors > 0 ? <span className="text-red-400">({r.errors} err)</span> : null}
                    <span className="text-blue-400">{r.avg_ms} ms</span>
                  </div>
                </div>

                <div className="relative w-full h-3 bg-slate-950 rounded overflow-hidden">
                  <div
                    className="absolute top-0 left-0 h-full bg-blue-500/80 rounded"
                    style={{ width: `${avgWidthPct}%` }}
                  />
                  <div
                    className="absolute top-0 h-full w-1 bg-amber-400 z-10"
                    style={{ left: `${p95WidthPct}%` }}
                    title={`p95: ${r.p95_ms}ms`}
                  />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="p-6 text-center text-xs text-slate-500 italic">
          No endpoints recorded in the current window.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Thumbnail Cache Performance Gauge & Stats
// ---------------------------------------------------------------------------
export type ThumbnailCacheGaugeProps = {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRatioPct: number;
  avgGenerateMs: number;
};

export function ThumbnailCacheGauge({
  totalRequests,
  cacheHits,
  cacheMisses,
  hitRatioPct,
  avgGenerateMs
}: ThumbnailCacheGaugeProps) {
  const radius = 38;
  const strokeWidth = 8;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (hitRatioPct / 100) * circumference;

  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-900/90 border border-slate-800/80 rounded-xl">
      <span className="text-xs font-semibold text-slate-200">Thumbnail Cache Efficiency</span>
      <div className="flex items-center gap-6">
        {/* SVG Circular Progress Meter */}
        <div className="relative w-24 h-24 flex items-center justify-center flex-shrink-0">
          <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
            <circle
              stroke="#1e293b"
              fill="transparent"
              strokeWidth={strokeWidth}
              r={normalizedRadius}
              cx={radius}
              cy={radius}
            />
            <circle
              stroke="#10b981"
              fill="transparent"
              strokeWidth={strokeWidth}
              strokeDasharray={`${circumference} ${circumference}`}
              style={{ strokeDashoffset }}
              strokeLinecap="round"
              r={normalizedRadius}
              cx={radius}
              cy={radius}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-lg font-bold text-emerald-400">{hitRatioPct}%</span>
            <span className="text-[9px] text-slate-400 uppercase">Hit Ratio</span>
          </div>
        </div>

        {/* Stats breakdown */}
        <div className="flex flex-col gap-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-slate-400">Cache Hits:</span>
            <span className="font-bold text-slate-100">{cacheHits}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-slate-400">Generations (Misses):</span>
            <span className="font-bold text-slate-100">{cacheMisses}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-slate-400">Total Requests:</span>
            <span className="font-bold text-slate-100">{totalRequests}</span>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-slate-800 text-[11px] text-slate-400">
            <span>Avg Generate Latency:</span>
            <span className="font-semibold text-slate-200">{avgGenerateMs} ms</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Category Breakdown of Slow Operations
// ---------------------------------------------------------------------------
export type SlowOperationsCategoryChartProps = {
  slowOperations: TelemetrySlowOperation[];
};

export function SlowOperationsCategoryChart({
  slowOperations
}: SlowOperationsCategoryChartProps) {
  const categoryCounts = useMemo(() => {
    const counts: Record<string, { count: number; totalMs: number }> = {};
    for (const op of slowOperations) {
      if (!counts[op.category]) {
        counts[op.category] = { count: 0, totalMs: 0 };
      }
      counts[op.category].count += 1;
      counts[op.category].totalMs += op.duration_ms;
    }
    return Object.entries(counts).map(([category, data]) => ({
      category,
      count: data.count,
      avgMs: Math.round(data.totalMs / data.count)
    }));
  }, [slowOperations]);

  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-900/90 border border-slate-800/80 rounded-xl">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-200">Slow Operations by Category (&ge;50ms)</span>
        <span className="text-[11px] text-slate-400 font-mono">{slowOperations.length} total</span>
      </div>

      {categoryCounts.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
          {categoryCounts.map((cat) => (
            <div
              key={cat.category}
              className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 flex flex-col gap-1"
            >
              <span className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                {cat.category}
              </span>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-amber-400">{cat.count}</span>
                <span className="text-[11px] text-slate-400">~{cat.avgMs} ms</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-6 text-center text-xs text-slate-500 italic">
          No slow operations recorded in the current window.
        </div>
      )}
    </div>
  );
}
