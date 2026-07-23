import type {
  AnalyticsFlowsResult,
  AnalyticsPolicyInsightsResult,
  AnalyticsRecentResult,
  AnalyticsSessionTimelineResult,
  AnalyticsSummaryResult,
  AnalyticsTimeseriesResult,
  AnalyticsTopResult,
  AuditEvent,
  UsageEvent,
  UsageStanding,
} from "@litemcp/contracts";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  type AnalyticsRange,
  ApiClientError,
  type LiteMcpApiClient,
} from "../../../lib/api";
import {
  LatencyTimeseriesChart,
  LiveRateChart,
  OutcomeTimeseriesChart,
  TopDimensionChart,
} from "./AnalyticsCharts";

type AnalyticsView =
  | "dashboard"
  | "live"
  | "tools"
  | "identities"
  | "sessions"
  | "policy";

type RangePreset = "24h" | "7d" | "30d";

type ObservabilityAreaProps = {
  client: LiteMcpApiClient;
  gatewayStatus: string;
  auditEvents: AuditEvent[];
};

const views: Array<{ id: AnalyticsView; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "live", label: "Live" },
  { id: "tools", label: "Tools" },
  { id: "identities", label: "Identities" },
  { id: "sessions", label: "Sessions" },
  { id: "policy", label: "Policy insights" },
];

const presetMilliseconds: Record<RangePreset, number> = {
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "30d": 30 * 24 * 60 * 60 * 1_000,
};

const makeRange = (preset: RangePreset, end = new Date()): AnalyticsRange => ({
  from: new Date(end.getTime() - presetMilliseconds[preset]).toISOString(),
  to: end.toISOString(),
});

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(date);
};

const formatDuration = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "—";
  if (value < 1_000) return `${value.toFixed(value < 10 ? 1 : 0)} ms`;
  if (value < 60_000) return `${(value / 1_000).toFixed(2)} s`;
  return `${(value / 60_000).toFixed(1)} min`;
};

const formatPercent = (value: number) =>
  new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);

const reportedClient = (event: UsageEvent) =>
  event.clientName === "unknown" && event.clientVersion === "unknown"
    ? null
    : `${event.clientName}@${event.clientVersion}`;

const analyticsError = (cause: unknown) => {
  if (cause instanceof ApiClientError) {
    if (cause.status === 403) {
      return "Analytics requires an owner or administrator management role.";
    }
    return cause.message;
  }
  return cause instanceof Error ? cause.message : "Analytics could not be loaded.";
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

function ViewState({
  loading,
  error,
  empty,
  onRetry,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div className="analytics-view-state" role="status">
        <span className="analytics-loader" aria-hidden="true" />
        Loading usage analytics…
      </div>
    );
  }
  if (error) {
    return (
      <div className="analytics-view-state analytics-view-state--error" role="alert">
        <strong>Analytics unavailable</strong>
        <span>{error}</span>
        <button type="button" className="console-button" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="analytics-view-state">
        <strong>No usage events in this range</strong>
        <span>
          Connect an MCP client and run discovery or a tool call, then refresh this
          view.
        </span>
      </div>
    );
  }
  return <>{children}</>;
}

function Metric({
  label,
  value,
  context,
}: {
  label: string;
  value: string | number;
  context: string;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{context}</small>
    </div>
  );
}

type DashboardData = {
  summary: AnalyticsSummaryResult;
  calls: AnalyticsTimeseriesResult;
  denials: AnalyticsTimeseriesResult;
  errors: AnalyticsTimeseriesResult;
  latency: AnalyticsTimeseriesResult;
  tools: AnalyticsTopResult;
  clients: AnalyticsTopResult;
  identities: AnalyticsTopResult;
  usage: UsageStanding;
};

