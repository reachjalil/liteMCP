import {
  type AnalyticsFlowsQuery,
  type AnalyticsFlowsResult,
  type AnalyticsInterval,
  type AnalyticsPolicyInsightsQuery,
  type AnalyticsPolicyInsightsResult,
  type AnalyticsRecentQuery,
  type AnalyticsRecentResult,
  type AnalyticsSessionTimelineQuery,
  type AnalyticsSessionTimelineResult,
  type AnalyticsSummaryQuery,
  type AnalyticsSummaryResult,
  type AnalyticsTimeseriesQuery,
  type AnalyticsTimeseriesResult,
  type AnalyticsTopDimension,
  type AnalyticsTopQuery,
  type AnalyticsTopResult,
  analyticsFlowsQuerySchema,
  analyticsPolicyInsightsQuerySchema,
  analyticsRecentQuerySchema,
  analyticsSessionTimelineQuerySchema,
  analyticsSummaryQuerySchema,
  analyticsTimeseriesQuerySchema,
  analyticsTopQuerySchema,
  type UsageEvent,
} from "@litemcp/contracts";

const intervalMilliseconds: Record<AnalyticsInterval, number> = {
  "5m": 5 * 60 * 1_000,
  "1h": 60 * 60 * 1_000,
  "1d": 24 * 60 * 60 * 1_000,
};

const toolAttemptTypes = new Set<UsageEvent["eventType"]>([
  "call",
  "denied",
  "approval_required",
  "error",
]);

const eventTime = (event: UsageEvent) => Date.parse(event.ts);

const compareAscending = (left: UsageEvent, right: UsageEvent) =>
  eventTime(left) - eventTime(right) || left.id.localeCompare(right.id);

const compareDescending = (left: UsageEvent, right: UsageEvent) =>
  eventTime(right) - eventTime(left) || right.id.localeCompare(left.id);

const eventsInRange = (
  source: readonly UsageEvent[],
  query: { tenantId: string; from: string; to: string }
) => {
  const from = Date.parse(query.from);
  const to = Date.parse(query.to);
  return source
    .filter((event) => {
      const ts = eventTime(event);
      return event.tenantId === query.tenantId && ts >= from && ts < to;
    })
    .sort(compareAscending);
};

const isToolAttempt = (event: UsageEvent) =>
  event.tool !== undefined && toolAttemptTypes.has(event.eventType);

const isDeniedAttempt = (event: UsageEvent) =>
  isToolAttempt(event) && event.eventType === "denied";

const isErrorAttempt = (event: UsageEvent) =>
  isToolAttempt(event) && (event.eventType === "error" || event.status === "failed");

const isSuccessfulCall = (event: UsageEvent) =>
  event.tool !== undefined &&
  event.eventType === "call" &&
  event.status === "succeeded";

const isPolicyEvaluation = (event: UsageEvent) =>
  event.eventType === "discover" || isToolAttempt(event);

const isClientActivity = (event: UsageEvent) =>
  event.eventType === "initialize" ||
  event.eventType === "discover" ||
  isToolAttempt(event);

/** Nearest-rank percentile, chosen for portable parity across adapters. */
export const nearestRankPercentile = (
  source: readonly number[],
  percentile: number
): number | null => {
  if (source.length === 0) return null;
  const values = [...source].sort((left, right) => left - right);
  const rank = Math.max(0, Math.ceil(percentile * values.length) - 1);
  return values[Math.min(rank, values.length - 1)] ?? null;
};

const ratio = (numerator: number, denominator: number) =>
  denominator === 0 ? 0 : numerator / denominator;

const approvalCorrelationKey = (event: UsageEvent) =>
  event.approvalId ?? event.requestId;

const pendingApprovalIds = (events: readonly UsageEvent[]) => {
  const pending = new Set<string>();
  for (const event of events) {
    if (event.eventType === "approval_required") {
      pending.add(approvalCorrelationKey(event));
    }
    if (event.eventType === "approval_decided") {
      pending.delete(approvalCorrelationKey(event));
    }
  }
  return [...pending].sort();
};

