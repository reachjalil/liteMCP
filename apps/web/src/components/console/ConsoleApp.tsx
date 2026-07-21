import type {
  ApprovalRequest,
  AuditEvent,
  Composition,
  CreateCompositionInput,
  CreateServerInput,
  CreateSessionInput,
  IdentityProvider,
  McpServerDefinition,
  PlatformOverview,
  Policy,
  PolicyDecision,
  PolicySimulationInput,
  RiskClass,
  Transport,
} from "@litemcp/contracts";
import type { ReactNode, SubmitEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiClientError, type IssuedSession, LiteMcpApiClient } from "../../lib/api";
import "../../styles/console.css";

type ConsoleArea =
  | "overview"
  | "catalog"
  | "composer"
  | "identity"
  | "policy"
  | "approvals"
  | "observability"
  | "settings";

type ConsoleAppProps = {
  apiBaseUrl?: string;
  defaultDemoMode?: boolean;
};

type Notice = {
  tone: "success" | "error" | "info";
  text: string;
  requestId?: string;
};

type LoadState = {
  loading: boolean;
  errors: string[];
  refreshedAt: Date | null;
};

const navigation: Array<{
  id: ConsoleArea;
  label: string;
  short: string;
  group: "Build" | "Govern" | "Operate";
}> = [
  { id: "overview", label: "Overview", short: "OV", group: "Build" },
  { id: "catalog", label: "MCP catalog", short: "MC", group: "Build" },
  { id: "composer", label: "Composer", short: "CO", group: "Build" },
  { id: "identity", label: "Identity & sessions", short: "ID", group: "Govern" },
  { id: "policy", label: "Policy simulator", short: "PL", group: "Govern" },
  { id: "approvals", label: "Approvals", short: "AP", group: "Govern" },
  { id: "observability", label: "Observability", short: "OB", group: "Operate" },
  { id: "settings", label: "Settings", short: "ST", group: "Operate" },
];

const consoleAreas = new Set<ConsoleArea>(navigation.map((item) => item.id));
const riskClasses: RiskClass[] = [
  "read",
  "write",
  "destructive",
  "financial",
  "identity-admin",
  "code-exec",
];

