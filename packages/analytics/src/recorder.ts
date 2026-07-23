import { type UsageEvent, usageEventSchema } from "@litemcp/contracts";

import type { AnalyticsSink } from "./types.js";

export type AnalyticsRecorderFailure = {
  phase: "validation" | "sink" | "defer";
  error: unknown;
  event: UsageEvent;
};

export type FailOpenAnalyticsRecorderOptions = {
  enabled?: boolean;
  /** Workers pass `ctx.waitUntil`; Node may omit this and call `flush` on shutdown. */
  defer?: (work: Promise<void>) => void;
  onError?: (failure: AnalyticsRecorderFailure) => void;
};

export interface FailOpenAnalyticsRecorder {
  /** Starts emission and always returns without throwing. */
  recordUsage(event: UsageEvent): void;
  /** Waits for emissions already started; it never rejects. */
  flush(): Promise<void>;
}

const ignoreFailure = () => undefined;

export const createFailOpenAnalyticsRecorder = (
  sink: AnalyticsSink,
  options: FailOpenAnalyticsRecorderOptions = {}
): FailOpenAnalyticsRecorder => {
  const pending = new Set<Promise<void>>();
  const report = (failure: AnalyticsRecorderFailure) => {
    try {
      (options.onError ?? ignoreFailure)(failure);
    } catch {
      // Analytics diagnostics are fail-open too.
    }
  };

  return {
    recordUsage(event) {
      if (options.enabled === false) return;
      const parsed = usageEventSchema.safeParse(event);
      if (!parsed.success) {
        report({ phase: "validation", error: parsed.error, event });
        return;
      }

      const emission = Promise.resolve()
        .then(() => sink.recordUsage(parsed.data))
        .catch((error: unknown) => {
          report({ phase: "sink", error, event: parsed.data });
        });
      const tracked = emission.finally(() => pending.delete(tracked));
      pending.add(tracked);

      if (options.defer) {
        try {
          options.defer(tracked);
        } catch (error) {
          report({ phase: "defer", error, event: parsed.data });
        }
      }
    },
    async flush() {
      await Promise.allSettled([...pending]);
    },
  };
};

export class NoopAnalyticsSink implements AnalyticsSink {
  async recordUsage(_event: UsageEvent): Promise<void> {}
}

/** Fan-out sink that always attempts every destination before reporting failures. */
export class CompositeAnalyticsSink implements AnalyticsSink {
  readonly #sinks: readonly AnalyticsSink[];

  constructor(sinks: readonly AnalyticsSink[]) {
    this.#sinks = [...sinks];
  }

  async recordUsage(event: UsageEvent): Promise<void> {
    const results = await Promise.allSettled(
      this.#sinks.map((sink) => sink.recordUsage(event))
    );
    const failures = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : []
    );
    if (failures.length > 0) {
      throw new AggregateError(failures, "One or more analytics sinks failed.");
    }
  }
}