export const aggregateSummary = (
  source: readonly UsageEvent[],
  input: AnalyticsSummaryQuery
): AnalyticsSummaryResult => {
  const query = analyticsSummaryQuerySchema.parse(input);
  const events = eventsInRange(source, query);
  const attempts = events.filter(isToolAttempt);
  const activity = events.filter(isClientActivity);
  const denials = attempts.filter(isDeniedAttempt).length;
  const errors = attempts.filter(isErrorAttempt).length;
  const latencies = attempts.flatMap((event) =>
    event.latencyTotalMs === undefined ? [] : [event.latencyTotalMs]
  );
  return {
    from: query.from,
    to: query.to,
    calls: attempts.length,
    activeIdentities: new Set(activity.map((event) => event.subjectId)).size,
    activeSessions: new Set(activity.map((event) => event.sessionId)).size,
    denials,
    denyRate: ratio(denials, attempts.length),
    errors,
    errorRate: ratio(errors, attempts.length),
    latencyP50Ms: nearestRankPercentile(latencies, 0.5),
    latencyP95Ms: nearestRankPercentile(latencies, 0.95),
    pendingApprovals: pendingApprovalIds(events).length,
  };
};

export class AnalyticsQueryLimitError extends Error {
  readonly code = "ANALYTICS_QUERY_LIMIT";

  constructor(message: string) {
    super(message);
    this.name = "AnalyticsQueryLimitError";
  }
}

export const aggregateTimeseries = (
  source: readonly UsageEvent[],
  input: AnalyticsTimeseriesQuery
): AnalyticsTimeseriesResult => {
  const query = analyticsTimeseriesQuerySchema.parse(input);
  const events = eventsInRange(source, query);
  const intervalMs = intervalMilliseconds[query.interval];
  const firstBucket = Math.floor(Date.parse(query.from) / intervalMs) * intervalMs;
  const lastExclusive = Date.parse(query.to);
  const pointCount = Math.ceil((lastExclusive - firstBucket) / intervalMs);
  if (pointCount > 50_000) {
    throw new AnalyticsQueryLimitError(
      "Timeseries queries may contain at most 50,000 buckets."
    );
  }

  const buckets = new Map<number, UsageEvent[]>();
  for (const event of events) {
    const bucket = Math.floor(eventTime(event) / intervalMs) * intervalMs;
    const values = buckets.get(bucket) ?? [];
    values.push(event);
    buckets.set(bucket, values);
  }

  const points: AnalyticsTimeseriesResult["points"] = [];
  for (let bucket = firstBucket; bucket < lastExclusive; bucket += intervalMs) {
    const bucketEvents = buckets.get(bucket) ?? [];
    let value: number | null;
    switch (query.metric) {
      case "calls":
        value = bucketEvents.filter(isToolAttempt).length;
        break;
      case "denials":
        value = bucketEvents.filter(isDeniedAttempt).length;
        break;
      case "errors":
        value = bucketEvents.filter(isErrorAttempt).length;
        break;
      case "latency_p95":
        value = nearestRankPercentile(
          bucketEvents.flatMap((event) =>
            isToolAttempt(event) && event.latencyTotalMs !== undefined
              ? [event.latencyTotalMs]
              : []
          ),
          0.95
        );
        break;
    }
    points.push({ ts: new Date(bucket).toISOString(), value });
  }
  return {
    from: query.from,
    to: query.to,
    metric: query.metric,
    interval: query.interval,
    points,
  };
};

const dimensionKeys = (
  event: UsageEvent,
  dimension: AnalyticsTopDimension
): string[] => {
  switch (dimension) {
    case "tool":
      return event.tool ? [event.tool] : [];
    case "subject":
      return [event.subjectId];
    case "client":
      return [`${event.clientName}@${event.clientVersion}`];
    case "rule":
      return event.matchedRuleIds;
    case "server":
      return event.serverId ? [event.serverId] : [];
  }
};

export const aggregateTop = (
  source: readonly UsageEvent[],
  input: AnalyticsTopQuery
): AnalyticsTopResult => {
  const query = analyticsTopQuerySchema.parse(input);
  const attempts = eventsInRange(source, query).filter(isToolAttempt);
  const groups = new Map<string, UsageEvent[]>();
  for (const event of attempts) {
    for (const key of dimensionKeys(event, query.dimension)) {
      const values = groups.get(key) ?? [];
      values.push(event);
      groups.set(key, values);
    }
  }
  const rows = [...groups.entries()]
    .flatMap(([key, events]) => {
      let value: number | null;
      switch (query.metric) {
        case "calls":
          value = events.length;
          break;
        case "denials":
          value = events.filter(isDeniedAttempt).length;
          break;
        case "latency":
          value = nearestRankPercentile(
            events.flatMap((event) =>
              event.latencyTotalMs === undefined ? [] : [event.latencyTotalMs]
            ),
            0.95
          );
          break;
      }
      return value === null ? [] : [{ key, value, eventCount: events.length }];
    })
    .sort(
      (left, right) =>
        right.value - left.value ||
        right.eventCount - left.eventCount ||
        left.key.localeCompare(right.key)
    )
    .slice(0, query.limit);
  return {
    from: query.from,
    to: query.to,
    dimension: query.dimension,
    metric: query.metric,
    rows,
  };
};

