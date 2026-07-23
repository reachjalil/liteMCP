import type {
  ApprovalDecisionInput,
  ApprovalRequest,
  AuditEvent,
  Composition,
  CreateCompositionInput,
  CreateIdentityProviderInput,
  CreatePolicyInput,
  CreateRoleInput,
  CreateServerInput,
  CreateServicePrincipalInput,
  CreateSessionInput,
  Environment,
  GatewaySession,
  IdentityProvider,
  McpServerDefinition,
  PlatformOverview,
  Policy,
  PolicyDecision,
  PolicyRule,
  PolicySimulationInput,
  RiskClass,
  Role,
  RoleAssignment,
  TenantAuthority,
  Transport,
} from "@litemcp/contracts";
import type { ReactNode, SubmitEvent } from "react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";

import {
  type ActivationEvent,
  ApiClientError,
  type IssuedServicePrincipal,
  type IssuedSession,
  LiteMcpApiClient,
  type PolicyLint,
} from "../../lib/api";
import "../../styles/console.css";

const ObservabilityArea = lazy(() => import("./observability/ObservabilityArea"));

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
  demoModeAvailable?: boolean;
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

const readInitialDemoMode = (defaultDemoMode: boolean, demoModeAvailable: boolean) => {
  if (!demoModeAvailable) return false;
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

const confirmAction = (message: string) =>
  typeof window === "undefined" || window.confirm(message);

const copyText = async (value: string) => {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    throw new Error("Clipboard access is unavailable in this browser.");
  }
  await navigator.clipboard.writeText(value);
};

const downloadJson = (filename: string, value: unknown) => {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], {
    type: "application/json",
  });
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

