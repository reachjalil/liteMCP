import type { AnalyticsTimeseriesResult, AnalyticsTopResult } from "@litemcp/contracts";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const chartSurface = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 0,
  color: "var(--foreground)",
  fontSize: 10,
};

const chartTick = { fill: "var(--muted)", fontSize: 9 };

const shortTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const compactNumber = (value: number) =>
  new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const mergeOutcomes = (
  calls: AnalyticsTimeseriesResult,
  denials: AnalyticsTimeseriesResult,
  errors: AnalyticsTimeseriesResult
) => {
  const denied = new Map(denials.points.map((point) => [point.ts, point.value ?? 0]));
  const failed = new Map(errors.points.map((point) => [point.ts, point.value ?? 0]));
  return calls.points.map((point) => {
    const attempts = point.value ?? 0;
    const deniedCount = denied.get(point.ts) ?? 0;
    const failedCount = failed.get(point.ts) ?? 0;
    return {
      ts: point.ts,
      completedOrPending: Math.max(0, attempts - deniedCount - failedCount),
      denied: deniedCount,
      failed: failedCount,
    };
  });
};

export function OutcomeTimeseriesChart({
  calls,
  denials,
  errors,
}: {
  calls: AnalyticsTimeseriesResult;
  denials: AnalyticsTimeseriesResult;
  errors: AnalyticsTimeseriesResult;
}) {
  const data = mergeOutcomes(calls, denials, errors);
  return (
    <div
      className="analytics-chart"
      role="img"
      aria-label="Tool attempts over time, split into completed or pending, denied, and failed outcomes."
    >
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="ts"
            tick={chartTick}
            tickFormatter={shortTime}
            minTickGap={48}
            stroke="var(--border-strong)"
          />
          <YAxis
            allowDecimals={false}
            tick={chartTick}
            tickFormatter={compactNumber}
            stroke="var(--border-strong)"
            width={42}
          />
          <Tooltip
            contentStyle={chartSurface}
            labelFormatter={(value) => shortTime(String(value))}
          />
          <Area
            dataKey="completedOrPending"
            name="Completed or pending"
            stackId="outcomes"
            stroke="var(--accent)"
            fill="var(--accent)"
            fillOpacity={0.22}
            isAnimationActive={false}
          />
          <Area
            dataKey="denied"
            name="Denied"
            stackId="outcomes"
            stroke="var(--warning)"
            fill="var(--warning)"
            fillOpacity={0.25}
            isAnimationActive={false}
          />
          <Area
            dataKey="failed"
            name="Failed"
            stackId="outcomes"
            stroke="var(--danger)"
            fill="var(--danger)"
            fillOpacity={0.22}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LatencyTimeseriesChart({
  series,
}: {
  series: AnalyticsTimeseriesResult;
}) {
  const data = series.points.map((point) => ({
    ts: point.ts,
    latency: point.value,
  }));
  return (
    <div
      className="analytics-chart"
      role="img"
      aria-label="Ninety-fifth percentile end-to-end tool latency in milliseconds over time."
    >
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="ts"
            tick={chartTick}
            tickFormatter={shortTime}
            minTickGap={48}
            stroke="var(--border-strong)"
          />
          <YAxis
            domain={[0, "auto"]}
            tick={chartTick}
            tickFormatter={(value) => `${compactNumber(Number(value))} ms`}
            stroke="var(--border-strong)"
            width={58}
          />
          <Tooltip
            contentStyle={chartSurface}
            formatter={(value) => [
              value === null || value === undefined
                ? "No samples"
                : `${Number(value).toFixed(1)} ms`,
              "p95 latency",
            ]}
            labelFormatter={(value) => shortTime(String(value))}
          />
          <Line
            type="monotone"
            dataKey="latency"
            name="p95 latency"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopDimensionChart({
  result,
  unit,
}: {
  result: AnalyticsTopResult;
  unit: string;
}) {
  const data = [...result.rows].reverse();
  const height = Math.max(170, data.length * 31 + 38);
  return (
    <div
      className="analytics-chart analytics-chart--bars"
      role="img"
      aria-label={`Top ${result.dimension} values by ${result.metric}.`}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 6, right: 18, bottom: 6, left: 8 }}
        >
          <CartesianGrid stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            allowDecimals={result.metric === "latency"}
            tick={chartTick}
            tickFormatter={compactNumber}
            stroke="var(--border-strong)"
          />
          <YAxis
            type="category"
            dataKey="key"
            tick={chartTick}
            width={112}
            stroke="var(--border-strong)"
          />
          <Tooltip
            contentStyle={chartSurface}
            formatter={(value) => [
              `${Number(value).toLocaleString()} ${unit}`,
              result.metric,
            ]}
          />
          <Bar
            dataKey="value"
            name={result.metric}
            fill="var(--accent)"
            fillOpacity={0.72}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LiveRateChart({ series }: { series: AnalyticsTimeseriesResult }) {
  const data = series.points.slice(-24).map((point) => ({
    ts: point.ts,
    rate: (point.value ?? 0) / 5,
  }));
  return (
    <div
      className="analytics-chart analytics-chart--sparkline"
      role="img"
      aria-label="Average tool attempts per minute, calculated from five-minute buckets."
    >
      <ResponsiveContainer width="100%" height={124}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <XAxis dataKey="ts" hide />
          <YAxis hide domain={[0, "auto"]} />
          <Tooltip
            contentStyle={chartSurface}
            formatter={(value) => [`${Number(value).toFixed(1)} / min`, "Average"]}
            labelFormatter={(value) => shortTime(String(value))}
          />
          <Area
            type="monotone"
            dataKey="rate"
            name="Average calls per minute"
            stroke="var(--accent)"
            fill="var(--accent)"
            fillOpacity={0.18}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