const encodeRecentCursor = (event: UsageEvent) =>
  btoa(JSON.stringify({ ts: event.ts, id: event.id }));

const decodeRecentCursor = (cursor: string) => {
  try {
    const value = JSON.parse(atob(cursor)) as { ts?: unknown; id?: unknown };
    if (typeof value.ts !== "string" || typeof value.id !== "string") throw new Error();
    const time = Date.parse(value.ts);
    if (!Number.isFinite(time)) throw new Error();
    return { ts: time, id: value.id };
  } catch {
    throw new TypeError("Invalid analytics recent cursor.");
  }
};

export const aggregateRecent = (
  source: readonly UsageEvent[],
  input: AnalyticsRecentQuery
): AnalyticsRecentResult => {
  const query = analyticsRecentQuerySchema.parse(input);
  let events = eventsInRange(source, query).sort(compareDescending);
  if (query.cursor) {
    const cursor = decodeRecentCursor(query.cursor);
    events = events.filter((event) => {
      const ts = eventTime(event);
      return ts < cursor.ts || (ts === cursor.ts && event.id < cursor.id);
    });
  }
  const page = events.slice(0, query.limit);
  const last = page.at(-1);
  return {
    events: page.map((event) => structuredClone(event)),
    ...(last && events.length > page.length
      ? { nextCursor: encodeRecentCursor(last) }
      : {}),
  };
};

export const aggregateSessionTimeline = (
  source: readonly UsageEvent[],
  input: AnalyticsSessionTimelineQuery
): AnalyticsSessionTimelineResult => {
  const query = analyticsSessionTimelineQuerySchema.parse(input);
  const events = eventsInRange(source, query).filter(
    (event) => event.sessionId === query.sessionId
  );
  const first = events[0];
  const last = events.at(-1);
  const startedAt = first?.ts ?? null;
  const endedAt = last?.ts ?? null;
  return {
    sessionId: query.sessionId,
    startedAt,
    endedAt,
    durationMs: first && last ? Math.max(0, eventTime(last) - eventTime(first)) : null,
    items: first
      ? events.map((event) => ({
          offsetMs: Math.max(0, eventTime(event) - eventTime(first)),
          event: structuredClone(event),
        }))
      : [],
  };
};

type TransitionAccumulator = {
  source: string;
  target: string;
  count: number;
  sessions: Set<string>;
};

export const aggregateFlows = (
  source: readonly UsageEvent[],
  input: AnalyticsFlowsQuery
): AnalyticsFlowsResult => {
  const query = analyticsFlowsQuerySchema.parse(input);
  const sessions = new Map<string, UsageEvent[]>();
  for (const event of eventsInRange(source, query).filter(isSuccessfulCall)) {
    const values = sessions.get(event.sessionId) ?? [];
    values.push(event);
    sessions.set(event.sessionId, values);
  }
  const transitions = new Map<string, TransitionAccumulator>();
  for (const [sessionId, events] of sessions) {
    for (let index = 1; index < events.length; index += 1) {
      const sourceEvent = events[index - 1];
      const targetEvent = events[index];
      if (!sourceEvent?.tool || !targetEvent?.tool) continue;
      const key = JSON.stringify([sourceEvent.tool, targetEvent.tool]);
      const current = transitions.get(key) ?? {
        source: sourceEvent.tool,
        target: targetEvent.tool,
        count: 0,
        sessions: new Set<string>(),
      };
      current.count += 1;
      current.sessions.add(sessionId);
      transitions.set(key, current);
    }
  }
  return {
    from: query.from,
    to: query.to,
    transitions: [...transitions.values()]
      .map((transition) => ({
        source: transition.source,
        target: transition.target,
        count: transition.count,
        sessionCount: transition.sessions.size,
      }))
      .sort(
        (left, right) =>
          right.count - left.count ||
          left.source.localeCompare(right.source) ||
          left.target.localeCompare(right.target)
      )
      .slice(0, query.limit),
  };
};