const sessionSetupSnippets = (issued: IssuedSession) => {
  const authorization = `Bearer ${issued.token}`;
  return [
    {
      id: "cursor",
      label: "Cursor",
      location: "~/.cursor/mcp.json",
      value: JSON.stringify(
        {
          mcpServers: {
            litemcp: {
              url: issued.endpoint,
              headers: { Authorization: authorization },
            },
          },
        },
        null,
        2
      ),
    },
    {
      id: "claude-code",
      label: "Claude Code",
      location: ".mcp.json",
      value: JSON.stringify(
        {
          mcpServers: {
            litemcp: {
              type: "http",
              url: issued.endpoint,
              headers: { Authorization: authorization },
            },
          },
        },
        null,
        2
      ),
    },
    {
      id: "vscode",
      label: "VS Code",
      location: ".vscode/mcp.json",
      value: JSON.stringify(
        {
          servers: {
            litemcp: {
              type: "http",
              url: issued.endpoint,
              headers: { Authorization: authorization },
            },
          },
        },
        null,
        2
      ),
    },
  ];
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
    "valid",
    "ready",
  ].includes(value)
    ? "positive"
    : ["degraded", "pending", "draft", "require-approval"].includes(value)
      ? "warning"
      : [
            "offline",
            "denied",
            "failed",
            "frozen",
            "revoked",
            "expired",
            "disabled",
            "conflicts",
          ].includes(value)
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
  demoModeAvailable = defaultDemoMode,
}: ConsoleAppProps) {
  // Keep the server and first client render identical. URL-derived state is applied
  // after hydration so bookmarked console areas never trigger a hydration mismatch.
  const [area, setArea] = useState<ConsoleArea>("overview");
  const [demoMode, setDemoMode] = useState(defaultDemoMode);
  const [hydrated, setHydrated] = useState(false);
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [servers, setServers] = useState<McpServerDefinition[]>([]);
  const [compositions, setCompositions] = useState<Composition[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [identityProviders, setIdentityProviders] = useState<IdentityProvider[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [sessions, setSessions] = useState<GatewaySession[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);
  const [activationEvents, setActivationEvents] = useState<ActivationEvent[]>([]);
  const [authority, setAuthority] = useState<TenantAuthority | null>(null);
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
      client.getEnvironments(),
      client.getServers(),
      client.getCompositions(),
      client.getPolicies(),
      client.getAuditEvents(),
      client.getIdentityProviders(),
      client.getApprovals(),
      client.getSessions(),
      client.getRoles(),
      client.getRoleAssignments(),
      client.getActivationEvents(),
      client.getAuthority(),
    ]);

    const errors: string[] = [];
    const [
      overviewResult,
      environmentsResult,
      serversResult,
      compositionsResult,
      policiesResult,
      auditResult,
      providersResult,
      approvalsResult,
      sessionsResult,
      rolesResult,
      assignmentsResult,
      activationResult,
      authorityResult,
    ] = results;

    if (overviewResult?.status === "fulfilled") setOverview(overviewResult.value.data);
    else if (overviewResult?.status === "rejected")
      errors.push(errorNotice(overviewResult.reason, "Overview failed.").text);

    if (environmentsResult?.status === "fulfilled")
      setEnvironments(environmentsResult.value.data);
    else if (environmentsResult?.status === "rejected")
      errors.push(errorNotice(environmentsResult.reason, "Environments failed.").text);

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

    if (sessionsResult?.status === "fulfilled") setSessions(sessionsResult.value.data);
    else if (sessionsResult?.status === "rejected")
      errors.push(errorNotice(sessionsResult.reason, "Sessions failed.").text);

    if (rolesResult?.status === "fulfilled") setRoles(rolesResult.value.data);
    else if (rolesResult?.status === "rejected")
      errors.push(errorNotice(rolesResult.reason, "Roles failed.").text);

    if (assignmentsResult?.status === "fulfilled")
      setRoleAssignments(assignmentsResult.value.data);
    else if (assignmentsResult?.status === "rejected")
      errors.push(
        errorNotice(assignmentsResult.reason, "Role assignments failed.").text
      );

    if (activationResult?.status === "fulfilled")
      setActivationEvents(activationResult.value.data);
    else if (activationResult?.status === "rejected")
      errors.push(
        errorNotice(activationResult.reason, "Activation funnel failed.").text
      );

    if (authorityResult?.status === "fulfilled")
      setAuthority(authorityResult.value.data);
    else if (authorityResult?.status === "rejected")
      errors.push(errorNotice(authorityResult.reason, "Authority state failed.").text);

    setLoadState({
      loading: false,
      errors: [...new Set(errors)],
      refreshedAt: new Date(),
    });
  }, [client]);

  useEffect(() => {
    setArea(readInitialArea());
    setDemoMode(readInitialDemoMode(defaultDemoMode, demoModeAvailable));
    setHydrated(true);
  }, [defaultDemoMode, demoModeAvailable]);

  useEffect(() => {
    if (!hydrated) return;
    void refresh();
  }, [hydrated, refresh]);

  useEffect(() => {
    const handleHashChange = () => setArea(readInitialArea());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const toggleDemoMode = () => {
    if (!demoModeAvailable) return;
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
            {demoModeAvailable ? (
              <button type="button" onClick={toggleDemoMode}>
                Exit demo mode
              </button>
            ) : null}
          </div>
        ) : (
          <div className="console-auth-banner" role="note">
            <span>
              Authenticated mode: tenancy and roles must come from the server session.
            </span>
            {demoModeAvailable ? (
              <button type="button" onClick={toggleDemoMode}>
                Use local demo identity
              </button>
            ) : null}
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
              sessions={sessions}
              activationEvents={activationEvents}
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
              onChanged={() => void refresh()}
            />
          ) : null}
          {area === "composer" ? (
            <ComposerArea
              client={client}
              overview={overview}
              environments={environments}
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
              onChanged={() => void refresh()}
              activateArea={activateArea}
            />
          ) : null}
          {area === "identity" ? (
            <IdentityArea
              client={client}
              demoMode={demoMode}
              overview={overview}
              environments={environments}
              compositions={compositions}
              sessions={sessions}
              roles={roles}
              assignments={roleAssignments}
              providers={identityProviders}
              onNotice={setNotice}
              onChanged={() => void refresh()}
            />
          ) : null}
          {area === "policy" ? (
            <PolicyArea
              client={client}
              policies={policies}
              onNotice={setNotice}
              onChanged={() => void refresh()}
            />
          ) : null}
          {area === "approvals" ? (
            <ApprovalsArea
              client={client}
              approvals={approvals}
              events={pendingAudit}
              pendingCount={overview?.counts.pendingApprovals ?? 0}
              onNotice={setNotice}
              onChanged={() => void refresh()}
            />
          ) : null}
          {area === "observability" ? (
            <Suspense
              fallback={
                <div className="analytics-view-state" role="status">
                  Loading usage observability…
                </div>
              }
            >
              <ObservabilityArea
                client={client}
                gatewayStatus={overview?.gateway.status ?? "unknown"}
                auditEvents={auditEvents}
              />
            </Suspense>
          ) : null}
          {area === "settings" ? (
            <SettingsArea
              client={client}
              overview={overview}
              environments={environments}
              apiBaseUrl={apiBaseUrl}
              demoMode={demoMode}
              authority={authority}
              onAuthority={setAuthority}
              onNotice={setNotice}
              onChanged={() => void refresh()}
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
  sessions,
  activationEvents,
  auditEvents,
  loading,
  activateArea,
}: {
  overview: PlatformOverview | null;
  servers: McpServerDefinition[];
  compositions: Composition[];
  sessions: GatewaySession[];
  activationEvents: ActivationEvent[];
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
  const reached = new Set(activationEvents.map((event) => event.name));
  const onboardingSteps = [
    {
      label: "Register an MCP server",
      detail: servers.length ? `${servers.length} registered` : "Add a real upstream",
      done: reached.has("server_registered") || servers.length > 0,
      target: "catalog" as const,
    },
    {
      label: "Probe and import tools",
      detail: "Discover capability schemas from the upstream",
      done:
        reached.has("server_probed") ||
        servers.some(
          (server) => server.status !== "unprobed" && server.tools.length > 0
        ),
      target: "catalog" as const,
    },
    {
      label: "Publish a composition",
      detail: "Create a stable, namespaced endpoint",
      done:
        reached.has("composition_published") ||
        compositions.some((composition) => composition.status === "published"),
      target: "composer" as const,
    },
    {
      label: "Issue scoped access",
      detail: "Mint a short-lived token for your client",
      done: reached.has("session_issued") || sessions.length > 0,
      target: "identity" as const,
    },
    {
      label: "Make the first tool call",
      detail: "Validate the endpoint from Cursor, Claude Code, or VS Code",
      done: reached.has("first_tool_call"),
      target: "identity" as const,
    },
  ];
  const completedSteps = onboardingSteps.filter((step) => step.done).length;

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
              <h2>{completedSteps}/5 steps complete</h2>
            </div>
            <span className="console-count">
              {Math.round((completedSteps / onboardingSteps.length) * 100)}%
            </span>
          </header>
          <ol className="console-onboarding" aria-label="First-run setup progress">
            {onboardingSteps.map((step, index) => (
              <li
                key={step.label}
                className={step.done ? "is-done" : undefined}
                aria-current={
                  !step.done && index === completedSteps ? "step" : undefined
                }
              >
                <span>{step.done ? "✓" : index + 1}</span>
                <div>
                  <strong>{step.label}</strong>
                  <small>{step.detail}</small>
                </div>
                <button type="button" onClick={() => activateArea(step.target)}>
                  {step.done ? "Review" : "Start"}
                </button>
              </li>
            ))}
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
  onChanged,
}: {
  client: LiteMcpApiClient;
  servers: McpServerDefinition[];
  onCreated: (server: McpServerDefinition, requestId: string) => void;
  onError: (notice: Notice) => void;
  onChanged: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingServer, setEditingServer] = useState<McpServerDefinition | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    endpoint: "",
    command: "",
    version: "",
    visibility: "private" as "public" | "private" | "unlisted",
    tags: "",
  });
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

  const beginEdit = (server: McpServerDefinition) => {
    setEditingServer(server);
    setEditForm({
      name: server.name,
      description: server.description,
      endpoint: server.endpoint ?? "",
      command: server.command?.join(" ") ?? "",
      version: server.version,
      visibility: server.visibility,
      tags: server.tags.join(", "),
    });
  };

  const saveEdit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingServer) return;
    setBusyId(editingServer.id);
    try {
      const result = await client.updateServer(editingServer.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        version: editForm.version.trim(),
        visibility: editForm.visibility,
        tags: splitList(editForm.tags),
        ...(editingServer.transport === "stdio"
          ? { command: splitCommand(editForm.command) }
          : editingServer.transport === "streamable-http" ||
              editingServer.transport === "legacy-sse"
            ? { endpoint: editForm.endpoint.trim() }
            : {}),
      });
      setEditingServer(null);
      onError({
        tone: "success",
        text: `${result.data.name} was updated. Probe again to verify its capabilities.`,
        requestId: result.meta.requestId,
      });
      onChanged();
    } catch (cause) {
      onError(errorNotice(cause, "Could not update the MCP server."));
    } finally {
      setBusyId(null);
    }
  };

  const probe = async (server: McpServerDefinition) => {
    const acceptDrift =
      server.driftStatus === "drifted" &&
      confirmAction(
        `Accept the newly discovered tool schema for ${server.name}? This clears the drift quarantine.`
      );
    if (server.driftStatus === "drifted" && !acceptDrift) return;
    setBusyId(server.id);
    try {
      const result = await client.probeServer(server.id, acceptDrift);
      onError({
        tone: result.data.status === "healthy" ? "success" : "info",
        text:
          result.data.status === "healthy"
            ? `Imported ${result.data.tools.length} tools from ${result.data.name}.`
            : (result.data.lastProbeError ?? `${result.data.name} probe completed.`),
        requestId: result.meta.requestId,
      });
      onChanged();
    } catch (cause) {
      onError(errorNotice(cause, "Could not probe the MCP server."));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (server: McpServerDefinition) => {
    if (
      !confirmAction(
        `Delete ${server.name}? Remove it from every composition first. This cannot be undone.`
      )
    )
      return;
    setBusyId(server.id);
    try {
      const result = await client.deleteServer(server.id);
      if (editingServer?.id === server.id) setEditingServer(null);
      onError({
        tone: "success",
        text: `${server.name} was deleted.`,
        requestId: result.meta.requestId,
      });
      onChanged();
    } catch (cause) {
      onError(errorNotice(cause, "Could not delete the MCP server."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="console-area">
      <AreaHeading
        eyebrow="Registry"
        title="MCP catalog"
        description="Register concrete upstream definitions and inspect their current health and capability inventory."
      />
      {editingServer ? (
        <section
          className="console-panel console-editor"
          aria-labelledby="server-editor-title"
        >
          <header className="console-panel__header">
            <div>
              <span>Edit server</span>
              <h2 id="server-editor-title">{editingServer.name}</h2>
            </div>
            <button type="button" onClick={() => setEditingServer(null)}>
              Cancel
            </button>
          </header>
          <form className="console-form console-form--wide" onSubmit={saveEdit}>
            <div className="console-form__row">
              <label>
                <span>Name</span>
                <input
                  required
                  minLength={2}
                  value={editForm.name}
                  onChange={(event) =>
                    setEditForm({ ...editForm, name: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Version</span>
                <input
                  required
                  value={editForm.version}
                  onChange={(event) =>
                    setEditForm({ ...editForm, version: event.target.value })
                  }
                />
              </label>
            </div>
            <label>
              <span>Description</span>
              <textarea
                value={editForm.description}
                onChange={(event) =>
                  setEditForm({ ...editForm, description: event.target.value })
                }
              />
            </label>
            {editingServer.transport === "stdio" ? (
              <label>
                <span>Command</span>
                <input
                  required
                  value={editForm.command}
                  onChange={(event) =>
                    setEditForm({ ...editForm, command: event.target.value })
                  }
                />
              </label>
            ) : editingServer.transport === "streamable-http" ||
              editingServer.transport === "legacy-sse" ? (
              <label>
                <span>Endpoint URL</span>
                <input
                  required
                  type="url"
                  value={editForm.endpoint}
                  onChange={(event) =>
                    setEditForm({ ...editForm, endpoint: event.target.value })
                  }
                />
              </label>
            ) : null}
            <div className="console-form__row">
              <label>
                <span>Visibility</span>
                <select
                  value={editForm.visibility}
                  onChange={(event) =>
                    setEditForm({
                      ...editForm,
                      visibility: event.target.value as typeof editForm.visibility,
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
                  value={editForm.tags}
                  onChange={(event) =>
                    setEditForm({ ...editForm, tags: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="console-action-row">
              <button
                className="console-button console-button--primary"
                type="submit"
                disabled={busyId === editingServer.id}
              >
                {busyId === editingServer.id ? "Saving…" : "Save server"}
              </button>
              <button
                className="console-button console-button--quiet"
                type="button"
                onClick={() => setEditingServer(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}
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
                    <th>Actions</th>
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
                      <td>
                        <div className="console-row-actions">
                          <button
                            type="button"
                            onClick={() => void probe(server)}
                            disabled={busyId === server.id}
                          >
                            {busyId === server.id ? "Working…" : "Probe + import"}
                          </button>
                          <button type="button" onClick={() => beginEdit(server)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="is-danger"
                            onClick={() => void remove(server)}
                            disabled={busyId === server.id}
                          >
                            Delete
                          </button>
                        </div>
                        {server.lastProbeError ? (
                          <small title={server.lastProbeError}>
                            Probe: {server.lastProbeError}
                          </small>
                        ) : server.lastProbedAt ? (
                          <small>Probed {displayDate(server.lastProbedAt)}</small>
                        ) : null}
                      </td>
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
  environments,
  servers,
  compositions,
  onCreated,
  onError,
  onChanged,
  activateArea,
}: {
  client: LiteMcpApiClient;
  overview: PlatformOverview | null;
  environments: Environment[];
  servers: McpServerDefinition[];
  compositions: Composition[];
  onCreated: (composition: Composition, requestId: string) => void;
  onError: (notice: Notice) => void;
  onChanged: () => void;
  activateArea: (area: ConsoleArea) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingComposition, setEditingComposition] = useState<Composition | null>(
    null
  );
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    members: [] as Array<{
      serverId: string;
      selected: boolean;
      namespace: string;
      priority: number;
    }>,
  });
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    environmentId: "",
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

  useEffect(() => {
    if (!form.environmentId && (environments[0] || overview?.environment)) {
      setForm((current) => ({
        ...current,
        environmentId: environments[0]?.id ?? overview?.environment.id ?? "",
      }));
    }
  }, [environments, form.environmentId, overview]);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.environmentId || !selectedServer) {
      onError({
        tone: "error",
        text: "Load an environment and register at least one MCP server first.",
      });
      return;
    }
    setSubmitting(true);
    const input: CreateCompositionInput = {
      environmentId: form.environmentId,
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

  const beginEdit = (composition: Composition) => {
    const currentByServer = new Map(
      composition.members.map((member) => [member.serverId, member])
    );
    setEditingComposition(composition);
    setEditForm({
      name: composition.name,
      description: composition.description,
      members: servers.map((server) => {
        const current = currentByServer.get(server.id);
        return {
          serverId: server.id,
          selected: Boolean(current),
          namespace: current?.namespace ?? server.slug,
          priority: current?.priority ?? 100,
        };
      }),
    });
  };

  const saveEdit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingComposition) return;
    const members = editForm.members
      .filter((member) => member.selected)
      .flatMap((member) => {
        const server = servers.find((candidate) => candidate.id === member.serverId);
        if (!server) return [];
        const current = editingComposition.members.find(
          (candidate) => candidate.serverId === member.serverId
        );
        return [
          {
            serverId: member.serverId,
            namespace: slugify(member.namespace) || server.slug,
            enabled: current?.enabled ?? true,
            pinnedVersion: server.version,
            priority: member.priority,
          },
        ];
      });
    if (members.length === 0) {
      onError({ tone: "error", text: "Select at least one composition member." });
      return;
    }
    setBusyId(editingComposition.id);
    try {
      const result = await client.updateComposition(editingComposition.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        members,
      });
      setEditingComposition(null);
      onError({
        tone: "success",
        text: `${result.data.name} was saved as a draft. Publish it to expose the change.`,
        requestId: result.meta.requestId,
      });
      onChanged();
    } catch (cause) {
      onError(errorNotice(cause, "Could not update the composition."));
    } finally {
      setBusyId(null);
    }
  };

  const publish = async (composition: Composition) => {
    setBusyId(composition.id);
    try {
      const result = await client.publishComposition(composition.id);
      onError({
        tone: "success",
        text: `${result.data.name} ${result.data.version} is published.`,
        requestId: result.meta.requestId,
      });
      onChanged();
    } catch (cause) {
      onError(errorNotice(cause, "Could not publish the composition."));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (composition: Composition) => {
    if (
      !confirmAction(
        `Delete ${composition.name}? Active sessions must be revoked first. This cannot be undone.`
      )
    )
      return;
    setBusyId(composition.id);
    try {
      const result = await client.deleteComposition(composition.id);
      if (editingComposition?.id === composition.id) setEditingComposition(null);
      onError({
        tone: "success",
        text: `${composition.name} was deleted.`,
        requestId: result.meta.requestId,
      });
      onChanged();
    } catch (cause) {
      onError(errorNotice(cause, "Could not delete the composition."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="console-area">
      <AreaHeading
        eyebrow="Composition plane"
        title="Composer"
        description="Create versioned logical MCP endpoints from pinned, namespaced upstream members."
      />
      {editingComposition ? (
        <section
          className="console-panel console-editor"
          aria-labelledby="composition-editor-title"
        >
          <header className="console-panel__header">
            <div>
              <span>Edit composition</span>
              <h2 id="composition-editor-title">{editingComposition.name}</h2>
            </div>
            <button type="button" onClick={() => setEditingComposition(null)}>
              Cancel
            </button>
          </header>
          <form className="console-form" onSubmit={saveEdit}>
            <div className="console-form__row">
              <label>
                <span>Name</span>
                <input
                  required
                  minLength={2}
                  value={editForm.name}
                  onChange={(event) =>
                    setEditForm({ ...editForm, name: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Description</span>
                <input
                  value={editForm.description}
                  onChange={(event) =>
                    setEditForm({ ...editForm, description: event.target.value })
                  }
                />
              </label>
            </div>
            <fieldset className="console-fieldset">
              <legend>Members</legend>
              <div className="console-member-editor">
                {editForm.members.map((member, index) => {
                  const server = servers.find(
                    (candidate) => candidate.id === member.serverId
                  );
                  if (!server) return null;
                  return (
                    <div key={member.serverId}>
                      <label className="console-check">
                        <input
                          type="checkbox"
                          checked={member.selected}
                          onChange={(event) => {
                            const members = [...editForm.members];
                            members[index] = {
                              ...member,
                              selected: event.target.checked,
                            };
                            setEditForm({ ...editForm, members });
                          }}
                        />
                        <span>
                          <strong>{server.name}</strong>
                          <small>{server.version}</small>
                        </span>
                      </label>
                      <label>
                        <span>Namespace</span>
                        <input
                          required={member.selected}
                          disabled={!member.selected}
                          value={member.namespace}
                          onChange={(event) => {
                            const members = [...editForm.members];
                            members[index] = {
                              ...member,
                              namespace: event.target.value,
                            };
                            setEditForm({ ...editForm, members });
                          }}
                        />
                      </label>
                      <label>
                        <span>Priority</span>
                        <input
                          type="number"
                          min={0}
                          max={10000}
                          disabled={!member.selected}
                          value={member.priority}
                          onChange={(event) => {
                            const members = [...editForm.members];
                            members[index] = {
                              ...member,
                              priority: Number(event.target.value),
                            };
                            setEditForm({ ...editForm, members });
                          }}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            </fieldset>
            <div className="console-action-row">
              <button
                className="console-button console-button--primary"
                type="submit"
                disabled={busyId === editingComposition.id}
              >
                {busyId === editingComposition.id ? "Saving…" : "Save draft"}
              </button>
              <button
                className="console-button console-button--quiet"
                type="button"
                onClick={() => setEditingComposition(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}
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
                    <div className="console-card-actions">
                      <button
                        type="button"
                        onClick={() => beginEdit(composition)}
                        disabled={busyId === composition.id}
                      >
                        Edit members
                      </button>
                      {composition.status === "draft" ? (
                        <button
                          type="button"
                          onClick={() => void publish(composition)}
                          disabled={busyId === composition.id}
                        >
                          Publish
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="is-danger"
                        onClick={() => void remove(composition)}
                        disabled={busyId === composition.id}
                      >
                        Delete
                      </button>
                    </div>
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
                <span>Environment</span>
                <select
                  required
                  value={form.environmentId}
                  onChange={(event) =>
                    setForm({ ...form, environmentId: event.target.value })
                  }
                >
                  {environments.length > 0 ? (
                    environments.map((environment) => (
                      <option key={environment.id} value={environment.id}>
                        {environment.name} · {environment.kind}
                      </option>
                    ))
                  ) : overview ? (
                    <option value={overview.environment.id}>
                      {overview.environment.name} · {overview.environment.kind}
                    </option>
                  ) : null}
                </select>
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
                <strong>
                  {environments.find(
                    (environment) => environment.id === form.environmentId
                  )?.name ??
                    overview?.environment.name ??
                    "Unavailable"}
                </strong>
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
  environments,
  compositions,
  sessions,
  roles,
  assignments,
  providers,
  onNotice,
  onChanged,
}: {
  client: LiteMcpApiClient;
  demoMode: boolean;
  overview: PlatformOverview | null;
  environments: Environment[];
  compositions: Composition[];
  sessions: GatewaySession[];
  roles: Role[];
  assignments: RoleAssignment[];
  providers: IdentityProvider[];
  onNotice: (notice: Notice | null) => void;
  onChanged: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedSession | null>(null);
  const [snippetId, setSnippetId] = useState("cursor");
  const [issuedPrincipal, setIssuedPrincipal] = useState<IssuedServicePrincipal | null>(
    null
  );
  const [form, setForm] = useState({
    compositionId: "",
    environmentId: "",
    subjectType: "user" as "user" | "service-principal",
    subjectId: "demo-user",
    roles: "employee",
    groups: "",
    approvedClients: "codex",
    expiresInSeconds: 3600,
  });
  const [roleForm, setRoleForm] = useState({
    id: "",
    name: "",
    slug: "",
    description: "",
  });
  const [assignmentForm, setAssignmentForm] = useState({
    subjectId: "",
    roleId: "",
  });
  const [providerForm, setProviderForm] = useState({
    id: "",
    name: "",
    protocol: "oidc" as "oidc" | "saml",
    issuer: "",
    domains: "",
    clientId: "",
    clientSecret: "",
    status: "draft" as "draft" | "active" | "disabled",
    groupMappings: "[]",
  });
  const [principalForm, setPrincipalForm] = useState({ name: "", roles: "" });

  useEffect(() => {
    if (!form.compositionId && compositions[0])
      setForm((current) => ({ ...current, compositionId: compositions[0]?.id ?? "" }));
  }, [compositions, form.compositionId]);

  useEffect(() => {
    if (!form.environmentId && (environments[0] || overview?.environment)) {
      setForm((current) => ({
        ...current,
        environmentId: environments[0]?.id ?? overview?.environment.id ?? "",
      }));
    }
  }, [environments, form.environmentId, overview]);

  useEffect(() => {
    if (!assignmentForm.roleId && roles[0]) {
      setAssignmentForm((current) => ({
        ...current,
        roleId: roles[0]?.id ?? "",
      }));
    }
  }, [assignmentForm.roleId, roles]);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.environmentId || !form.compositionId) {
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
      environmentId: form.environmentId,
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
      setSnippetId("cursor");
      onNotice({
        tone: "success",
        text: "A scoped gateway session was issued. The token is shown once below.",
        requestId: result.meta.requestId,
      });
      onChanged();
    } catch (cause) {
      onNotice(errorNotice(cause, "Could not issue the session."));
    } finally {
      setSubmitting(false);
    }
  };

  const revokeSession = async (session: GatewaySession) => {
    if (!confirmAction(`Revoke session ${session.id}? Its token will stop working.`))
      return;
    setBusyId(session.id);
    try {
      const result = await client.revokeSession(session.id);
      onNotice({
        tone: "success",
        text: `Session ${session.id} was revoked.`,
        requestId: result.meta.requestId,
      });
      onChanged();
    } catch (cause) {
      onNotice(errorNotice(cause, "Could not revoke the session."));
    } finally {
      setBusyId(null);
    }
  };

  const saveRole = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyId(roleForm.id || "new-role");
    try {
      const input: CreateRoleInput = {
        name: roleForm.name.trim(),
        slug: roleForm.slug.trim() || slugify(roleForm.name),
        description: roleForm.description.trim(),
      };
      const result = roleForm.id
        ? await client.updateRole(roleForm.id, {
            name: input.name,
            description: input.description,
          })
        : await client.createRole(input);
      setRoleForm({ id: "", name: "", slug: "", description: "" });
      onNotice({
        tone: "success",
        text: `${result.data.name} was ${roleForm.id ? "updated" : "created"}.`,
        requestId: result.meta.requestId,
      });
      onChanged();
    } catch (cause) {
      onNotice(errorNotice(cause, "Could not save the role."));
    } finally {
      setBusyId(null);
    }
  };

  const deleteRole = async (role: Role) => {
    if (!confirmAction(`Delete role ${role.name}? Remove its assignments first.`))
      return;
    setBusyId(role.id);
    try {
      const result = await client.deleteRole(role.id);
      onNotice({
        tone: "success",
        text: `${role.name} was deleted.`,
        requestId: result.meta.requestId,
      });
      onChanged();
    } catch (cause) {
      onNotice(errorNotice(cause, "Could not delete the role."));
    } finally {
      setBusyId(null);
    }
  };

  const assignRole = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyId("new-assignment");
    try {
      const result = await client.assignRole({
        subjectId: assignmentForm.subjectId.trim(),
        roleId: assignmentForm.roleId,
      });
      setAssignmentForm((current) => ({ ...current, subjectId: "" }));
      onNotice({
        tone: "success",
        text: "Role assignment created; existing scoped credentials were invalidated.",
        requestId: result.meta.requestId,
      });
      onChanged();
    } catch (cause) {
      onNotice(errorNotice(cause, "Could not assign the role."));
    } finally {
      setBusyId(null);
    }
  };

  const removeAssignment = async (assignment: RoleAssignment) => {
    if (!confirmAction(`Remove this role assignment from ${assignment.subjectId}?`))
      return;
    setBusyId(assignment.id);
    try {
      const result = await client.removeRoleAssignment(assignment.id);
      onNotice({
        tone: "success",
        text: "Role assignment removed; existing scoped credentials were invalidated.",
        requestId: result.meta.requestId,
      });
      onChanged();
    } catch (cause) {
      onNotice(errorNotice(cause, "Could not remove the role assignment."));
    } finally {
      setBusyId(null);
    }
  };

  const editProvider = (provider: IdentityProvider) => {
    setProviderForm({
      id: provider.id,
      name: provider.name,
      protocol: provider.protocol,
      issuer: provider.issuer,
      domains: provider.domains.join(", "),
      clientId: provider.clientId,
      clientSecret: "",
      status: provider.status,
      groupMappings: JSON.stringify(provider.groupMappings, null, 2),
    });
  };

  const saveProvider = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    let groupMappings: CreateIdentityProviderInput["groupMappings"];
    try {
      const parsed = JSON.parse(providerForm.groupMappings) as unknown;
      if (!Array.isArray(parsed)) throw new Error("Mappings must be a JSON array.");
      groupMappings = parsed as CreateIdentityProviderInput["groupMappings"];
    } catch (cause) {
      onNotice({
        tone: "error",
        text:
          cause instanceof Error ? cause.message : "Group mappings are invalid JSON.",
      });
      return;
    }
    setBusyId(providerForm.id || "new-provider");
    const input = {
      name: providerForm.name.trim(),
      protocol: providerForm.protocol,
      issuer: providerForm.issuer.trim(),
      domains: splitList(providerForm.domains),
      clientId: providerForm.clientId.trim(),
      status: providerForm.status,
      groupMappings,
      ...(providerForm.clientSecret ? { clientSecret: providerForm.clientSecret } : {}),
    };
    try {
      const result = providerForm.id
        ? await client.updateIdentityProvider(providerForm.id, input)
        : await client.createIdentityProvider({
            ...input,
            clientSecret: providerForm.clientSecret,
          });
      setProviderForm({
        id: "",
        name: "",
        protocol: "oidc",
        issuer: "",
        domains: "",
        clientId: "",
        clientSecret: "",
        status: "draft",
        groupMappings: "[]",
      });
      onNotice({
        tone: "success",
        text: `${result.data.name} was saved; its client secret is encrypted at rest.`,
        requestId: result.meta.requestId,
      });
      onChanged();
    } catch (cause) {
      onNotice(errorNotice(cause, "Could not save the identity provider."));
    } finally {
      setBusyId(null);
    }
  };

  const deleteProvider = async (provider: IdentityProvider) => {
    if (!confirmAction(`Delete identity provider ${provider.name}?`)) return;
    setBusyId(provider.id);
    try {
      const result = await client.deleteIdentityProvider(provider.id);
      if (providerForm.id === provider.id) {
        setProviderForm((current) => ({ ...current, id: "", name: "" }));
      }
      onNotice({
        tone: "success",
        text: `${provider.name} was deleted; scoped credentials were invalidated.`,
        requestId: result.meta.requestId,
      });
      onChanged();
    } catch (cause) {
      onNotice(errorNotice(cause, "Could not delete the identity provider."));
    } finally {
      setBusyId(null);
    }
  };

  const issuePrincipal = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyId("new-principal");
    setIssuedPrincipal(null);
    const input: CreateServicePrincipalInput = {
      name: principalForm.name.trim(),
      roles: splitList(principalForm.roles),
    };
    try {
      const result = await client.createServicePrincipal(input);
      setIssuedPrincipal(result.data);
      setPrincipalForm({ name: "", roles: "" });
      onNotice({
        tone: "success",
        text: "Service principal created. Copy its secret now; it is shown once.",
        requestId: result.meta.requestId,
      });
    } catch (cause) {
      onNotice(errorNotice(cause, "Could not create the service principal."));
    } finally {
      setBusyId(null);
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
              <label>
                <span>Environment</span>
                <select
                  required
                  value={form.environmentId}
                  onChange={(event) =>
                    setForm({ ...form, environmentId: event.target.value })
                  }
                >
                  {environments.length > 0 ? (
                    environments.map((environment) => (
                      <option key={environment.id} value={environment.id}>
                        {environment.name} · {environment.kind}
                      </option>
                    ))
                  ) : overview ? (
                    <option value={overview.environment.id}>
                      {overview.environment.name} · {overview.environment.kind}
                    </option>
                  ) : null}
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
              <div className="console-action-row">
                <button
                  className="console-button"
                  type="button"
                  onClick={() =>
                    void copyText(issued.token)
                      .then(() =>
                        onNotice({ tone: "info", text: "Bearer token copied." })
                      )
                      .catch((cause) =>
                        onNotice(errorNotice(cause, "Could not copy the token."))
                      )
                  }
                >
                  Copy token
                </button>
                <button
                  className="console-button console-button--quiet"
                  type="button"
                  onClick={() => setIssued(null)}
                >
                  Hide credential
                </button>
              </div>
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
              <div className="console-snippets">
                <div className="console-tabs" role="tablist" aria-label="Client setup">
                  {sessionSetupSnippets(issued).map((snippet) => (
                    <button
                      key={snippet.id}
                      id={`snippet-tab-${snippet.id}`}
                      type="button"
                      role="tab"
                      aria-selected={snippetId === snippet.id}
                      aria-controls={`snippet-panel-${snippet.id}`}
                      className={snippetId === snippet.id ? "is-active" : undefined}
                      onClick={() => setSnippetId(snippet.id)}
                    >
                      {snippet.label}
                    </button>
                  ))}
                </div>
                {sessionSetupSnippets(issued)
                  .filter((snippet) => snippet.id === snippetId)
                  .map((snippet) => (
                    <div
                      key={snippet.id}
                      id={`snippet-panel-${snippet.id}`}
                      role="tabpanel"
                      aria-labelledby={`snippet-tab-${snippet.id}`}
                    >
                      <div className="console-snippets__heading">
                        <span>{snippet.location}</span>
                        <button
                          type="button"
                          onClick={() =>
                            void copyText(snippet.value)
                              .then(() =>
                                onNotice({
                                  tone: "info",
                                  text: `${snippet.label} setup copied.`,
                                })
                              )
                              .catch((cause) =>
                                onNotice(
                                  errorNotice(
                                    cause,
                                    "Could not copy the setup snippet."
                                  )
                                )
                              )
                          }
                        >
                          Copy config
                        </button>
                      </div>
                      <pre>{snippet.value}</pre>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title="No token issued in this browser session"
              description="A successful API response will reveal the short-lived token here once."
            />
          )}
        </section>
      </div>

      <section className="console-panel console-panel--table">
        <header className="console-panel__header">
          <div>
            <span>Session inventory</span>
            <h2>{sessions.length} scoped sessions</h2>
          </div>
        </header>
        {sessions.length > 0 ? (
          <div className="console-table-wrap">
            <table className="console-table">
              <caption className="sr-only">Scoped gateway sessions</caption>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Composition</th>
                  <th>Clients</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => {
                  const expired = new Date(session.expiresAt).getTime() <= Date.now();
                  const status = session.revokedAt
                    ? "revoked"
                    : expired
                      ? "expired"
                      : "active";
                  return (
                    <tr key={session.id}>
                      <td>
                        <strong>{session.subject.id}</strong>
                        <small>{session.subject.type}</small>
                      </td>
                      <td>
                        <code>{session.compositionId}</code>
                        <small>{session.environmentId}</small>
                      </td>
                      <td>{session.approvedClients.join(", ") || "—"}</td>
                      <td>{displayDate(session.expiresAt)}</td>
                      <td>
                        <StatusBadge value={status} />
                      </td>
                      <td>
                        {!session.revokedAt && !expired ? (
                          <div className="console-row-actions">
                            <button
                              type="button"
                              className="is-danger"
                              onClick={() => void revokeSession(session)}
                              disabled={busyId === session.id}
                            >
                              {busyId === session.id ? "Revoking…" : "Revoke"}
                            </button>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No sessions yet"
            description="Issue a short-lived credential above to connect an MCP client."
          />
        )}
      </section>

      <div className="console-split console-split--form">
        <section className="console-panel console-panel--table">
          <header className="console-panel__header">
            <div>
              <span>Platform RBAC</span>
              <h2>{roles.length} roles</h2>
            </div>
          </header>
          {roles.length > 0 ? (
            <div className="console-table-wrap">
              <table className="console-table">
                <caption className="sr-only">Platform roles</caption>
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Type</th>
                    <th>Assignments</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role.id}>
                      <td>
                        <strong>{role.name}</strong>
                        <small>
                          {role.slug} · {role.description}
                        </small>
                      </td>
                      <td>{role.builtin ? "Built in" : "Custom"}</td>
                      <td>
                        {
                          assignments.filter(
                            (assignment) => assignment.roleId === role.id
                          ).length
                        }
                      </td>
                      <td>
                        <div className="console-row-actions">
                          {!role.builtin ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setRoleForm({
                                    id: role.id,
                                    name: role.name,
                                    slug: role.slug,
                                    description: role.description,
                                  })
                                }
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="is-danger"
                                disabled={busyId === role.id}
                                onClick={() => void deleteRole(role)}
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <span>Protected</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No roles returned"
              description="Bootstrap the organization before assigning access."
            />
          )}

          <header className="console-panel__header console-panel__subheader">
            <div>
              <span>Assignments</span>
              <h2>{assignments.length} subject bindings</h2>
            </div>
          </header>
          {assignments.length > 0 ? (
            <div className="console-table-wrap">
              <table className="console-table">
                <caption className="sr-only">Role assignments</caption>
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Role</th>
                    <th>Created</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((assignment) => (
                    <tr key={assignment.id}>
                      <td>
                        <strong>{assignment.subjectId}</strong>
                      </td>
                      <td>
                        {roles.find((role) => role.id === assignment.roleId)?.name ??
                          assignment.roleId}
                      </td>
                      <td>{displayDate(assignment.createdAt)}</td>
                      <td>
                        <div className="console-row-actions">
                          <button
                            type="button"
                            className="is-danger"
                            disabled={busyId === assignment.id}
                            onClick={() => void removeAssignment(assignment)}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="console-panel console-panel--sticky">
          <header className="console-panel__header">
            <div>
              <span>{roleForm.id ? "Edit" : "Create"}</span>
              <h2>{roleForm.id ? "Update role" : "Custom role"}</h2>
            </div>
            {roleForm.id ? (
              <button
                type="button"
                onClick={() =>
                  setRoleForm({ id: "", name: "", slug: "", description: "" })
                }
              >
                Cancel
              </button>
            ) : null}
          </header>
          <form className="console-form" onSubmit={saveRole}>
            <label>
              <span>Name</span>
              <input
                required
                minLength={2}
                value={roleForm.name}
                onChange={(event) =>
                  setRoleForm({
                    ...roleForm,
                    name: event.target.value,
                    slug: roleForm.slug || slugify(event.target.value),
                  })
                }
              />
            </label>
            <label>
              <span>Slug</span>
              <input
                required
                disabled={Boolean(roleForm.id)}
                value={roleForm.slug}
                onChange={(event) =>
                  setRoleForm({ ...roleForm, slug: slugify(event.target.value) })
                }
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                value={roleForm.description}
                onChange={(event) =>
                  setRoleForm({ ...roleForm, description: event.target.value })
                }
              />
            </label>
            <button
              className="console-button console-button--primary"
              type="submit"
              disabled={busyId === (roleForm.id || "new-role")}
            >
              {roleForm.id ? "Save role" : "Create role"}
            </button>
          </form>
          <header className="console-panel__header console-panel__subheader">
            <div>
              <span>Bind access</span>
              <h2>Assign role</h2>
            </div>
          </header>
          <form className="console-form" onSubmit={assignRole}>
            <label>
              <span>Subject ID</span>
              <input
                required
                minLength={3}
                value={assignmentForm.subjectId}
                onChange={(event) =>
                  setAssignmentForm({
                    ...assignmentForm,
                    subjectId: event.target.value,
                  })
                }
                placeholder="user_123"
              />
            </label>
            <label>
              <span>Role</span>
              <select
                required
                value={assignmentForm.roleId}
                onChange={(event) =>
                  setAssignmentForm({
                    ...assignmentForm,
                    roleId: event.target.value,
                  })
                }
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name} · {role.slug}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="console-button console-button--primary"
              type="submit"
              disabled={busyId === "new-assignment" || roles.length === 0}
            >
              Assign role
            </button>
          </form>
        </section>
      </div>

      <div className="console-split console-split--form">
        <section className="console-panel console-panel--table">
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
                    <th>Domains</th>
                    <th>Mappings</th>
                    <th>Status</th>
                    <th>Actions</th>
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
                      <td>
                        <div className="console-row-actions">
                          <button type="button" onClick={() => editProvider(provider)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="is-danger"
                            disabled={busyId === provider.id}
                            onClick={() => void deleteProvider(provider)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No identity providers configured"
              description="Add an encrypted OIDC or SAML registration from the form."
            />
          )}
        </section>

        <section className="console-panel console-panel--sticky">
          <header className="console-panel__header">
            <div>
              <span>{providerForm.id ? "Edit" : "Create"}</span>
              <h2>Encrypted identity provider</h2>
            </div>
            {providerForm.id ? (
              <button
                type="button"
                onClick={() =>
                  setProviderForm({
                    id: "",
                    name: "",
                    protocol: "oidc",
                    issuer: "",
                    domains: "",
                    clientId: "",
                    clientSecret: "",
                    status: "draft",
                    groupMappings: "[]",
                  })
                }
              >
                Cancel
              </button>
            ) : null}
          </header>
          <form className="console-form" onSubmit={saveProvider}>
            <div className="console-form__row">
              <label>
                <span>Name</span>
                <input
                  required
                  minLength={2}
                  value={providerForm.name}
                  onChange={(event) =>
                    setProviderForm({ ...providerForm, name: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Protocol</span>
                <select
                  value={providerForm.protocol}
                  onChange={(event) =>
                    setProviderForm({
                      ...providerForm,
                      protocol: event.target.value as typeof providerForm.protocol,
                    })
                  }
                >
                  <option value="oidc">OIDC</option>
                  <option value="saml">SAML</option>
                </select>
              </label>
            </div>
            <label>
              <span>Issuer URL</span>
              <input
                required
                type="url"
                value={providerForm.issuer}
                onChange={(event) =>
                  setProviderForm({ ...providerForm, issuer: event.target.value })
                }
              />
            </label>
            <label>
              <span>Verified domains</span>
              <input
                required
                value={providerForm.domains}
                onChange={(event) =>
                  setProviderForm({ ...providerForm, domains: event.target.value })
                }
                placeholder="example.com, eu.example.com"
              />
            </label>
            <label>
              <span>Client ID</span>
              <input
                required
                value={providerForm.clientId}
                onChange={(event) =>
                  setProviderForm({ ...providerForm, clientId: event.target.value })
                }
              />
            </label>
            <label>
              <span>
                {providerForm.id ? "New client secret (optional)" : "Client secret"}
              </span>
              <input
                required={!providerForm.id}
                minLength={16}
                type="password"
                autoComplete="new-password"
                value={providerForm.clientSecret}
                onChange={(event) =>
                  setProviderForm({
                    ...providerForm,
                    clientSecret: event.target.value,
                  })
                }
              />
              <small>
                Sent once over TLS and stored with the configured credential cipher.
              </small>
            </label>
            <div className="console-form__row">
              <label>
                <span>Status</span>
                <select
                  value={providerForm.status}
                  onChange={(event) =>
                    setProviderForm({
                      ...providerForm,
                      status: event.target.value as typeof providerForm.status,
                    })
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
            </div>
            <label>
              <span>Group mappings (JSON)</span>
              <textarea
                className="console-code-input"
                value={providerForm.groupMappings}
                onChange={(event) =>
                  setProviderForm({
                    ...providerForm,
                    groupMappings: event.target.value,
                  })
                }
                spellCheck={false}
              />
              <small>Array entries use claim, value, and an existing role slug.</small>
            </label>
            <button
              className="console-button console-button--primary"
              type="submit"
              disabled={busyId === (providerForm.id || "new-provider")}
            >
              {providerForm.id ? "Save provider" : "Create provider"}
            </button>
          </form>
        </section>
      </div>

      <div className="console-split">
        <section className="console-panel">
          <header className="console-panel__header">
            <div>
              <span>Machine identity</span>
              <h2>Create service principal</h2>
            </div>
          </header>
          <form className="console-form" onSubmit={issuePrincipal}>
            <label>
              <span>Name</span>
              <input
                required
                minLength={2}
                value={principalForm.name}
                onChange={(event) =>
                  setPrincipalForm({ ...principalForm, name: event.target.value })
                }
                placeholder="CI deployment agent"
              />
            </label>
            <label>
              <span>Role slugs</span>
              <input
                value={principalForm.roles}
                onChange={(event) =>
                  setPrincipalForm({ ...principalForm, roles: event.target.value })
                }
                placeholder={roles
                  .map((role) => role.slug)
                  .slice(0, 3)
                  .join(", ")}
              />
            </label>
            <button
              className="console-button console-button--primary"
              type="submit"
              disabled={busyId === "new-principal"}
            >
              {busyId === "new-principal" ? "Creating…" : "Create principal"}
            </button>
          </form>
        </section>
        <section className="console-panel console-panel--token">
          <header className="console-panel__header">
            <div>
              <span>One-time secret</span>
              <h2>Service-principal credentials</h2>
            </div>
          </header>
          {issuedPrincipal ? (
            <div className="console-token" aria-live="polite">
              <div className="console-token__warning">
                <strong>Copy this secret now.</strong>
                <span>Only its hash is retained by LiteMCP.</span>
              </div>
              <label>
                <span>Client ID</span>
                <input readOnly value={issuedPrincipal.principal.clientId} />
              </label>
              <label>
                <span>Client secret</span>
                <textarea readOnly value={issuedPrincipal.secret} />
              </label>
              <div className="console-action-row">
                <button
                  className="console-button"
                  type="button"
                  onClick={() =>
                    void copyText(
                      `${issuedPrincipal.principal.clientId}:${issuedPrincipal.secret}`
                    )
                      .then(() =>
                        onNotice({
                          tone: "info",
                          text: "Service-principal credentials copied.",
                        })
                      )
                      .catch((cause) =>
                        onNotice(errorNotice(cause, "Could not copy the credentials."))
                      )
                  }
                >
                  Copy client ID + secret
                </button>
                <button
                  className="console-button console-button--quiet"
                  type="button"
                  onClick={() => setIssuedPrincipal(null)}
                >
                  Hide secret
                </button>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No service-principal secret shown"
              description="Create a machine identity to reveal its secret once."
            />
          )}
        </section>
      </div>
    </section>
  );
}

function PolicyArea({
  client,
  policies,
  onNotice,
  onChanged,
}: {
  client: LiteMcpApiClient;
  policies: Policy[];
  onNotice: (notice: Notice | null) => void;
  onChanged: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [policyBusy, setPolicyBusy] = useState<string | null>(null);
  const [decision, setDecision] = useState<PolicyDecision | null>(null);
  const [lintByPolicy, setLintByPolicy] = useState<Record<string, PolicyLint>>({});
  const [policyForm, setPolicyForm] = useState({
    id: "",
    name: "",
    description: "",
    defaultEffect: "deny" as "allow" | "deny",
    rules: "[]",
  });
  const [form, setForm] = useState({
    policyId: "",
    subjectType: "user" as "user" | "service-principal",
    subjectId: "demo-user",
    roles: "employee",
    groups: "",
    action: "execute" as "discover" | "execute",
    toolName: "docs.search",
    risk: "read" as RiskClass,
  });

  const resetPolicyForm = () =>
    setPolicyForm({
      id: "",
      name: "",
      description: "",
      defaultEffect: "deny",
      rules: "[]",
    });

  const editPolicy = (policy: Policy) => {
    setPolicyForm({
      id: policy.id,
      name: policy.name,
      description: policy.description,
      defaultEffect: policy.defaultEffect,
      rules: JSON.stringify(policy.rules, null, 2),
    });
  };

  const savePolicy = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    let rules: PolicyRule[];
    try {
      const parsed = JSON.parse(policyForm.rules) as unknown;
      if (!Array.isArray(parsed)) throw new Error("Policy rules must be a JSON array.");
      rules = parsed as PolicyRule[];
    } catch (cause) {
      onNotice({
        tone: "error",
        text: cause instanceof Error ? cause.message : "Policy rules are invalid JSON.",
      });
      return;
    }
    setPolicyBusy(policyForm.id || "new-policy");
    const input: CreatePolicyInput = {
      name: policyForm.name.trim(),
      description: policyForm.description.trim(),
      defaultEffect: policyForm.defaultEffect,
      rules,
    };
    try {
      const result = policyForm.id
        ? await client.updatePolicy(policyForm.id, input)
        : await client.createPolicy(input);
      setLintByPolicy((current) => ({
        ...current,
        [result.data.policy.id]: result.data.lint,
      }));
      onNotice({
        tone: result.data.lint.valid ? "success" : "info",
        text: `${result.data.policy.name} was saved as a draft. ${
          result.data.lint.valid
            ? "Lint passed."
            : "Resolve lint conflicts before activation."
        }`,
        requestId: result.meta.requestId,
      });
      resetPolicyForm();
      onChanged();
    } catch (cause) {
      onNotice(errorNotice(cause, "Could not save the policy."));
    } finally {
      setPolicyBusy(null);
    }
  };

  const lintPolicy = async (policy: Policy) => {
    setPolicyBusy(policy.id);
    try {
      const result = await client.lintPolicy(policy.id);
      setLintByPolicy((current) => ({ ...current, [policy.id]: result.data }));
      onNotice({
        tone: result.data.valid ? "success" : "info",
        text: result.data.valid
          ? `${policy.name} passed lint.`
          : `${policy.name} has ${result.data.conflicts.length} blocking conflict(s).`,
        requestId: result.meta.requestId,
      });
    } catch (cause) {
      onNotice(errorNotice(cause, "Could not lint the policy."));
    } finally {
      setPolicyBusy(null);
    }
  };

  const activatePolicy = async (policy: Policy) => {
    if (
      !confirmAction(
        `Activate ${policy.name}? The previous active policy is archived and existing MCP sessions are invalidated.`
      )
    )
      return;
    setPolicyBusy(policy.id);
    try {
      const result = await client.activatePolicy(policy.id);
      setLintByPolicy((current) => ({
        ...current,
        [policy.id]: result.data.lint,
      }));
      onNotice({
        tone: "success",
        text: `${result.data.policy.name} is active. Existing scoped credentials were invalidated.`,
        requestId: result.meta.requestId,
      });
      onChanged();
    } catch (cause) {
      onNotice(errorNotice(cause, "Could not activate the policy."));
    } finally {
      setPolicyBusy(null);
    }
  };

  const archivePolicy = async (policy: Policy) => {
    if (!confirmAction(`Archive ${policy.name}?`)) return;
    setPolicyBusy(policy.id);
    try {
      const result = await client.archivePolicy(policy.id);
      onNotice({
        tone: "success",
        text: `${result.data.name} was archived.`,
        requestId: result.meta.requestId,
      });
      onChanged();
    } catch (cause) {
      onNotice(errorNotice(cause, "Could not archive the policy."));
    } finally {
      setPolicyBusy(null);
    }
  };

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
        title="Policies & simulator"
        description="Author, lint, activate, and test default-deny rules before they govern live discovery and execution."
      />
      <div className="console-split console-split--form">
        <section className="console-panel console-panel--table">
          <header className="console-panel__header">
            <div>
              <span>Lifecycle</span>
              <h2>{policies.length} versioned policies</h2>
            </div>
          </header>
          {policies.length > 0 ? (
            <div className="console-table-wrap">
              <table className="console-table">
                <caption className="sr-only">Policy lifecycle</caption>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Default</th>
                    <th>Rules</th>
                    <th>Status</th>
                    <th>Lint</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((policy) => {
                    const lint = lintByPolicy[policy.id];
                    return (
                      <tr key={policy.id}>
                        <td>
                          <strong>{policy.name}</strong>
                          <small>
                            {policy.version} · {policy.description}
                          </small>
                        </td>
                        <td>{policy.defaultEffect}</td>
                        <td>{policy.rules.length}</td>
                        <td>
                          <StatusBadge value={policy.status} />
                        </td>
                        <td>
                          {lint ? (
                            <StatusBadge value={lint.valid ? "valid" : "conflicts"} />
                          ) : (
                            "Not run"
                          )}
                          {lint &&
                          (lint.conflicts.length || lint.unreachable.length) ? (
                            <small>
                              {lint.conflicts.length} conflicts ·{" "}
                              {lint.unreachable.length} unreachable
                            </small>
                          ) : null}
                        </td>
                        <td>
                          <div className="console-row-actions">
                            <button
                              type="button"
                              onClick={() => void lintPolicy(policy)}
                              disabled={policyBusy === policy.id}
                            >
                              Lint
                            </button>
                            {policy.status !== "active" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => editPolicy(policy)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void activatePolicy(policy)}
                                  disabled={policyBusy === policy.id}
                                >
                                  Activate
                                </button>
                              </>
                            ) : null}
                            {policy.status === "draft" ? (
                              <button
                                type="button"
                                className="is-danger"
                                onClick={() => void archivePolicy(policy)}
                                disabled={policyBusy === policy.id}
                              >
                                Archive
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No policy exists"
              description="Create a default-deny draft, lint it, then activate it."
            />
          )}
          {Object.entries(lintByPolicy).some(
            ([, lint]) => lint.conflicts.length > 0 || lint.unreachable.length > 0
          ) ? (
            <div className="console-lint-results" aria-live="polite">
              {Object.entries(lintByPolicy).map(([policyId, lint]) => {
                const messages = [
                  ...lint.conflicts.map((item) => item.message),
                  ...lint.unreachable.map((item) => item.message),
                ];
                if (messages.length === 0) return null;
                return (
                  <div key={policyId}>
                    <strong>
                      {policies.find((policy) => policy.id === policyId)?.name ??
                        policyId}
                    </strong>
                    <ul>
                      {messages.map((message, index) => (
                        <li key={`${message}-${index}`}>{message}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
        <section className="console-panel console-panel--sticky">
          <header className="console-panel__header">
            <div>
              <span>{policyForm.id ? "Edit draft" : "Create"}</span>
              <h2>{policyForm.id ? "Policy editor" : "New policy"}</h2>
            </div>
            {policyForm.id ? (
              <button type="button" onClick={resetPolicyForm}>
                Cancel
              </button>
            ) : null}
          </header>
          <form className="console-form" onSubmit={savePolicy}>
            <label>
              <span>Name</span>
              <input
                required
                minLength={2}
                value={policyForm.name}
                onChange={(event) =>
                  setPolicyForm({ ...policyForm, name: event.target.value })
                }
                placeholder="Engineering access"
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                value={policyForm.description}
                onChange={(event) =>
                  setPolicyForm({ ...policyForm, description: event.target.value })
                }
              />
            </label>
            <label>
              <span>Default effect</span>
              <select
                value={policyForm.defaultEffect}
                onChange={(event) =>
                  setPolicyForm({
                    ...policyForm,
                    defaultEffect: event.target
                      .value as typeof policyForm.defaultEffect,
                  })
                }
              >
                <option value="deny">Deny</option>
                <option value="allow">Allow</option>
              </select>
            </label>
            <label>
              <span>Rules (JSON)</span>
              <textarea
                className="console-code-input console-code-input--tall"
                required
                value={policyForm.rules}
                onChange={(event) =>
                  setPolicyForm({ ...policyForm, rules: event.target.value })
                }
                spellCheck={false}
              />
              <small>
                Each rule needs id, description, priority, effect, and optional roles,
                groups, tools, risks, or actions selectors.
              </small>
            </label>
            <button
              className="console-button console-button--primary"
              type="submit"
              disabled={policyBusy === (policyForm.id || "new-policy")}
            >
              {policyForm.id ? "Save draft" : "Create draft"}
            </button>
          </form>
        </section>
      </div>
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
    </section>
  );
}

function ApprovalsArea({
  client,
  approvals,
  events,
  pendingCount,
  onNotice,
  onChanged,
}: {
  client: LiteMcpApiClient;
  approvals: ApprovalRequest[];
  events: AuditEvent[];
  pendingCount: number;
  onNotice: (notice: Notice | null) => void;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const decide = async (
    approval: ApprovalRequest,
    decision: ApprovalDecisionInput["decision"]
  ) => {
    const reason = reasons[approval.id]?.trim() ?? "";
    if (reason.length < 2) {
      onNotice({
        tone: "error",
        text: "Enter a decision reason with at least two characters.",
      });
      return;
    }
    setBusyId(approval.id);
    try {
      const result = await client.decideApproval(approval.id, {
        decision,
        reason,
        generation: approval.generation,
        fingerprint: approval.fingerprint,
      });
      setReasons((current) => ({ ...current, [approval.id]: "" }));
      onNotice({
        tone: "success",
        text: `${result.data.toolName} was ${result.data.status}.`,
        requestId: result.meta.requestId,
      });
      onChanged();
    } catch (cause) {
      onNotice(errorNotice(cause, "Could not decide the approval request."));
      if (cause instanceof ApiClientError && cause.status === 409) onChanged();
    } finally {
      setBusyId(null);
    }
  };

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
                  <th>Decision</th>
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
                    <td>
                      {approval.status === "pending" ? (
                        <div className="console-approval-actions">
                          <label>
                            <span className="sr-only">
                              Decision reason for {approval.toolName}
                            </span>
                            <input
                              required
                              minLength={2}
                              maxLength={1000}
                              value={reasons[approval.id] ?? ""}
                              onChange={(event) =>
                                setReasons({
                                  ...reasons,
                                  [approval.id]: event.target.value,
                                })
                              }
                              placeholder="Reason required"
                            />
                          </label>
                          <div className="console-row-actions">
                            <button
                              type="button"
                              disabled={busyId === approval.id}
                              onClick={() => void decide(approval, "approved")}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="is-danger"
                              disabled={busyId === approval.id}
                              onClick={() => void decide(approval, "denied")}
                            >
                              Deny
                            </button>
                          </div>
                        </div>
                      ) : approval.decisionReason ? (
                        <span title={approval.decisionReason}>
                          {approval.decisionReason}
                        </span>
                      ) : (
                        "—"
                      )}
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
        Decisions are bound to the exact tool and arguments hash. Arguments remain
        encrypted and are never rendered in the inbox.
      </div>
    </section>
  );
}

function SettingsArea({
  client,
  overview,
  environments,
  apiBaseUrl,
  demoMode,
  authority,
  onAuthority,
  onNotice,
  onChanged,
}: {
  client: LiteMcpApiClient;
  overview: PlatformOverview | null;
  environments: Environment[];
  apiBaseUrl: string;
  demoMode: boolean;
  authority: TenantAuthority | null;
  onAuthority: (authority: TenantAuthority) => void;
  onNotice: (notice: Notice | null) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<"export" | "import" | "freeze" | null>(null);
  const [freezeReason, setFreezeReason] = useState("");
  const [portableJson, setPortableJson] = useState("");

  const exportTenant = async () => {
    setBusy("export");
    try {
      const result = await client.exportTenant();
      const stamp = result.data.exportedAt.slice(0, 10);
      downloadJson(
        `${result.data.organization.slug}-${stamp}.litemcp.json`,
        result.data
      );
      onNotice({
        tone: "success",
        text: "A secret-free portable configuration was downloaded.",
        requestId: result.meta.requestId,
      });
    } catch (cause) {
      onNotice(errorNotice(cause, "Could not export the tenant."));
    } finally {
      setBusy(null);
    }
  };

  const importTenant = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    let value: unknown;
    try {
      value = JSON.parse(portableJson);
    } catch {
      onNotice({ tone: "error", text: "Portable import must be valid JSON." });
      return;
    }
    if (
      !confirmAction(
        "Import this configuration? Import is accepted only for a pristine workspace and replaces bootstrap data."
      )
    )
      return;
    setBusy("import");
    try {
      const result = await client.importTenant(value);
      setPortableJson("");
      onNotice({
        tone: "success",
        text: `${result.data.organization.name} was imported. Configure fresh identity-provider secrets before use.`,
        requestId: result.meta.requestId,
      });
      onChanged();
    } catch (cause) {
      onNotice(errorNotice(cause, "Could not import the portable configuration."));
    } finally {
      setBusy(null);
    }
  };

  const toggleFreeze = async () => {
    if (authority?.frozen) {
      if (!confirmAction("Unfreeze this workspace and allow governed access again?"))
        return;
    } else if (freezeReason.trim().length < 2) {
      onNotice({ tone: "error", text: "Enter a freeze reason." });
      return;
    } else if (
      !confirmAction(
        "Freeze this workspace? All governed MCP access will be denied and existing credentials invalidated."
      )
    ) {
      return;
    }
    setBusy("freeze");
    try {
      const result = authority?.frozen
        ? await client.unfreezeTenant()
        : await client.freezeTenant(freezeReason.trim());
      onAuthority(result.data);
      setFreezeReason("");
      onNotice({
        tone: "success",
        text: result.data.frozen
          ? "Emergency deny-all freeze is active."
          : "Workspace unfrozen; normal policy evaluation resumed.",
        requestId: result.meta.requestId,
      });
      onChanged();
    } catch (cause) {
      onNotice(errorNotice(cause, "Could not change the workspace freeze state."));
    } finally {
      setBusy(null);
    }
  };

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
              <span>Environments</span>
              <h2>{environments.length || (overview ? 1 : 0)} configured</h2>
            </div>
          </header>
          <dl className="console-definition-list">
            {(environments.length > 0
              ? environments
              : overview
                ? [overview.environment]
                : []
            ).map((environment) => (
              <div key={environment.id}>
                <dt>{environment.name}</dt>
                <dd>
                  {environment.kind} · {environment.region}
                  <br />
                  <code>{environment.id}</code>
                </dd>
              </div>
            ))}
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
        <section className="console-panel">
          <header className="console-panel__header">
            <div>
              <span>Authority</span>
              <h2>Global enforcement state</h2>
            </div>
            {authority ? (
              <StatusBadge value={authority.frozen ? "frozen" : "active"} />
            ) : null}
          </header>
          <dl className="console-definition-list">
            <div>
              <dt>Freeze</dt>
              <dd>{authority?.frozen ? "Deny all" : "Not active"}</dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>{authority?.freezeReason ?? "—"}</dd>
            </div>
            <div>
              <dt>Authorization epoch</dt>
              <dd>{authority?.authorizationEpoch ?? "—"}</dd>
            </div>
            <div>
              <dt>Active policy</dt>
              <dd>{authority?.activePolicyId ?? "—"}</dd>
            </div>
          </dl>
        </section>
      </div>
      <div className="console-split console-split--form">
        <section className="console-panel">
          <header className="console-panel__header">
            <div>
              <span>Portability</span>
              <h2>Export or import configuration</h2>
            </div>
          </header>
          <div className="console-form">
            <div className="console-inline-note">
              Exports contain catalog, composition, policy, role, and IdP metadata.
              Secrets and sensitive endpoints are redacted.
            </div>
            <button
              className="console-button console-button--primary"
              type="button"
              disabled={busy === "export"}
              onClick={() => void exportTenant()}
            >
              {busy === "export" ? "Preparing export…" : "Download portable export"}
            </button>
          </div>
          <header className="console-panel__header console-panel__subheader">
            <div>
              <span>Restore</span>
              <h2>Import into a pristine workspace</h2>
            </div>
          </header>
          <form className="console-form" onSubmit={importTenant}>
            <label>
              <span>Portable JSON</span>
              <textarea
                className="console-code-input console-code-input--tall"
                required
                value={portableJson}
                onChange={(event) => setPortableJson(event.target.value)}
                spellCheck={false}
                placeholder='{"format":"litemcp.portable.v1", ...}'
              />
            </label>
            <button
              className="console-button"
              type="submit"
              disabled={busy === "import"}
            >
              {busy === "import" ? "Importing…" : "Import configuration"}
            </button>
          </form>
        </section>

        <section
          className={`console-panel console-danger-zone ${authority?.frozen ? "is-frozen" : ""}`}
        >
          <header className="console-panel__header">
            <div>
              <span>Emergency control</span>
              <h2>{authority?.frozen ? "Workspace frozen" : "Freeze workspace"}</h2>
            </div>
            {authority ? (
              <StatusBadge value={authority.frozen ? "frozen" : "ready"} />
            ) : null}
          </header>
          <div className="console-form">
            <p className="console-form-copy">
              A freeze enables a tenant-wide deny-all overlay, increments the
              authorization epoch, and invalidates existing MCP credentials.
            </p>
            {!authority?.frozen ? (
              <label>
                <span>Reason</span>
                <textarea
                  required
                  minLength={2}
                  maxLength={1000}
                  value={freezeReason}
                  onChange={(event) => setFreezeReason(event.target.value)}
                  placeholder="Security incident or maintenance window"
                />
              </label>
            ) : (
              <div className="console-token__warning">
                <strong>Access is currently denied.</strong>
                <span>{authority.freezeReason ?? "Emergency freeze"}</span>
              </div>
            )}
            <button
              className={`console-button ${
                authority?.frozen ? "console-button--primary" : "console-button--danger"
              }`}
              type="button"
              disabled={busy === "freeze" || !authority}
              onClick={() => void toggleFreeze()}
            >
              {busy === "freeze"
                ? "Applying…"
                : authority?.frozen
                  ? "Unfreeze workspace"
                  : "Freeze all MCP access"}
            </button>
          </div>
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