function DashboardView({
  client,
  range,
  preset,
  refreshKey,
}: {
  client: LiteMcpApiClient;
  range: AnalyticsRange;
  preset: RangePreset;
  refreshKey: number;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const interval = preset === "30d" ? "1d" : "1h";
    void Promise.all([
      client.getAnalyticsSummary(range),
      client.getAnalyticsTimeseries({ ...range, metric: "calls", interval }),
      client.getAnalyticsTimeseries({ ...range, metric: "denials", interval }),
      client.getAnalyticsTimeseries({ ...range, metric: "errors", interval }),
      client.getAnalyticsTimeseries({
        ...range,
        metric: "latency_p95",
        interval,
      }),
      client.getAnalyticsTop({
        ...range,
        dimension: "tool",
        metric: "calls",
        limit: 8,
      }),
      client.getAnalyticsTop({
        ...range,
        dimension: "client",
        metric: "calls",
        limit: 8,
      }),
      client.getAnalyticsTop({
        ...range,
        dimension: "subject",
        metric: "calls",
        limit: 8,
      }),
      client.getUsageStanding(),
    ])
      .then(
        ([
          summary,
          calls,
          denials,
          errors,
          latency,
          tools,
          clients,
          identities,
          usage,
        ]) => {
          if (!active) return;
          setData({
            summary: summary.data,
            calls: calls.data,
            denials: denials.data,
            errors: errors.data,
            latency: latency.data,
            tools: tools.data,
            clients: clients.data,
            identities: identities.data,
            usage: usage.data,
          });
        }
      )
      .catch((cause) => {
        if (active) setError(analyticsError(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, preset, range.from, range.to, refreshKey, retry]);

  return (
    <ViewState
      loading={loading}
      error={error}
      empty={false}
      onRetry={() => setRetry((value) => value + 1)}
    >
      {data ? (
        <div className="analytics-view-stack">
          {data.summary.calls === 0 ? (
            <div className="analytics-view-state">
              <strong>No usage events in this range</strong>
              <span>
                Exact quota standing remains available below. Connect an MCP client and
                run discovery or a tool call to populate the charts.
              </span>
            </div>
          ) : null}
          <div className="analytics-metrics">
            <Metric label="Tool attempts" value={data.summary.calls} context={preset} />
            <Metric
              label="Active identities"
              value={data.summary.activeIdentities}
              context="subject IDs"
            />
            <Metric
              label="Active sessions"
              value={data.summary.activeSessions}
              context="in range"
            />
            <Metric
              label="Deny rate"
              value={formatPercent(data.summary.denyRate)}
              context={`${data.summary.denials} denied`}
            />
            <Metric
              label="p95 latency"
              value={formatDuration(data.summary.latencyP95Ms)}
              context={`p50 ${formatDuration(data.summary.latencyP50Ms)}`}
            />
            <Metric
              label="Error rate"
              value={formatPercent(data.summary.errorRate)}
              context={`${data.summary.errors} failed`}
            />
          </div>

          <section className="analytics-quota-strip" aria-label="Exact quota standing">
            <div>
              <span>Exact usage standing</span>
              <strong>
                {data.usage.analyticsEnabled
                  ? "analytics enabled"
                  : "analytics disabled"}
              </strong>
            </div>
            {(
              [
                ["Servers", data.usage.servers],
                ["Compositions", data.usage.compositions],
                ["Active sessions", data.usage.activeSessions],
                ["Calls today", data.usage.toolCallsToday],
              ] as const
            ).map(([label, standing]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>
                  {standing.used.toLocaleString()} / {standing.limit.toLocaleString()}
                </strong>
                <small>{standing.remaining.toLocaleString()} remaining</small>
              </div>
            ))}
          </section>

          <div className="analytics-chart-grid">
            <section className="console-panel analytics-panel--wide">
              <header className="console-panel__header">
                <div>
                  <span>Volume</span>
                  <h2>Attempts by outcome</h2>
                </div>
                <small>interval {data.calls.interval}</small>
              </header>
              <OutcomeTimeseriesChart
                calls={data.calls}
                denials={data.denials}
                errors={data.errors}
              />
            </section>
            <section className="console-panel">
              <header className="console-panel__header">
                <div>
                  <span>Latency</span>
                  <h2>End-to-end p95</h2>
                </div>
                <small>milliseconds</small>
              </header>
              <LatencyTimeseriesChart series={data.latency} />
            </section>
          </div>

          <div className="analytics-three-column">
            {[
              ["Top tools", data.tools, "attempts"],
              ["Reported clients", data.clients, "attempts"],
              ["Top subject IDs", data.identities, "attempts"],
            ].map(([title, result, unit]) => (
              <section className="console-panel" key={String(title)}>
                <header className="console-panel__header">
                  <div>
                    <span>Usage</span>
                    <h2>{String(title)}</h2>
                  </div>
                </header>
                <TopDimensionChart
                  result={result as AnalyticsTopResult}
                  unit={String(unit)}
                />
              </section>
            ))}
          </div>
          <p className="analytics-privacy-note">
            Client names and versions are self-reported by the connecting MCP client.
            Analytics contains dimensions and measures only—never tool arguments or
            results. Charts reflect retained, fail-open analytics and can be incomplete;
            quotas above come from exact counters, not chart data.
          </p>
        </div>
      ) : null}
    </ViewState>
  );
}

type LiveData = {
  recent: AnalyticsRecentResult;
  summary: AnalyticsSummaryResult;
  rate: AnalyticsTimeseriesResult;
};

function LiveView({
  client,
  preset,
}: {
  client: LiteMcpApiClient;
  preset: RangePreset;
}) {
  const [data, setData] = useState<LiveData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const load = async (initial: boolean) => {
      if (document.visibilityState === "hidden") return;
      if (initial) setLoading(true);
      const range = makeRange(preset, new Date(Date.now() + 1_000));
      try {
        const [recent, summary, rate] = await Promise.all([
          client.getAnalyticsRecent({ ...range, limit: 100 }),
          client.getAnalyticsSummary(range),
          client.getAnalyticsTimeseries({
            ...range,
            metric: "calls",
            interval: "5m",
          }),
        ]);
        if (!active) return;
        setData({ recent: recent.data, summary: summary.data, rate: rate.data });
        setError(null);
        setLastUpdated(new Date().toISOString());
      } catch (cause) {
        if (active) setError(analyticsError(cause));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load(true);
    timer = window.setInterval(() => void load(false), 5_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      if (timer !== undefined) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [client, preset, retry]);

  const currentRate = data?.rate.points.at(-1)?.value ?? 0;
  return (
    <ViewState
      loading={loading}
      error={error}
      empty={Boolean(data && data.recent.events.length === 0)}
      onRetry={() => setRetry((value) => value + 1)}
    >
      {data ? (
        <div className="analytics-view-stack">
          <div className="analytics-live-heading" role="status">
            <span className="analytics-live-dot" aria-hidden="true" />
            Polling every 5 seconds while this view is open
            <small>
              {lastUpdated ? `updated ${formatDate(lastUpdated)}` : "waiting"}
            </small>
          </div>
          <div className="analytics-live-grid">
            <div className="analytics-metrics analytics-metrics--vertical">
              <Metric
                label="Active sessions"
                value={data.summary.activeSessions}
                context={`within ${preset}`}
              />
              <Metric
                label="Average calls/min"
                value={(currentRate / 5).toFixed(1)}
                context="latest 5-minute bucket"
              />
              <Metric
                label="Pending approvals"
                value={data.summary.pendingApprovals}
                context="in selected window"
              />
            </div>
            <section className="console-panel">
              <header className="console-panel__header">
                <div>
                  <span>Rate</span>
                  <h2>Recent call activity</h2>
                </div>
              </header>
              <LiveRateChart series={data.rate} />
            </section>
          </div>
          <EventTable events={data.recent.events} caption="Live usage event tail" />
        </div>
      ) : null}
    </ViewState>
  );
}

function EventTable({ events, caption }: { events: UsageEvent[]; caption: string }) {
  return (
    <section className="console-panel">
      <header className="console-panel__header">
        <div>
          <span>Payload-free events</span>
          <h2>{caption}</h2>
        </div>
        <span className="console-count">{events.length} events</span>
      </header>
      <div className="console-table-wrap">
        <table className="console-table analytics-event-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th>Time</th>
              <th>Outcome</th>
              <th>Event</th>
              <th>Reported client</th>
              <th>Subject ID</th>
              <th>Tool</th>
              <th>Latency</th>
              <th>Request</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td className="analytics-nowrap">{formatDate(event.ts)}</td>
                <td>
                  <span
                    className={`analytics-outcome analytics-outcome--${event.status}`}
                  >
                    {event.status}
                  </span>
                </td>
                <td>{event.eventType}</td>
                <td>
                  <code>{reportedClient(event) ?? "Not initialized"}</code>
                </td>
                <td>
                  <code>{event.subjectId}</code>
                </td>
                <td>
                  <code>{event.tool ?? "—"}</code>
                </td>
                <td>{formatDuration(event.latencyTotalMs)}</td>
                <td>
                  <code>{event.requestId}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type ExplorerData = {
  calls: AnalyticsTopResult;
  denials: AnalyticsTopResult;
  latency: AnalyticsTopResult;
  recent: AnalyticsRecentResult;
};

function ToolsView({
  client,
  range,
  refreshKey,
}: {
  client: LiteMcpApiClient;
  range: AnalyticsRange;
  refreshKey: number;
}) {
  const [data, setData] = useState<ExplorerData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([
      client.getAnalyticsTop({
        ...range,
        dimension: "tool",
        metric: "calls",
        limit: 100,
      }),
      client.getAnalyticsTop({
        ...range,
        dimension: "tool",
        metric: "denials",
        limit: 100,
      }),
      client.getAnalyticsTop({
        ...range,
        dimension: "tool",
        metric: "latency",
        limit: 100,
      }),
      client.getAnalyticsRecent({ ...range, limit: 500 }),
    ])
      .then(([calls, denials, latency, recent]) => {
        if (!active) return;
        const next = {
          calls: calls.data,
          denials: denials.data,
          latency: latency.data,
          recent: recent.data,
        };
        setData(next);
        setSelected((current) =>
          current && next.calls.rows.some((row) => row.key === current)
            ? current
            : (next.calls.rows[0]?.key ?? null)
        );
      })
      .catch((cause) => {
        if (active) setError(analyticsError(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, range.from, range.to, refreshKey, retry]);

  const rows = useMemo(() => {
    if (!data) return [];
    const denials = new Map(data.denials.rows.map((row) => [row.key, row.value]));
    const latency = new Map(data.latency.rows.map((row) => [row.key, row.value]));
    return data.calls.rows.map((row) => ({
      tool: row.key,
      calls: row.value,
      denials: denials.get(row.key) ?? 0,
      latency: latency.get(row.key) ?? null,
    }));
  }, [data]);
  const selectedEvents =
    data?.recent.events.filter((event) => event.tool === selected) ?? [];
  const callers = new Set(selectedEvents.map((event) => event.subjectId));
  const clients = new Set(
    selectedEvents.flatMap((event) => {
      const client = reportedClient(event);
      return client ? [client] : [];
    })
  );
  const selectedRow = rows.find((row) => row.tool === selected);

  return (
    <ViewState
      loading={loading}
      error={error}
      empty={Boolean(data && rows.length === 0)}
      onRetry={() => setRetry((value) => value + 1)}
    >
      {data ? (
        <div className="analytics-explorer">
          <section className="console-panel analytics-explorer__list">
            <header className="console-panel__header">
              <div>
                <span>Tools</span>
                <h2>Observed tool usage</h2>
              </div>
              <span className="console-count">{rows.length} tools</span>
            </header>
            <div className="console-table-wrap">
              <table className="console-table analytics-select-table">
                <thead>
                  <tr>
                    <th>Tool</th>
                    <th>Calls</th>
                    <th>Denied</th>
                    <th>p95</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.tool}
                      className={selected === row.tool ? "is-selected" : undefined}
                    >
                      <td>
                        <button type="button" onClick={() => setSelected(row.tool)}>
                          <code>{row.tool}</code>
                        </button>
                      </td>
                      <td>{row.calls.toLocaleString()}</td>
                      <td>{row.denials.toLocaleString()}</td>
                      <td>{formatDuration(row.latency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="console-panel analytics-explorer__detail">
            <header className="console-panel__header">
              <div>
                <span>Tool deep dive</span>
                <h2>{selected ?? "Select a tool"}</h2>
              </div>
            </header>
            {selectedRow ? (
              <div className="analytics-detail-stack">
                <div className="analytics-metrics analytics-metrics--four">
                  <Metric
                    label="Attempts"
                    value={selectedRow.calls}
                    context="selected range"
                  />
                  <Metric
                    label="Denied"
                    value={selectedRow.denials}
                    context="policy outcomes"
                  />
                  <Metric
                    label="p95 latency"
                    value={formatDuration(selectedRow.latency)}
                    context="end to end"
                  />
                  <Metric label="Callers" value={callers.size} context="subject IDs" />
                </div>
                <dl className="analytics-dimension-list">
                  <div>
                    <dt>Reported clients</dt>
                    <dd>{[...clients].join(", ") || "No recent samples"}</dd>
                  </div>
                  <div>
                    <dt>Servers</dt>
                    <dd>
                      {[
                        ...new Set(
                          selectedEvents.flatMap((event) =>
                            event.serverId ? [event.serverId] : []
                          )
                        ),
                      ].join(", ") || "No server dimension"}
                    </dd>
                  </div>
                  <div>
                    <dt>Matched rules</dt>
                    <dd>
                      {[
                        ...new Set(
                          selectedEvents.flatMap((event) => event.matchedRuleIds)
                        ),
                      ].join(", ") || "No matched rules"}
                    </dd>
                  </div>
                  <div>
                    <dt>Error codes</dt>
                    <dd>
                      {[
                        ...new Set(
                          selectedEvents.flatMap((event) =>
                            event.errorCode ? [event.errorCode] : []
                          )
                        ),
                      ].join(", ") || "No errors"}
                    </dd>
                  </div>
                </dl>
                <EventTable
                  events={selectedEvents.slice(0, 50)}
                  caption={`Recent ${selected} events`}
                />
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </ViewState>
  );
}

function IdentitiesView({
  client,
  range,
  refreshKey,
}: {
  client: LiteMcpApiClient;
  range: AnalyticsRange;
  refreshKey: number;
}) {
  const [top, setTop] = useState<AnalyticsTopResult | null>(null);
  const [recent, setRecent] = useState<AnalyticsRecentResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([
      client.getAnalyticsTop({
        ...range,
        dimension: "subject",
        metric: "calls",
        limit: 100,
      }),
      client.getAnalyticsRecent({ ...range, limit: 500 }),
    ])
      .then(([topResult, recentResult]) => {
        if (!active) return;
        setTop(topResult.data);
        setRecent(recentResult.data);
        setSelected((current) =>
          current && topResult.data.rows.some((row) => row.key === current)
            ? current
            : (topResult.data.rows[0]?.key ?? null)
        );
      })
      .catch((cause) => {
        if (active) setError(analyticsError(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, range.from, range.to, refreshKey, retry]);

  const events = recent?.events.filter((event) => event.subjectId === selected) ?? [];
  const visible = new Set(events.flatMap((event) => event.visibleTools ?? []));
  const called = new Set(events.flatMap((event) => (event.tool ? [event.tool] : [])));
  const sessions = new Set(events.map((event) => event.sessionId));
  const clients = new Set(
    events.flatMap((event) => {
      const client = reportedClient(event);
      return client ? [client] : [];
    })
  );
  const denied = events.filter((event) => event.status === "denied").length;

  return (
    <ViewState
      loading={loading}
      error={error}
      empty={Boolean(top && top.rows.length === 0)}
      onRetry={() => setRetry((value) => value + 1)}
    >
      {top && recent ? (
        <div className="analytics-explorer">
          <section className="console-panel analytics-explorer__list">
            <header className="console-panel__header">
              <div>
                <span>Identities</span>
                <h2>Observed subject IDs</h2>
              </div>
              <span className="console-count">{top.rows.length} active</span>
            </header>
            <div className="analytics-choice-list">
              {top.rows.map((row) => (
                <button
                  type="button"
                  key={row.key}
                  className={selected === row.key ? "is-selected" : undefined}
                  aria-pressed={selected === row.key}
                  onClick={() => setSelected(row.key)}
                >
                  <code>{row.key}</code>
                  <strong>{row.value.toLocaleString()}</strong>
                  <span>attempts</span>
                </button>
              ))}
            </div>
          </section>
          <section className="console-panel analytics-explorer__detail">
            <header className="console-panel__header">
              <div>
                <span>Identity deep dive</span>
                <h2>{selected ?? "Select a subject ID"}</h2>
              </div>
            </header>
            <div className="analytics-detail-stack">
              <div className="analytics-metrics analytics-metrics--four">
                <Metric
                  label="Sessions"
                  value={sessions.size}
                  context="selected range"
                />
                <Metric
                  label="Reported clients"
                  value={clients.size}
                  context="self-asserted"
                />
                <Metric
                  label="Tools used"
                  value={called.size}
                  context="observed attempts"
                />
                <Metric label="Denied" value={denied} context="policy outcomes" />
              </div>
              <div className="analytics-capability-grid">
                <div>
                  <span>Visible during discovery</span>
                  <strong>{visible.size}</strong>
                  <p>
                    {[...visible].slice(0, 20).join(", ") ||
                      "No discovery sample in the selected range."}
                  </p>
                </div>
                <div>
                  <span>Actually attempted</span>
                  <strong>{called.size}</strong>
                  <p>
                    {[...called].slice(0, 20).join(", ") ||
                      "No tool attempt in the selected range."}
                  </p>
                </div>
              </div>
              <dl className="analytics-dimension-list">
                <div>
                  <dt>Reported clients</dt>
                  <dd>{[...clients].join(", ") || "No client attribution"}</dd>
                </div>
                <div>
                  <dt>Roles observed</dt>
                  <dd>
                    {[...new Set(events.flatMap((event) => event.roles))].join(", ") ||
                      "No roles"}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
        </div>
      ) : null}
    </ViewState>
  );
}

function SessionsView({
  client,
  range,
  refreshKey,
  auditEvents,
}: {
  client: LiteMcpApiClient;
  range: AnalyticsRange;
  refreshKey: number;
  auditEvents: AuditEvent[];
}) {
  const [recent, setRecent] = useState<AnalyticsRecentResult | null>(null);
  const [timeline, setTimeline] = useState<AnalyticsSessionTimelineResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void client
      .getAnalyticsRecent({ ...range, limit: 500 })
      .then((result) => {
        if (!active) return;
        setRecent(result.data);
        const ids = [...new Set(result.data.events.map((event) => event.sessionId))];
        setSelected((current) =>
          current && ids.includes(current) ? current : (ids[0] ?? null)
        );
      })
      .catch((cause) => {
        if (active) setError(analyticsError(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, range.from, range.to, refreshKey, retry]);

  useEffect(() => {
    if (!selected) {
      setTimeline(null);
      return;
    }
    let active = true;
    setTimelineLoading(true);
    void client
      .getAnalyticsSessionTimeline(selected, range)
      .then((result) => {
        if (active) setTimeline(result.data);
      })
      .catch((cause) => {
        if (active) setError(analyticsError(cause));
      })
      .finally(() => {
        if (active) setTimelineLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, range.from, range.to, selected]);

  const sessions = useMemo(() => {
    const grouped = new Map<string, UsageEvent[]>();
    for (const event of recent?.events ?? []) {
      const values = grouped.get(event.sessionId) ?? [];
      values.push(event);
      grouped.set(event.sessionId, values);
    }
    return [...grouped.entries()]
      .map(([sessionId, events]) => ({
        sessionId,
        events,
        latest: events[0]?.ts ?? "",
        subjectId: events[0]?.subjectId ?? "unknown",
      }))
      .sort((left, right) => right.latest.localeCompare(left.latest));
  }, [recent]);
  const auditByRequest = useMemo(
    () => new Map(auditEvents.map((event) => [event.requestId, event])),
    [auditEvents]
  );

  return (
    <ViewState
      loading={loading}
      error={error}
      empty={Boolean(recent && sessions.length === 0)}
      onRetry={() => setRetry((value) => value + 1)}
    >
      {recent ? (
        <div className="analytics-explorer analytics-explorer--sessions">
          <section className="console-panel analytics-explorer__list">
            <header className="console-panel__header">
              <div>
                <span>Sessions</span>
                <h2>Recent MCP sessions</h2>
              </div>
              <span className="console-count">{sessions.length} sessions</span>
            </header>
            <div className="analytics-choice-list">
              {sessions.map((session) => (
                <button
                  type="button"
                  key={session.sessionId}
                  className={selected === session.sessionId ? "is-selected" : undefined}
                  aria-pressed={selected === session.sessionId}
                  onClick={() => setSelected(session.sessionId)}
                >
                  <code>{session.sessionId}</code>
                  <strong>{session.events.length}</strong>
                  <span>{session.subjectId}</span>
                  <small>{formatDate(session.latest)}</small>
                </button>
              ))}
            </div>
          </section>
          <section className="console-panel analytics-explorer__detail">
            <header className="console-panel__header">
              <div>
                <span>Session timeline</span>
                <h2>{selected ?? "Select a session"}</h2>
              </div>
              {timeline?.durationMs !== null && timeline?.durationMs !== undefined ? (
                <span className="console-count">
                  {formatDuration(timeline.durationMs)}
                </span>
              ) : null}
            </header>
            {timelineLoading ? (
              <div className="analytics-view-state" role="status">
                Loading timeline…
              </div>
            ) : timeline && timeline.items.length > 0 ? (
              <ol className="analytics-timeline">
                {timeline.items.map(({ event, offsetMs }) => {
                  const duration = Math.max(timeline.durationMs ?? 1, 1);
                  const offset = Math.min(96, (offsetMs / duration) * 100);
                  const width = Math.max(
                    1.5,
                    Math.min(
                      100 - offset,
                      ((event.latencyTotalMs ?? 0) / duration) * 100
                    )
                  );
                  const linkedAudit = auditByRequest.get(event.requestId);
                  return (
                    <li key={event.id}>
                      <div className="analytics-timeline__meta">
                        <span>{formatDuration(offsetMs)}</span>
                        <strong>{event.tool ?? event.eventType}</strong>
                        <span
                          className={`analytics-outcome analytics-outcome--${event.status}`}
                        >
                          {event.status}
                        </span>
                      </div>
                      <div
                        className="analytics-waterfall"
                        role="img"
                        aria-label={`${event.eventType} at ${formatDuration(offsetMs)}, lasting ${formatDuration(event.latencyTotalMs)}`}
                      >
                        <span
                          style={
                            {
                              "--waterfall-offset": `${offset}%`,
                              "--waterfall-width": `${width}%`,
                            } as CSSProperties
                          }
                        />
                      </div>
                      <dl>
                        <div>
                          <dt>Total / upstream</dt>
                          <dd>
                            {formatDuration(event.latencyTotalMs)} /{" "}
                            {formatDuration(event.latencyUpstreamMs)}
                          </dd>
                        </div>
                        <div>
                          <dt>Policy / rules</dt>
                          <dd>
                            {event.policyVersion ?? "—"} ·{" "}
                            {event.matchedRuleIds.join(", ") || "no match"}
                          </dd>
                        </div>
                        <div>
                          <dt>Request</dt>
                          <dd>
                            <code>{event.requestId}</code>
                          </dd>
                        </div>
                        <div>
                          <dt>Audit receipt</dt>
                          <dd>
                            {event.auditHash ? (
                              <code>{event.auditHash.slice(0, 16)}…</code>
                            ) : linkedAudit ? (
                              <code>{linkedAudit.hash.slice(0, 16)}…</code>
                            ) : (
                              "No linked receipt"
                            )}
                          </dd>
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="analytics-view-state">
                No events were found for this session in the selected range.
              </div>
            )}
          </section>
        </div>
      ) : null}
    </ViewState>
  );
}

function FlowDiagram({ result }: { result: AnalyticsFlowsResult }) {
  const transitions = result.transitions.slice(0, 18);
  const sources = [...new Set(transitions.map((transition) => transition.source))];
  const targets = [...new Set(transitions.map((transition) => transition.target))];
  if (transitions.length === 0) {
    return (
      <div className="analytics-view-state">No successful tool transitions yet.</div>
    );
  }
  const height = Math.max(220, Math.max(sources.length, targets.length) * 34 + 40);
  const nodeY = (items: string[], item: string) => {
    const index = items.indexOf(item);
    return 28 + (index + 0.5) * ((height - 56) / Math.max(items.length, 1));
  };
  const maxCount = Math.max(...transitions.map((transition) => transition.count));
  return (
    <svg
      className="analytics-flow"
      viewBox={`0 0 820 ${height}`}
      role="img"
      aria-labelledby="analytics-flow-title analytics-flow-description"
    >
      <title id="analytics-flow-title">Tool-to-tool transitions</title>
      <desc id="analytics-flow-description">
        Successful tool calls linked in chronological session order. Line width shows
        transition count.
      </desc>
      {transitions.map((transition) => {
        const sourceY = nodeY(sources, transition.source);
        const targetY = nodeY(targets, transition.target);
        return (
          <g key={`${transition.source}:${transition.target}`}>
            <path
              d={`M 185 ${sourceY} C 330 ${sourceY}, 490 ${targetY}, 635 ${targetY}`}
              fill="none"
              stroke="var(--accent)"
              strokeOpacity={0.18 + (transition.count / maxCount) * 0.48}
              strokeWidth={1 + (transition.count / maxCount) * 10}
            />
            <title>
              {transition.source} to {transition.target}: {transition.count} transitions
              across {transition.sessionCount} sessions
            </title>
          </g>
        );
      })}
      {sources.map((source) => {
        const y = nodeY(sources, source);
        return (
          <g key={`source:${source}`}>
            <rect x="176" y={y - 7} width="9" height="14" fill="var(--foreground)" />
            <text x="166" y={y + 3} textAnchor="end" fill="var(--foreground)">
              {source.length > 25 ? `${source.slice(0, 24)}…` : source}
            </text>
          </g>
        );
      })}
      {targets.map((target) => {
        const y = nodeY(targets, target);
        return (
          <g key={`target:${target}`}>
            <rect x="635" y={y - 7} width="9" height="14" fill="var(--foreground)" />
            <text x="654" y={y + 3} textAnchor="start" fill="var(--foreground)">
              {target.length > 25 ? `${target.slice(0, 24)}…` : target}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function PolicyView({
  client,
  range,
  refreshKey,
}: {
  client: LiteMcpApiClient;
  range: AnalyticsRange;
  refreshKey: number;
}) {
  const [insights, setInsights] = useState<AnalyticsPolicyInsightsResult | null>(null);
  const [flows, setFlows] = useState<AnalyticsFlowsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([
      client.getAnalyticsPolicyInsights(range),
      client.getAnalyticsFlows({ ...range, limit: 100 }),
    ])
      .then(([insightsResult, flowsResult]) => {
        if (!active) return;
        setInsights(insightsResult.data);
        setFlows(flowsResult.data);
      })
      .catch((cause) => {
        if (active) setError(analyticsError(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, range.from, range.to, refreshKey, retry]);

  const empty = Boolean(
    insights &&
      flows &&
      insights.ruleHits.length === 0 &&
      insights.discoveryExecution.discoveries === 0 &&
      flows.transitions.length === 0
  );
  return (
    <ViewState
      loading={loading}
      error={error}
      empty={empty}
      onRetry={() => setRetry((value) => value + 1)}
    >
      {insights && flows ? (
        <div className="analytics-view-stack">
          <div className="analytics-metrics analytics-metrics--four">
            <Metric
              label="Discovery → execution"
              value={formatPercent(insights.discoveryExecution.conversionRate)}
              context={`${insights.discoveryExecution.executingSessions} of ${insights.discoveryExecution.discoveringSessions} sessions`}
            />
            <Metric
              label="Zero-hit rules"
              value={insights.zeroHitRuleIds.length}
              context="active policy"
            />
            <Metric
              label="Pending approvals"
              value={insights.approvals.pending}
              context={`${insights.approvals.decided} decided`}
            />
            <Metric
              label="Approval p95"
              value={formatDuration(insights.approvals.latencyP95Ms)}
              context={`p50 ${formatDuration(insights.approvals.latencyP50Ms)}`}
            />
          </div>
          <div className="analytics-chart-grid">
            <section className="console-panel analytics-panel--wide">
              <header className="console-panel__header">
                <div>
                  <span>Patterns</span>
                  <h2>Successful tool-to-tool flows</h2>
                </div>
                <span className="console-count">{flows.transitions.length} paths</span>
              </header>
              <div className="analytics-flow-wrap">
                <FlowDiagram result={flows} />
              </div>
            </section>
            <section className="console-panel">
              <header className="console-panel__header">
                <div>
                  <span>Conversion</span>
                  <h2>Discovery to execution</h2>
                </div>
              </header>
              <div className="analytics-conversion">
                <div>
                  <span>Discoveries</span>
                  <strong>{insights.discoveryExecution.discoveries}</strong>
                </div>
                <div>
                  <span>Visible tools</span>
                  <strong>{insights.discoveryExecution.toolsVisible}</strong>
                </div>
                <div>
                  <span>Discovering sessions</span>
                  <strong>{insights.discoveryExecution.discoveringSessions}</strong>
                </div>
                <div className="is-terminal">
                  <span>Executing sessions</span>
                  <strong>{insights.discoveryExecution.executingSessions}</strong>
                </div>
              </div>
            </section>
          </div>
          <div className="analytics-three-column">
            <InsightTable
              title="Rule hits"
              columns={["Rule", "Events", "Denied"]}
              rows={insights.ruleHits.map((row) => [
                row.ruleId,
                row.events.toLocaleString(),
                row.denials.toLocaleString(),
              ])}
              empty="No rule matches."
            />
            <InsightTable
              title="Denial hotspots"
              columns={["Tool", "Denied", "Rate"]}
              rows={insights.denialHotspots.map((row) => [
                row.tool,
                `${row.denials}/${row.calls}`,
                formatPercent(row.denyRate),
              ])}
              empty="No denial hotspots."
            />
            <InsightTable
              title="Visible but unused"
              columns={["Tool", "Discoveries", "Calls"]}
              rows={insights.unusedVisibleTools.map((row) => [
                row.tool,
                row.discoveryCount.toLocaleString(),
                row.callCount.toLocaleString(),
              ])}
              empty="No unused visible tools."
            />
          </div>
          {insights.zeroHitRuleIds.length > 0 ? (
            <section className="console-panel">
              <header className="console-panel__header">
                <div>
                  <span>Policy hygiene</span>
                  <h2>Rules with zero hits</h2>
                </div>
                <a className="console-button console-button--quiet" href="#policy">
                  Open policy simulator
                </a>
              </header>
              <div className="analytics-token-list">
                {insights.zeroHitRuleIds.map((ruleId) => (
                  <code key={ruleId}>{ruleId}</code>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </ViewState>
  );
}

function InsightTable({
  title,
  columns,
  rows,
  empty,
}: {
  title: string;
  columns: [string, string, string];
  rows: string[][];
  empty: string;
}) {
  return (
    <section className="console-panel">
      <header className="console-panel__header">
        <div>
          <span>Governance</span>
          <h2>{title}</h2>
        </div>
      </header>
      {rows.length > 0 ? (
        <div className="console-table-wrap">
          <table className="console-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 20).map((row) => (
                <tr key={row.join(":")}>
                  <td>
                    <code>{row[0]}</code>
                  </td>
                  <td>{row[1]}</td>
                  <td>{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="analytics-mini-empty">{empty}</div>
      )}
    </section>
  );
}

function AuditEvidence({ events }: { events: AuditEvent[] }) {
  return (
    <details className="analytics-audit-evidence">
      <summary>
        Audit evidence <span>{events.length} append-only events</span>
      </summary>
      <div className="console-table-wrap">
        <table className="console-table">
          <caption className="sr-only">Recent tamper-evident audit events</caption>
          <thead>
            <tr>
              <th>Time</th>
              <th>Outcome</th>
              <th>Action</th>
              <th>Target</th>
              <th>Request</th>
              <th>Chain hash</th>
            </tr>
          </thead>
          <tbody>
            {events.slice(0, 25).map((event) => (
              <tr key={event.id}>
                <td>{formatDate(event.createdAt)}</td>
                <td>{event.outcome}</td>
                <td>{event.action}</td>
                <td>
                  <code>{event.targetId}</code>
                </td>
                <td>
                  <code>{event.requestId}</code>
                </td>
                <td>
                  <code>{event.hash.slice(0, 16)}…</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function ObservabilityArea({
  client,
  gatewayStatus,
  auditEvents,
}: ObservabilityAreaProps) {
  const [view, setView] = useState<AnalyticsView>("dashboard");
  const [preset, setPreset] = useState<RangePreset>("24h");
  const [range, setRange] = useState<AnalyticsRange>(() => makeRange("24h"));
  const [refreshKey, setRefreshKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const selectPreset = (next: RangePreset) => {
    setPreset(next);
    setRange(makeRange(next));
    setRefreshKey((value) => value + 1);
  };

  const refresh = () => {
    setRange(makeRange(preset));
    setRefreshKey((value) => value + 1);
  };

  const exportView = async () => {
    setExporting(true);
    setExportError(null);
    const stamp = new Date().toISOString().slice(0, 10);
    try {
      const config = (() => {
        switch (view) {
          case "dashboard":
            return [
              "/api/v1/analytics/summary",
              range,
              `analytics-summary-${stamp}.csv`,
            ] as const;
          case "live":
            return [
              "/api/v1/analytics/recent",
              { ...range, limit: 500 },
              `analytics-recent-${stamp}.csv`,
            ] as const;
          case "tools":
            return [
              "/api/v1/analytics/top",
              { ...range, dimension: "tool", metric: "calls", limit: 100 },
              `analytics-tools-${stamp}.csv`,
            ] as const;
          case "identities":
            return [
              "/api/v1/analytics/top",
              { ...range, dimension: "subject", metric: "calls", limit: 100 },
              `analytics-identities-${stamp}.csv`,
            ] as const;
          case "sessions":
            return [
              "/api/v1/analytics/recent",
              { ...range, limit: 500 },
              `analytics-sessions-${stamp}.csv`,
            ] as const;
          case "policy":
            return [
              "/api/v1/analytics/policy-insights",
              range,
              `analytics-policy-${stamp}.csv`,
            ] as const;
        }
      })();
      const [path, params, filename] = config;
      const result = await client.downloadAnalyticsCsv(path, params, filename);
      downloadBlob(result.blob, result.filename);
    } catch (cause) {
      setExportError(analyticsError(cause));
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="console-area analytics-area">
      <header className="console-area-heading analytics-heading">
        <div>
          <span>Insight plane</span>
          <h1>Usage observability</h1>
          <p>
            Payload-free tenant analytics for MCP usage, latency, client attribution,
            policy outcomes, and audit-linked session traces.
          </p>
        </div>
        <div className="console-area-heading__actions">
          <span className={`analytics-gateway analytics-gateway--${gatewayStatus}`}>
            Gateway {gatewayStatus}
          </span>
        </div>
      </header>

      <div className="analytics-toolbar">
        <div className="analytics-tabs" role="tablist" aria-label="Observability views">
          {views.map((item) => (
            <button
              type="button"
              role="tab"
              id={`analytics-tab-${item.id}`}
              aria-controls={`analytics-panel-${item.id}`}
              aria-selected={view === item.id}
              className={view === item.id ? "is-active" : undefined}
              key={item.id}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="analytics-toolbar__actions">
          <fieldset className="analytics-range">
            <legend className="sr-only">Analytics date range</legend>
            {(["24h", "7d", "30d"] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={preset === value}
                className={preset === value ? "is-active" : undefined}
                onClick={() => selectPreset(value)}
              >
                {value}
              </button>
            ))}
          </fieldset>
          <button
            type="button"
            className="console-button console-button--quiet"
            onClick={refresh}
          >
            Refresh
          </button>
          <button
            type="button"
            className="console-button"
            disabled={exporting}
            onClick={() => void exportView()}
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>
      {exportError ? (
        <div className="analytics-export-error" role="alert">
          {exportError}
        </div>
      ) : null}
      <div
        role="tabpanel"
        id={`analytics-panel-${view}`}
        aria-labelledby={`analytics-tab-${view}`}
      >
        {view === "dashboard" ? (
          <DashboardView
            client={client}
            range={range}
            preset={preset}
            refreshKey={refreshKey}
          />
        ) : null}
        {view === "live" ? <LiveView client={client} preset={preset} /> : null}
        {view === "tools" ? (
          <ToolsView client={client} range={range} refreshKey={refreshKey} />
        ) : null}
        {view === "identities" ? (
          <IdentitiesView client={client} range={range} refreshKey={refreshKey} />
        ) : null}
        {view === "sessions" ? (
          <SessionsView
            client={client}
            range={range}
            refreshKey={refreshKey}
            auditEvents={auditEvents}
          />
        ) : null}
        {view === "policy" ? (
          <PolicyView client={client} range={range} refreshKey={refreshKey} />
        ) : null}
      </div>
      <AuditEvidence events={auditEvents} />
    </section>
  );
}