export const aggregatePolicyInsights = (
  source: readonly UsageEvent[],
  input: AnalyticsPolicyInsightsQuery
): AnalyticsPolicyInsightsResult => {
  const query = analyticsPolicyInsightsQuerySchema.parse(input);
  const events = eventsInRange(source, query).filter(
    (event) => !query.policyId || event.policyId === query.policyId
  );
  const ruleHits = new Map<string, { events: number; denials: number }>();
  for (const event of events.filter(isPolicyEvaluation)) {
    for (const ruleId of event.matchedRuleIds) {
      const current = ruleHits.get(ruleId) ?? { events: 0, denials: 0 };
      current.events += 1;
      if (event.eventType === "denied") current.denials += 1;
      ruleHits.set(ruleId, current);
    }
  }

  const toolAttempts = new Map<string, { calls: number; denials: number }>();
  for (const event of events.filter(isToolAttempt)) {
    if (!event.tool) continue;
    const current = toolAttempts.get(event.tool) ?? { calls: 0, denials: 0 };
    current.calls += 1;
    if (isDeniedAttempt(event)) current.denials += 1;
    toolAttempts.set(event.tool, current);
  }

  const discoveredSessions = new Set<string>();
  const executingSessions = new Set<string>();
  const visibleToolDiscoveries = new Map<string, number>();
  let discoveries = 0;
  let toolsVisible = 0;
  for (const event of events) {
    if (event.eventType === "discover") {
      discoveries += 1;
      toolsVisible += event.toolsVisible ?? 0;
      for (const tool of event.visibleTools ?? []) {
        visibleToolDiscoveries.set(tool, (visibleToolDiscoveries.get(tool) ?? 0) + 1);
      }
      if (event.status === "succeeded") discoveredSessions.add(event.sessionId);
    } else if (isToolAttempt(event) && discoveredSessions.has(event.sessionId)) {
      executingSessions.add(event.sessionId);
    }
  }

  const pending = new Map<string, UsageEvent>();
  let required = 0;
  const decisions: Array<{ decision: UsageEvent; latency: number }> = [];
  for (const event of events) {
    const key = approvalCorrelationKey(event);
    if (event.eventType === "approval_required" && !pending.has(key)) {
      pending.set(key, event);
      required += 1;
    }
    if (event.eventType === "approval_decided") {
      const requested = pending.get(key);
      if (requested && eventTime(event) >= eventTime(requested)) {
        decisions.push({
          decision: event,
          latency: event.approvalLatencyMs ?? eventTime(event) - eventTime(requested),
        });
        pending.delete(key);
      }
    }
  }
  const approved = decisions.filter(
    ({ decision }) => decision.status === "succeeded"
  ).length;
  const denied = decisions.filter(
    ({ decision }) => decision.status === "denied"
  ).length;
  const approvalLatencies = decisions.map(({ latency }) => latency);

  return {
    from: query.from,
    to: query.to,
    ruleHits: [...ruleHits.entries()]
      .map(([ruleId, counts]) => ({ ruleId, ...counts }))
      .sort(
        (left, right) =>
          right.events - left.events || left.ruleId.localeCompare(right.ruleId)
      ),
    zeroHitRuleIds: query.ruleIds.filter((ruleId) => !ruleHits.has(ruleId)).sort(),
    denialHotspots: [...toolAttempts.entries()]
      .filter(([, counts]) => counts.denials > 0)
      .map(([tool, counts]) => ({
        tool,
        ...counts,
        denyRate: ratio(counts.denials, counts.calls),
      }))
      .sort(
        (left, right) =>
          right.denials - left.denials ||
          right.denyRate - left.denyRate ||
          left.tool.localeCompare(right.tool)
      ),
    unusedVisibleTools: [...visibleToolDiscoveries.entries()]
      .map(([tool, discoveryCount]) => ({
        tool,
        discoveryCount,
        callCount: events.filter((event) => isToolAttempt(event) && event.tool === tool)
          .length,
      }))
      .filter((row) => row.callCount === 0)
      .sort(
        (left, right) =>
          right.discoveryCount - left.discoveryCount ||
          left.tool.localeCompare(right.tool)
      ),
    discoveryExecution: {
      discoveries,
      toolsVisible,
      discoveringSessions: discoveredSessions.size,
      executingSessions: executingSessions.size,
      conversionRate: ratio(executingSessions.size, discoveredSessions.size),
    },
    approvals: {
      required,
      decided: decisions.length,
      approved,
      denied,
      pending: pending.size,
      latencyP50Ms: nearestRankPercentile(approvalLatencies, 0.5),
      latencyP95Ms: nearestRankPercentile(approvalLatencies, 0.95),
    },
  };
};