const readInitialArea = (): ConsoleArea => {
  if (typeof window === "undefined") return "overview";
  const hash = window.location.hash.replace(/^#/, "") as ConsoleArea;
  return consoleAreas.has(hash) ? hash : "overview";
};

const readInitialDemoMode = (defaultDemoMode: boolean) => {
  if (typeof window === "undefined") return defaultDemoMode;
  const query = new URLSearchParams(window.location.search).get("demo");
  if (query === "1" || query === "true") return true;
  if (query === "0" || query === "false") return false;
  return defaultDemoMode;
};

const splitList = (value: string) =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

const splitCommand = (value: string) => value.trim().split(/\s+/).filter(Boolean);

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const displayDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const errorNotice = (cause: unknown, fallback: string): Notice => {
  if (cause instanceof ApiClientError) {
    return {
      tone: "error",
      text: cause.message,
      requestId: cause.problem?.requestId,
    };
  }
  return {
    tone: "error",
    text: cause instanceof Error ? cause.message : fallback,
  };
};

const StatusBadge = ({ value }: { value: string }) => {
  const tone = [
    "healthy",
    "active",
    "published",
    "allowed",
    "succeeded",
    "approved",
  ].includes(value)
    ? "positive"
    : ["degraded", "pending", "draft", "require-approval"].includes(value)
      ? "warning"
      : ["offline", "denied", "failed"].includes(value)
        ? "negative"
        : "neutral";
  return <span className={`console-badge console-badge--${tone}`}>{value}</span>;
};

const NoticePanel = ({ notice, onClose }: { notice: Notice; onClose: () => void }) => (
  <div className={`console-notice console-notice--${notice.tone}`} role="status">
    <div>
      <strong>
        {notice.tone === "error"
          ? "Request failed"
          : notice.tone === "success"
            ? "Saved"
            : "Note"}
      </strong>
      <span>{notice.text}</span>
      {notice.requestId ? <code>request {notice.requestId}</code> : null}
    </div>
    <button type="button" onClick={onClose} aria-label="Dismiss message">
      ×
    </button>
  </div>
);

const AreaHeading = ({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) => (
  <header className="console-area-heading">
    <div>
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
    {actions ? <div className="console-area-heading__actions">{actions}</div> : null}
  </header>
);

const EmptyState = ({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) => (
  <div className="console-empty">
    <span aria-hidden="true">◇</span>
    <h2>{title}</h2>
    <p>{description}</p>
    {action}
  </div>
);

export function ConsoleApp({
  apiBaseUrl = "",
  defaultDemoMode = false,
}: ConsoleAppProps) {
  const [area, setArea] = useState<ConsoleArea>(readInitialArea);
  const [demoMode, setDemoMode] = useState(() => readInitialDemoMode(defaultDemoMode));
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [servers, setServers] = useState<McpServerDefinition[]>([]);
  const [compositions, setCompositions] = useState<Composition[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [identityProviders, setIdentityProviders] = useState<IdentityProvider[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loadState, setLoadState] = useState<LoadState>({
    loading: true,
    errors: [],
    refreshedAt: null,
  });
  const [notice, setNotice] = useState<Notice | null>(null);

  const client = useMemo(
    () => new LiteMcpApiClient({ baseUrl: apiBaseUrl, demoMode }),
    [apiBaseUrl, demoMode]
  );

  const activateArea = useCallback((nextArea: ConsoleArea) => {
    setArea(nextArea);
    if (typeof window !== "undefined") {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}#${nextArea}`
      );
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoadState((current) => ({ ...current, loading: true, errors: [] }));
    const results = await Promise.allSettled([
      client.getOverview(),
      client.getServers(),
      client.getCompositions(),
      client.getPolicies(),
      client.getAuditEvents(),
      client.getIdentityProviders(),
      client.getApprovals(),
    ]);

    const errors: string[] = [];
    const [
      overviewResult,
      serversResult,
      compositionsResult,
      policiesResult,
      auditResult,
      providersResult,
      approvalsResult,
    ] = results;

    if (overviewResult?.status === "fulfilled") setOverview(overviewResult.value.data);
    else if (overviewResult?.status === "rejected")
      errors.push(errorNotice(overviewResult.reason, "Overview failed.").text);

    if (serversResult?.status === "fulfilled") setServers(serversResult.value.data);
    else if (serversResult?.status === "rejected")
      errors.push(errorNotice(serversResult.reason, "Server catalog failed.").text);

    if (compositionsResult?.status === "fulfilled")
      setCompositions(compositionsResult.value.data);
    else if (compositionsResult?.status === "rejected")
      errors.push(errorNotice(compositionsResult.reason, "Compositions failed.").text);

    if (policiesResult?.status === "fulfilled") setPolicies(policiesResult.value.data);
    else if (policiesResult?.status === "rejected")
      errors.push(errorNotice(policiesResult.reason, "Policies failed.").text);

    if (auditResult?.status === "fulfilled") setAuditEvents(auditResult.value.data);
    else if (auditResult?.status === "rejected")
      errors.push(errorNotice(auditResult.reason, "Audit feed failed.").text);

    if (providersResult?.status === "fulfilled")
      setIdentityProviders(providersResult.value.data);
    else if (providersResult?.status === "rejected")
      errors.push(
        errorNotice(providersResult.reason, "Identity providers failed.").text
      );

    if (approvalsResult?.status === "fulfilled")
      setApprovals(approvalsResult.value.data);
    else if (approvalsResult?.status === "rejected")
      errors.push(errorNotice(approvalsResult.reason, "Approval queue failed.").text);

    setLoadState({
      loading: false,
      errors: [...new Set(errors)],
      refreshedAt: new Date(),
    });
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleHashChange = () => setArea(readInitialArea());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const toggleDemoMode = () => {
    const next = !demoMode;
    setDemoMode(next);
    setNotice({
      tone: "info",
      text: next
        ? "Demo mode enabled. Requests now send the fixed org_demo and admin headers."
        : "Demo mode disabled. Requests now rely on the authenticated server session.",
    });
    const url = new URL(window.location.href);
    url.searchParams.set("demo", next ? "1" : "0");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const pendingAudit = auditEvents.filter(
    (event) =>
      event.outcome === "pending" || event.type.toLowerCase().includes("approval")
  );
  const currentLabel = navigation.find((item) => item.id === area)?.label ?? "Overview";

  return (
    <div className="console-root">
      <aside className="console-sidebar">
        <div className="console-sidebar__brand">
          <a href="/" aria-label="LiteMCP Composer home">
            <span>Lite</span>
            <strong>MCP</strong>
            <span className="console-wordmark__suffix">Composer</span>
          </a>
          <span>control plane</span>
        </div>
        <div className="console-context">
          <span>Organization</span>
          <strong>
            {overview?.organization.name ??
              (loadState.loading ? "Loading…" : "Unavailable")}
          </strong>
          <small>{overview?.environment.name ?? "No environment"}</small>
        </div>
        <nav className="console-nav" aria-label="Console navigation">
          {(["Build", "Govern", "Operate"] as const).map((group) => (
            <div className="console-nav__group" key={group}>
              <span>{group}</span>
              {navigation
                .filter((item) => item.group === group)
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={area === item.id ? "is-active" : undefined}
                    aria-current={area === item.id ? "page" : undefined}
                    onClick={() => activateArea(item.id)}
                  >
                    <span aria-hidden="true">{item.short}</span>
                    {item.label}
                    {item.id === "approvals" &&
                    (overview?.counts.pendingApprovals ?? 0) > 0 ? (
                      <em>{overview?.counts.pendingApprovals}</em>
                    ) : null}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="console-sidebar__footer">
          <div>
            <span
              className={
                overview?.gateway.status === "healthy" ? "is-healthy" : "is-degraded"
              }
            ></span>{" "}
            Gateway {overview?.gateway.status ?? "unknown"}
          </div>
          <a href="/docs">Documentation ↗</a>
        </div>
      </aside>

      <div className="console-main">
        <header className="console-topbar">
          <div className="console-topbar__crumbs">
            <span>LiteMCP Composer</span>
            <span>/</span>
            <strong>{currentLabel}</strong>
          </div>
          <div className="console-topbar__actions">
            {demoMode ? (
              <span className="console-demo-badge">Demo identity</span>
            ) : null}
            <button
              type="button"
              className="console-button console-button--quiet"
              onClick={() => void refresh()}
              disabled={loadState.loading}
            >
              {loadState.loading ? "Refreshing…" : "Refresh"}
            </button>
            <a className="console-button" href="/login">
              Account
            </a>
          </div>
        </header>

        {demoMode ? (
          <div className="console-demo-banner" role="note">
            <strong>Explicit demo mode</strong>
            <span>
              Every API request includes <code>x-litemcp-tenant: org_demo</code> and{" "}
              <code>x-litemcp-role: finance-admin</code>. This is not production
              authentication.
            </span>
            <button type="button" onClick={toggleDemoMode}>
              Exit demo mode
            </button>
          </div>
        ) : (
          <div className="console-auth-banner" role="note">
            <span>
              Authenticated mode: tenancy and roles must come from the server session.
            </span>
            <button type="button" onClick={toggleDemoMode}>
              Use local demo identity
            </button>
          </div>
        )}

        <main className="console-content" id="console-content" tabIndex={-1}>
          {notice ? (
            <NoticePanel notice={notice} onClose={() => setNotice(null)} />
          ) : null}
          {loadState.errors.length > 0 ? (
            <div className="console-load-errors" role="alert">
              <strong>Some control-plane data could not be loaded.</strong>
              <ul>
                {loadState.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {area === "overview" ? (
            <OverviewArea
              overview={overview}
              servers={servers}
              compositions={compositions}
              auditEvents={auditEvents}
              loading={loadState.loading}
              activateArea={activateArea}
            />
          ) : null}
          {area === "catalog" ? (
            <CatalogArea
              client={client}
              servers={servers}
              onCreated={(server, requestId) => {
                setServers((current) => [
                  server,
                  ...current.filter((item) => item.id !== server.id),
                ]);
                setNotice({
                  tone: "success",
                  text: `${server.name} was registered.`,
                  requestId,
                });
                void refresh();
              }}
              onError={(nextNotice) => setNotice(nextNotice)}
            />
          ) : null}
          {area === "composer" ? (
            <ComposerArea
              client={client}
              overview={overview}
              servers={servers}
              compositions={compositions}
              onCreated={(composition, requestId) => {
                setCompositions((current) => [
                  composition,
                  ...current.filter((item) => item.id !== composition.id),
                ]);
                setNotice({
                  tone: "success",
                  text: `${composition.name} was created.`,
                  requestId,
                });
                void refresh();
              }}
              onError={(nextNotice) => setNotice(nextNotice)}
              activateArea={activateArea}
            />
          ) : null}
          {area === "identity" ? (
            <IdentityArea
              client={client}
              demoMode={demoMode}
              overview={overview}
              compositions={compositions}
              providers={identityProviders}
              onNotice={setNotice}
            />
          ) : null}
          {area === "policy" ? (
            <PolicyArea client={client} policies={policies} onNotice={setNotice} />
          ) : null}
          {area === "approvals" ? (
            <ApprovalsArea
              approvals={approvals}
              events={pendingAudit}
              pendingCount={overview?.counts.pendingApprovals ?? 0}
            />
          ) : null}
          {area === "observability" ? (
            <ObservabilityArea overview={overview} events={auditEvents} />
          ) : null}
          {area === "settings" ? (
            <SettingsArea
              overview={overview}
              apiBaseUrl={apiBaseUrl}
              demoMode={demoMode}
            />
          ) : null}
        </main>

        <footer className="console-statusbar">
          <span>
            {loadState.loading
              ? "Synchronizing control plane"
              : "Control plane synchronized"}
          </span>
          <span>
            {loadState.refreshedAt
              ? `Updated ${loadState.refreshedAt.toLocaleTimeString()}`
              : "Not yet refreshed"}
          </span>
          <span>{overview?.gateway.protocolVersion ?? "Protocol unknown"}</span>
          <span>{overview?.gateway.storageDriver ?? "Storage unknown"}</span>
        </footer>
      </div>
    </div>
  );
}

function OverviewArea({
  overview,
  servers,
  compositions,
  auditEvents,
  loading,
  activateArea,
}: {
  overview: PlatformOverview | null;
  servers: McpServerDefinition[];
  compositions: Composition[];
  auditEvents: AuditEvent[];
  loading: boolean;
  activateArea: (area: ConsoleArea) => void;
}) {
  const counts = overview?.counts;
  const cards = [
    ["MCP servers", counts?.servers ?? servers.length, "catalog"],
    ["Compositions", counts?.compositions ?? compositions.length, "composer"],
    ["Active policies", counts?.activePolicies ?? 0, "policy"],
    ["Active sessions", counts?.sessions ?? 0, "identity"],
    ["Pending approvals", counts?.pendingApprovals ?? 0, "approvals"],
    ["Audit events", counts?.auditEvents ?? auditEvents.length, "observability"],
  ] as const;

  return (
    <section className="console-area">
      <AreaHeading
        eyebrow="Control plane"
        title="Overview"
        description="Current inventory, gateway state, and the shortest path to a governed endpoint."
        actions={overview ? <StatusBadge value={overview.gateway.status} /> : null}
      />
      <div className="console-stat-grid">
        {cards.map(([label, value, target]) => (
          <button key={label} type="button" onClick={() => activateArea(target)}>
            <span>{label}</span>
            <strong>{loading && !overview ? "—" : value}</strong>
            <small>Open {target} →</small>
          </button>
        ))}
      </div>

      <div className="console-grid console-grid--overview">
        <section className="console-panel">
          <header className="console-panel__header">
            <div>
              <span>Gateway</span>
              <h2>Published endpoint</h2>
            </div>
            {overview ? <StatusBadge value={overview.gateway.status} /> : null}
          </header>
          {overview ? (
            <dl className="console-definition-list">
              <div>
                <dt>Endpoint</dt>
                <dd>
                  <code>{overview.gateway.endpoint}</code>
                </dd>
              </div>
              <div>
                <dt>Protocol</dt>
                <dd>{overview.gateway.protocolVersion}</dd>
              </div>
              <div>
                <dt>Environment</dt>
                <dd>
                  {overview.environment.name} · {overview.environment.kind}
                </dd>
              </div>
              <div>
                <dt>Storage</dt>
                <dd>{overview.gateway.storageDriver}</dd>
              </div>
            </dl>
          ) : (
            <EmptyState
              title="Gateway state unavailable"
              description="Connect the control-plane API or retry the request."
            />
          )}
        </section>

        <section className="console-panel">
          <header className="console-panel__header">
            <div>
              <span>Onboarding</span>
              <h2>Publish a first endpoint</h2>
            </div>
          </header>
          <ol className="console-onboarding">
            <li className={servers.length > 0 ? "is-done" : undefined}>
              <span>1</span>
              <div>
                <strong>Register an MCP server</strong>
                <small>
                  {servers.length > 0
                    ? `${servers.length} registered`
                    : "Remote, stdio, or built in"}
                </small>
              </div>
              <button type="button" onClick={() => activateArea("catalog")}>
                Open
              </button>
            </li>
            <li className={compositions.length > 0 ? "is-done" : undefined}>
              <span>2</span>
              <div>
                <strong>Create a composition</strong>
                <small>
                  {compositions.length > 0
                    ? `${compositions.length} created`
                    : "Namespace and pin members"}
                </small>
              </div>
              <button type="button" onClick={() => activateArea("composer")}>
                Open
              </button>
            </li>
            <li
              className={
                (overview?.counts.activePolicies ?? 0) > 0 ? "is-done" : undefined
              }
            >
              <span>3</span>
              <div>
                <strong>Simulate policy</strong>
                <small>Verify discovery and execution</small>
              </div>
              <button type="button" onClick={() => activateArea("policy")}>
                Open
              </button>
            </li>
            <li
              className={(overview?.counts.sessions ?? 0) > 0 ? "is-done" : undefined}
            >
              <span>4</span>
              <div>
                <strong>Issue a scoped session</strong>
                <small>Bind identity to the endpoint</small>
              </div>
              <button type="button" onClick={() => activateArea("identity")}>
                Open
              </button>
            </li>
          </ol>
        </section>
      </div>

      <section className="console-panel">
        <header className="console-panel__header">
          <div>
            <span>Recent evidence</span>
            <h2>Audit activity</h2>
          </div>
          <button type="button" onClick={() => activateArea("observability")}>
            View all
          </button>
        </header>
        <AuditTable
          events={auditEvents.slice(0, 6)}
          emptyDescription="Actions will appear after control-plane or gateway activity."
        />
      </section>
    </section>
  );
}

function CatalogArea({
  client,
  servers,
  onCreated,
  onError,
}: {
  client: LiteMcpApiClient;
  servers: McpServerDefinition[];
  onCreated: (server: McpServerDefinition, requestId: string) => void;
  onError: (notice: Notice) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    transport: "streamable-http" as Transport,
    endpoint: "",
    command: "",
    version: "1.0.0",
    visibility: "private" as "public" | "private" | "unlisted",
    tags: "",
  });

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    const input: CreateServerInput = {
      name: form.name.trim(),
      slug: form.slug.trim() || slugify(form.name),
      description: form.description.trim(),
      transport: form.transport,
      version: form.version.trim(),
      visibility: form.visibility,
      tags: splitList(form.tags),
      tools: [],
      ...(form.transport === "stdio" && form.command.trim()
        ? { command: splitCommand(form.command) }
        : {}),
      ...((form.transport === "streamable-http" || form.transport === "legacy-sse") &&
      form.endpoint.trim()
        ? { endpoint: form.endpoint.trim() }
        : {}),
    };
    try {
      const result = await client.createServer(input);
      onCreated(result.data, result.meta.requestId);
      setForm((current) => ({
        ...current,
        name: "",
        slug: "",
        description: "",
        endpoint: "",
        command: "",
        tags: "",
      }));
    } catch (cause) {
      onError(errorNotice(cause, "Could not register the MCP server."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="console-area">
      <AreaHeading
        eyebrow="Registry"
        title="MCP catalog"
        description="Register concrete upstream definitions and inspect their current health and capability inventory."
      />
      <div className="console-split console-split--form">
        <section className="console-panel console-panel--table">
          <header className="console-panel__header">
            <div>
              <span>Inventory</span>
              <h2>{servers.length} registered servers</h2>
            </div>
          </header>
          {servers.length > 0 ? (
            <div className="console-table-wrap">
              <table className="console-table">
                <caption className="sr-only">Registered MCP servers</caption>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Transport</th>
                    <th>Version</th>
                    <th>Tools</th>
                    <th>Status</th>
                    <th>Visibility</th>
                  </tr>
                </thead>
                <tbody>
                  {servers.map((server) => (
                    <tr key={server.id}>
                      <td>
                        <strong>{server.name}</strong>
                        <small>{server.slug}</small>
                      </td>
                      <td>
                        <code>{server.transport}</code>
                      </td>
                      <td>{server.version}</td>
                      <td>{server.tools.length}</td>
                      <td>
                        <StatusBadge value={server.status} />
                      </td>
                      <td>{server.visibility}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No MCP servers registered"
              description="Use the registration form to add a real upstream definition."
            />
          )}
        </section>

        <section className="console-panel console-panel--sticky">
          <header className="console-panel__header">
            <div>
              <span>Create</span>
              <h2>Register server</h2>
            </div>
          </header>
          <form className="console-form" onSubmit={submit}>
            <label>
              <span>Name</span>
              <input
                required
                minLength={2}
                value={form.name}
                onChange={(event) =>
                  setForm({
                    ...form,
                    name: event.target.value,
                    slug: form.slug || slugify(event.target.value),
                  })
                }
                placeholder="Internal documentation"
              />
            </label>
            <label>
              <span>Slug</span>
              <input
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                value={form.slug}
                onChange={(event) =>
                  setForm({ ...form, slug: slugify(event.target.value) })
                }
                placeholder="internal-docs"
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                placeholder="What this server exposes and who owns it"
              />
            </label>
            <div className="console-form__row">
              <label>
                <span>Transport</span>
                <select
                  value={form.transport}
                  onChange={(event) =>
                    setForm({ ...form, transport: event.target.value as Transport })
                  }
                >
                  <option value="streamable-http">Streamable HTTP</option>
                  <option value="legacy-sse">Legacy HTTP/SSE</option>
                  <option value="stdio">stdio</option>
                  <option value="builtin">Built in</option>
                </select>
              </label>
              <label>
                <span>Version</span>
                <input
                  required
                  value={form.version}
                  onChange={(event) =>
                    setForm({ ...form, version: event.target.value })
                  }
                />
              </label>
            </div>
            {form.transport === "streamable-http" || form.transport === "legacy-sse" ? (
              <label>
                <span>Endpoint URL</span>
                <input
                  required
                  type="url"
                  value={form.endpoint}
                  onChange={(event) =>
                    setForm({ ...form, endpoint: event.target.value })
                  }
                  placeholder="https://mcp.example.com/mcp"
                />
              </label>
            ) : null}
            {form.transport === "stdio" ? (
              <label>
                <span>Command</span>
                <input
                  required
                  value={form.command}
                  onChange={(event) =>
                    setForm({ ...form, command: event.target.value })
                  }
                  placeholder="npx -y @company/mcp-server"
                />
                <small>
                  Registration does not authorize execution. Runtime policy and
                  isolation still apply.
                </small>
              </label>
            ) : null}
            <div className="console-form__row">
              <label>
                <span>Visibility</span>
                <select
                  value={form.visibility}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      visibility: event.target.value as typeof form.visibility,
                    })
                  }
                >
                  <option value="private">Private</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="public">Public</option>
                </select>
              </label>
              <label>
                <span>Tags</span>
                <input
                  value={form.tags}
                  onChange={(event) => setForm({ ...form, tags: event.target.value })}
                  placeholder="docs, read-only"
                />
              </label>
            </div>
            <button
              className="console-button console-button--primary"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Registering…" : "Register MCP server"}
            </button>
          </form>
        </section>
      </div>
    </section>
  );
}

function ComposerArea({
  client,
  overview,
  servers,
  compositions,
  onCreated,
  onError,
  activateArea,
}: {
  client: LiteMcpApiClient;
  overview: PlatformOverview | null;
  servers: McpServerDefinition[];
  compositions: Composition[];
  onCreated: (composition: Composition, requestId: string) => void;
  onError: (notice: Notice) => void;
  activateArea: (area: ConsoleArea) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    serverId: "",
    namespace: "",
  });
  const selectedServer = servers.find((server) => server.id === form.serverId) ?? null;

  useEffect(() => {
    if (!form.serverId && servers[0]) {
      setForm((current) => ({
        ...current,
        serverId: servers[0]?.id ?? "",
        namespace: servers[0]?.slug ?? "",
      }));
    }
  }, [form.serverId, servers]);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!overview || !selectedServer) {
      onError({
        tone: "error",
        text: "Load an environment and register at least one MCP server first.",
      });
      return;
    }
    setSubmitting(true);
    const input: CreateCompositionInput = {
      environmentId: overview.environment.id,
      name: form.name.trim(),
      slug: form.slug.trim() || slugify(form.name),
      description: form.description.trim(),
      members: [
        {
          serverId: selectedServer.id,
          namespace: form.namespace.trim() || selectedServer.slug,
          enabled: true,
          pinnedVersion: selectedServer.version,
          priority: 100,
        },
      ],
      aliases: [],
    };
    try {
      const result = await client.createComposition(input);
      onCreated(result.data, result.meta.requestId);
      setForm((current) => ({ ...current, name: "", slug: "", description: "" }));
    } catch (cause) {
      onError(errorNotice(cause, "Could not create the composition."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="console-area">
      <AreaHeading
        eyebrow="Composition plane"
        title="Composer"
        description="Create versioned logical MCP endpoints from pinned, namespaced upstream members."
      />
      {servers.length === 0 ? (
        <EmptyState
          title="Register an upstream first"
          description="A composition must contain at least one real MCP server definition."
          action={
            <button
              className="console-button console-button--primary"
              type="button"
              onClick={() => activateArea("catalog")}
            >
              Open MCP catalog
            </button>
          }
        />
      ) : (
        <div className="console-split console-split--form">
          <section className="console-panel console-panel--table">
            <header className="console-panel__header">
              <div>
                <span>Compositions</span>
                <h2>{compositions.length} logical endpoints</h2>
              </div>
            </header>
            {compositions.length > 0 ? (
              <div className="console-composition-list">
                {compositions.map((composition) => (
                  <article key={composition.id}>
                    <div>
                      <span>{composition.version}</span>
                      <StatusBadge value={composition.status} />
                    </div>
                    <h3>{composition.name}</h3>
                    <p>{composition.description || "No description"}</p>
                    <dl>
                      <div>
                        <dt>Members</dt>
                        <dd>{composition.members.length}</dd>
                      </div>
                      <div>
                        <dt>Aliases</dt>
                        <dd>{composition.aliases.length}</dd>
                      </div>
                      <div>
                        <dt>Environment</dt>
                        <dd>{composition.environmentId}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No compositions yet"
                description="Create a first composition from one registered upstream."
              />
            )}
          </section>
          <section className="console-panel console-panel--sticky">
            <header className="console-panel__header">
              <div>
                <span>Create</span>
                <h2>New composition</h2>
              </div>
            </header>
            <form className="console-form" onSubmit={submit}>
              <label>
                <span>Name</span>
                <input
                  required
                  minLength={2}
                  value={form.name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      name: event.target.value,
                      slug: form.slug || slugify(event.target.value),
                    })
                  }
                  placeholder="Company MCP"
                />
              </label>
              <label>
                <span>Slug</span>
                <input
                  required
                  value={form.slug}
                  onChange={(event) =>
                    setForm({ ...form, slug: slugify(event.target.value) })
                  }
                  placeholder="company-mcp"
                />
              </label>
              <label>
                <span>Description</span>
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="Who this endpoint is for and what it contains"
                />
              </label>
              <label>
                <span>First member</span>
                <select
                  required
                  value={form.serverId}
                  onChange={(event) => {
                    const server = servers.find(
                      (item) => item.id === event.target.value
                    );
                    setForm({
                      ...form,
                      serverId: event.target.value,
                      namespace: server?.slug ?? form.namespace,
                    });
                  }}
                >
                  {servers.map((server) => (
                    <option key={server.id} value={server.id}>
                      {server.name} · {server.version}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Namespace</span>
                <input
                  required
                  value={form.namespace}
                  onChange={(event) =>
                    setForm({ ...form, namespace: slugify(event.target.value) })
                  }
                  placeholder="docs"
                />
                <small>Capabilities are published under this stable namespace.</small>
              </label>
              <div className="console-form__readout">
                <span>Environment</span>
                <strong>{overview?.environment.name ?? "Unavailable"}</strong>
              </div>
              <button
                className="console-button console-button--primary"
                type="submit"
                disabled={submitting}
              >
                {submitting ? "Creating…" : "Create composition"}
              </button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

function IdentityArea({
  client,
  demoMode,
  overview,
  compositions,
  providers,
  onNotice,
}: {
  client: LiteMcpApiClient;
  demoMode: boolean;
  overview: PlatformOverview | null;
  compositions: Composition[];
  providers: IdentityProvider[];
  onNotice: (notice: Notice | null) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [issued, setIssued] = useState<IssuedSession | null>(null);
  const [form, setForm] = useState({
    compositionId: "",
    subjectType: "user" as "user" | "service-principal",
    subjectId: "demo-user",
    roles: "developer",
    groups: "",
    approvedClients: "codex",
    expiresInSeconds: 3600,
  });

  useEffect(() => {
    if (!form.compositionId && compositions[0])
      setForm((current) => ({ ...current, compositionId: compositions[0]?.id ?? "" }));
  }, [compositions, form.compositionId]);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!overview || !form.compositionId) {
      onNotice({
        tone: "error",
        text: "Create a composition and load the environment before issuing a session.",
      });
      return;
    }
    setSubmitting(true);
    setIssued(null);
    const input: CreateSessionInput = {
      compositionId: form.compositionId,
      environmentId: overview.environment.id,
      subject: demoMode
        ? {
            type: form.subjectType,
            id: form.subjectId.trim(),
            roles: splitList(form.roles),
            groups: splitList(form.groups),
            claims: {},
          }
        : {
            type: "user",
            id: "authenticated-user",
            roles: [],
            groups: [],
            claims: {},
          },
      approvedClients: splitList(form.approvedClients),
      expiresInSeconds: form.expiresInSeconds,
    };
    try {
      const result = await client.issueSession(input);
      setIssued(result.data);
      onNotice({
        tone: "success",
        text: "A scoped gateway session was issued. The token is shown once below.",
        requestId: result.meta.requestId,
      });
    } catch (cause) {
      onNotice(errorNotice(cause, "Could not issue the session."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="console-area">
      <AreaHeading
        eyebrow="Identity plane"
        title="Identity & sessions"
        description="Bind the authenticated principal to a composition, environment, client hints, and short-lived credential."
      />
      <div className="console-split">
        <section className="console-panel">
          <header className="console-panel__header">
            <div>
              <span>Session issuer</span>
              <h2>Issue scoped access</h2>
            </div>
          </header>
          {compositions.length === 0 ? (
            <EmptyState
              title="No composition available"
              description="Create a composition before issuing a gateway session."
            />
          ) : (
            <form className="console-form console-form--wide" onSubmit={submit}>
              <label>
                <span>Composition</span>
                <select
                  required
                  value={form.compositionId}
                  onChange={(event) =>
                    setForm({ ...form, compositionId: event.target.value })
                  }
                >
                  {compositions.map((composition) => (
                    <option key={composition.id} value={composition.id}>
                      {composition.name} · {composition.status}
                    </option>
                  ))}
                </select>
              </label>
              {demoMode ? (
                <>
                  <div className="console-form__row">
                    <label>
                      <span>Subject type</span>
                      <select
                        value={form.subjectType}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            subjectType: event.target.value as typeof form.subjectType,
                          })
                        }
                      >
                        <option value="user">User</option>
                        <option value="service-principal">Service principal</option>
                      </select>
                    </label>
                    <label>
                      <span>Subject ID</span>
                      <input
                        required
                        minLength={3}
                        value={form.subjectId}
                        onChange={(event) =>
                          setForm({ ...form, subjectId: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <div className="console-form__row">
                    <label>
                      <span>Roles</span>
                      <input
                        value={form.roles}
                        onChange={(event) =>
                          setForm({ ...form, roles: event.target.value })
                        }
                        placeholder="developer, support"
                      />
                    </label>
                    <label>
                      <span>Groups</span>
                      <input
                        value={form.groups}
                        onChange={(event) =>
                          setForm({ ...form, groups: event.target.value })
                        }
                        placeholder="platform, eu"
                      />
                    </label>
                  </div>
                </>
              ) : (
                <div className="console-form__readout">
                  <span>Session subject</span>
                  <strong>Current authenticated identity</strong>
                  <small>
                    Organization membership supplies trusted tenancy and roles.
                  </small>
                </div>
              )}
              <div className="console-form__row">
                <label>
                  <span>Client hints (metadata only)</span>
                  <input
                    value={form.approvedClients}
                    onChange={(event) =>
                      setForm({ ...form, approvedClients: event.target.value })
                    }
                    placeholder="codex, claude-code"
                  />
                </label>
                <label>
                  <span>Lifetime in seconds</span>
                  <input
                    type="number"
                    min={60}
                    max={86400}
                    value={form.expiresInSeconds}
                    onChange={(event) =>
                      setForm({ ...form, expiresInSeconds: Number(event.target.value) })
                    }
                  />
                </label>
              </div>
              <button
                className="console-button console-button--primary"
                type="submit"
                disabled={submitting}
              >
                {submitting ? "Issuing…" : "Issue gateway session"}
              </button>
            </form>
          )}
        </section>

        <section className="console-panel console-panel--token">
          <header className="console-panel__header">
            <div>
              <span>Credential</span>
              <h2>One-time session result</h2>
            </div>
          </header>
          {issued ? (
            <div className="console-token" aria-live="polite">
              <div className="console-token__warning">
                <strong>Copy this token now.</strong>
                <span>
                  It is sensitive and should not be written to logs or committed to
                  source.
                </span>
              </div>
              <label>
                <span>Endpoint</span>
                <input readOnly value={issued.endpoint} />
              </label>
              <label>
                <span>Bearer token</span>
                <textarea readOnly value={issued.token} />
              </label>
              <dl className="console-definition-list">
                <div>
                  <dt>Session</dt>
                  <dd>{issued.session.id}</dd>
                </div>
                <div>
                  <dt>Expires</dt>
                  <dd>{displayDate(issued.session.expiresAt)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <EmptyState
              title="No token issued in this browser session"
              description="A successful API response will reveal the short-lived token here once."
            />
          )}
        </section>
      </div>

      <section className="console-panel">
        <header className="console-panel__header">
          <div>
            <span>Federation</span>
            <h2>{providers.length} enterprise identity providers</h2>
          </div>
        </header>
        {providers.length > 0 ? (
          <div className="console-table-wrap">
            <table className="console-table">
              <caption className="sr-only">Enterprise identity providers</caption>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Protocol</th>
                  <th>Verified domains</th>
                  <th>Group mappings</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => (
                  <tr key={provider.id}>
                    <td>
                      <strong>{provider.name}</strong>
                      <small>{provider.issuer}</small>
                    </td>
                    <td>
                      <code>{provider.protocol.toUpperCase()}</code>
                    </td>
                    <td>{provider.domains.join(", ")}</td>
                    <td>{provider.groupMappings.length}</td>
                    <td>
                      <StatusBadge value={provider.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No identity providers configured"
            description="OIDC and SAML provider registrations will appear here after an organization owner configures federation."
          />
        )}
      </section>
    </section>
  );
}

function PolicyArea({
  client,
  policies,
  onNotice,
}: {
  client: LiteMcpApiClient;
  policies: Policy[];
  onNotice: (notice: Notice | null) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [decision, setDecision] = useState<PolicyDecision | null>(null);
  const [form, setForm] = useState({
    policyId: "",
    subjectType: "user" as "user" | "service-principal",
    subjectId: "demo-user",
    roles: "developer",
    groups: "",
    action: "execute" as "discover" | "execute",
    toolName: "docs.search",
    risk: "read" as RiskClass,
  });

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setDecision(null);
    const input: PolicySimulationInput = {
      ...(form.policyId ? { policyId: form.policyId } : {}),
      subject: {
        type: form.subjectType,
        id: form.subjectId.trim(),
        roles: splitList(form.roles),
        groups: splitList(form.groups),
        claims: {},
      },
      action: form.action,
      toolName: form.toolName.trim(),
      risk: form.risk,
    };
    try {
      const result = await client.simulatePolicy(input);
      setDecision(result.data);
      onNotice({
        tone: "info",
        text: `Policy simulation returned ${result.data.effect}.`,
        requestId: result.meta.requestId,
      });
    } catch (cause) {
      onNotice(errorNotice(cause, "Could not simulate the policy decision."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="console-area">
      <AreaHeading
        eyebrow="Decision plane"
        title="Policy simulator"
        description="Evaluate a real subject, action, tool, and risk class against the active or selected policy."
      />
      <div className="console-split">
        <section className="console-panel">
          <header className="console-panel__header">
            <div>
              <span>Inputs</span>
              <h2>Simulate a decision</h2>
            </div>
          </header>
          <form className="console-form console-form--wide" onSubmit={submit}>
            <label>
              <span>Policy</span>
              <select
                value={form.policyId}
                onChange={(event) => setForm({ ...form, policyId: event.target.value })}
              >
                <option value="">Active policy</option>
                {policies.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name} · {policy.version}
                  </option>
                ))}
              </select>
            </label>
            <div className="console-form__row">
              <label>
                <span>Subject type</span>
                <select
                  value={form.subjectType}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      subjectType: event.target.value as typeof form.subjectType,
                    })
                  }
                >
                  <option value="user">User</option>
                  <option value="service-principal">Service principal</option>
                </select>
              </label>
              <label>
                <span>Subject ID</span>
                <input
                  required
                  value={form.subjectId}
                  onChange={(event) =>
                    setForm({ ...form, subjectId: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="console-form__row">
              <label>
                <span>Roles</span>
                <input
                  value={form.roles}
                  onChange={(event) => setForm({ ...form, roles: event.target.value })}
                />
              </label>
              <label>
                <span>Groups</span>
                <input
                  value={form.groups}
                  onChange={(event) => setForm({ ...form, groups: event.target.value })}
                />
              </label>
            </div>
            <div className="console-form__row">
              <label>
                <span>Action</span>
                <select
                  value={form.action}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      action: event.target.value as typeof form.action,
                    })
                  }
                >
                  <option value="discover">Discover</option>
                  <option value="execute">Execute</option>
                </select>
              </label>
              <label>
                <span>Risk</span>
                <select
                  value={form.risk}
                  onChange={(event) =>
                    setForm({ ...form, risk: event.target.value as RiskClass })
                  }
                >
                  {riskClasses.map((risk) => (
                    <option key={risk} value={risk}>
                      {risk}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              <span>Namespaced tool name</span>
              <input
                required
                value={form.toolName}
                onChange={(event) => setForm({ ...form, toolName: event.target.value })}
                placeholder="crm.create_contact"
              />
            </label>
            <button
              className="console-button console-button--primary"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Evaluating…" : "Simulate policy"}
            </button>
          </form>
        </section>

        <section className="console-panel console-panel--decision">
          <header className="console-panel__header">
            <div>
              <span>Decision trace</span>
              <h2>Result</h2>
            </div>
            {decision ? <StatusBadge value={decision.effect} /> : null}
          </header>
          {decision ? (
            <div className="console-decision" aria-live="polite">
              <div
                className={`console-decision__effect ${decision.allowed ? "is-allowed" : decision.requiresApproval ? "is-pending" : "is-denied"}`}
              >
                <span>
                  {decision.allowed
                    ? "Allow"
                    : decision.requiresApproval
                      ? "Approval required"
                      : "Deny"}
                </span>
                <strong>{decision.effect}</strong>
              </div>
              <p>{decision.explanation}</p>
              <dl className="console-definition-list">
                <div>
                  <dt>Policy</dt>
                  <dd>{decision.policyId ?? "Active default"}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{decision.policyVersion ?? "—"}</dd>
                </div>
                <div>
                  <dt>Rules</dt>
                  <dd>
                    {decision.matchedRuleIds.length
                      ? decision.matchedRuleIds.join(", ")
                      : "No rule matched"}
                  </dd>
                </div>
                <div>
                  <dt>Execution</dt>
                  <dd>
                    {decision.allowed
                      ? "Permitted"
                      : decision.requiresApproval
                        ? "Paused for approval"
                        : "Blocked"}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <EmptyState
              title="No decision yet"
              description="Submit the simulation form to evaluate the server-side policy engine."
            />
          )}
        </section>
      </div>

      <section className="console-panel">
        <header className="console-panel__header">
          <div>
            <span>Inventory</span>
            <h2>{policies.length} policies</h2>
          </div>
        </header>
        {policies.length > 0 ? (
          <div className="console-table-wrap">
            <table className="console-table">
              <caption className="sr-only">Policies</caption>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Version</th>
                  <th>Default</th>
                  <th>Rules</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => (
                  <tr key={policy.id}>
                    <td>
                      <strong>{policy.name}</strong>
                      <small>{policy.description}</small>
                    </td>
                    <td>{policy.version}</td>
                    <td>{policy.defaultEffect}</td>
                    <td>{policy.rules.length}</td>
                    <td>
                      <StatusBadge value={policy.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No policies returned"
            description="The active default policy can still be simulated when the API provides one."
          />
        )}
      </section>
    </section>
  );
}

function ApprovalsArea({
  approvals,
  events,
  pendingCount,
}: {
  approvals: ApprovalRequest[];
  events: AuditEvent[];
  pendingCount: number;
}) {
  return (
    <section className="console-area">
      <AreaHeading
        eyebrow="Human control"
        title="Approvals"
        description="Sensitive executions paused by policy. Decisions remain bound to the exact request and audit trail."
        actions={<span className="console-count">{pendingCount} pending</span>}
      />
      <section className="console-panel">
        <header className="console-panel__header">
          <div>
            <span>Request-bound queue</span>
            <h2>{approvals.length} approval requests</h2>
          </div>
        </header>
        {approvals.length > 0 ? (
          <div className="console-table-wrap">
            <table className="console-table">
              <caption className="sr-only">Approval requests</caption>
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Requested by</th>
                  <th>Arguments hash</th>
                  <th>Expires</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {approvals.map((approval) => (
                  <tr key={approval.id}>
                    <td>
                      <strong>{approval.toolName}</strong>
                      <small>{approval.compositionId}</small>
                    </td>
                    <td>{approval.requestedBy}</td>
                    <td>
                      <code title={approval.argumentsHash}>
                        {approval.argumentsHash.slice(0, 12)}…
                      </code>
                    </td>
                    <td>{displayDate(approval.expiresAt)}</td>
                    <td>
                      <StatusBadge value={approval.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No approval requests"
            description="No request-bound approvals were returned for this organization."
          />
        )}
      </section>
      <section className="console-panel">
        <header className="console-panel__header">
          <div>
            <span>Queue evidence</span>
            <h2>Approval audit activity</h2>
          </div>
        </header>
        <AuditTable
          events={events}
          emptyDescription="No pending approval events were returned by the current audit query."
        />
      </section>
      <div className="console-inline-note">
        Approval decision mutations are intentionally unavailable until the API exposes
        a dedicated, request-bound approve/deny endpoint. The console does not fake that
        action locally.
      </div>
    </section>
  );
}

function ObservabilityArea({
  overview,
  events,
}: {
  overview: PlatformOverview | null;
  events: AuditEvent[];
}) {
  const outcomes = events.reduce<Record<string, number>>((counts, event) => {
    counts[event.outcome] = (counts[event.outcome] ?? 0) + 1;
    return counts;
  }, {});
  return (
    <section className="console-area">
      <AreaHeading
        eyebrow="Evidence plane"
        title="Observability"
        description="Request-correlated gateway status and append-only audit metadata from the control plane."
        actions={overview ? <StatusBadge value={overview.gateway.status} /> : null}
      />
      <div className="console-observability-strip">
        <div>
          <span>Audit events</span>
          <strong>{events.length}</strong>
        </div>
        <div>
          <span>Succeeded</span>
          <strong>{outcomes.succeeded ?? 0}</strong>
        </div>
        <div>
          <span>Denied</span>
          <strong>{outcomes.denied ?? 0}</strong>
        </div>
        <div>
          <span>Failed</span>
          <strong>{outcomes.failed ?? 0}</strong>
        </div>
        <div>
          <span>Gateway</span>
          <strong>{overview?.gateway.status ?? "unknown"}</strong>
        </div>
      </div>
      <section className="console-panel">
        <header className="console-panel__header">
          <div>
            <span>Audit ledger</span>
            <h2>Recent events</h2>
          </div>
          <span className="console-hash-label">tamper-evident chain</span>
        </header>
        <AuditTable
          events={events}
          emptyDescription="No audit events were returned for this tenant."
          showHash
        />
      </section>
    </section>
  );
}

function SettingsArea({
  overview,
  apiBaseUrl,
  demoMode,
}: {
  overview: PlatformOverview | null;
  apiBaseUrl: string;
  demoMode: boolean;
}) {
  return (
    <section className="console-area">
      <AreaHeading
        eyebrow="Workspace"
        title="Settings"
        description="Current organization, environment, API boundary, and local console identity mode."
      />
      <div className="console-grid console-grid--settings">
        <section className="console-panel">
          <header className="console-panel__header">
            <div>
              <span>Organization</span>
              <h2>{overview?.organization.name ?? "Unavailable"}</h2>
            </div>
          </header>
          <dl className="console-definition-list">
            <div>
              <dt>ID</dt>
              <dd>{overview?.organization.id ?? "—"}</dd>
            </div>
            <div>
              <dt>Slug</dt>
              <dd>{overview?.organization.slug ?? "—"}</dd>
            </div>
            <div>
              <dt>Region</dt>
              <dd>{overview?.organization.region ?? "—"}</dd>
            </div>
            <div>
              <dt>Plan</dt>
              <dd>{overview?.organization.plan ?? "—"}</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>{overview?.organization.revision ?? "—"}</dd>
            </div>
          </dl>
        </section>
        <section className="console-panel">
          <header className="console-panel__header">
            <div>
              <span>Environment</span>
              <h2>{overview?.environment.name ?? "Unavailable"}</h2>
            </div>
          </header>
          <dl className="console-definition-list">
            <div>
              <dt>ID</dt>
              <dd>{overview?.environment.id ?? "—"}</dd>
            </div>
            <div>
              <dt>Kind</dt>
              <dd>{overview?.environment.kind ?? "—"}</dd>
            </div>
            <div>
              <dt>Region</dt>
              <dd>{overview?.environment.region ?? "—"}</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>{overview?.environment.revision ?? "—"}</dd>
            </div>
          </dl>
        </section>
        <section className="console-panel">
          <header className="console-panel__header">
            <div>
              <span>API client</span>
              <h2>Request boundary</h2>
            </div>
          </header>
          <dl className="console-definition-list">
            <div>
              <dt>Origin</dt>
              <dd>
                <code>{apiBaseUrl || "same origin"}</code>
              </dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>/api/v1</dd>
            </div>
            <div>
              <dt>Credentials</dt>
              <dd>Included</dd>
            </div>
            <div>
              <dt>Identity mode</dt>
              <dd>{demoMode ? "Explicit demo headers" : "Authenticated session"}</dd>
            </div>
          </dl>
          {demoMode ? (
            <div className="console-settings-warning">
              <strong>Demo headers active</strong>
              <code>x-litemcp-tenant: org_demo</code>
              <code>x-litemcp-role: finance-admin</code>
            </div>
          ) : null}
        </section>
        <section className="console-panel">
          <header className="console-panel__header">
            <div>
              <span>Portability</span>
              <h2>Deployment contract</h2>
            </div>
          </header>
          <dl className="console-definition-list">
            <div>
              <dt>Web</dt>
              <dd>Astro static output</dd>
            </div>
            <div>
              <dt>Control API</dt>
              <dd>Portable Hono service</dd>
            </div>
            <div>
              <dt>Managed cloud</dt>
              <dd>Cloudflare infrastructure adapter</dd>
            </div>
            <div>
              <dt>Enterprise</dt>
              <dd>Container and Kubernetes</dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}

function AuditTable({
  events,
  emptyDescription,
  showHash = false,
}: {
  events: AuditEvent[];
  emptyDescription: string;
  showHash?: boolean;
}) {
  if (events.length === 0)
    return <EmptyState title="No events" description={emptyDescription} />;
  return (
    <div className="console-table-wrap">
      <table className="console-table console-table--audit">
        <caption className="sr-only">Audit events</caption>
        <thead>
          <tr>
            <th>Sequence</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Target</th>
            <th>Outcome</th>
            <th>Time</th>
            {showHash ? <th>Hash</th> : null}
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>
                <code>#{event.sequence}</code>
              </td>
              <td>
                <strong>{event.actorId}</strong>
                <small>{event.actorType}</small>
              </td>
              <td>
                <strong>{event.action}</strong>
                <small>{event.explanation}</small>
              </td>
              <td>
                <strong>{event.targetType}</strong>
                <small>{event.targetId}</small>
              </td>
              <td>
                <StatusBadge value={event.outcome} />
              </td>
              <td>{displayDate(event.createdAt)}</td>
              {showHash ? (
                <td>
                  <code title={event.hash}>{event.hash.slice(0, 10)}…</code>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
