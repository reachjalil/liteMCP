import {
  createCompositionInputSchema,
  createServerInputSchema,
  createSessionInputSchema,
  policySimulationInputSchema,
  type Subject,
} from "@litemcp/contracts";
import {
  PlatformAuthorizationError,
  PlatformNotFoundError,
  type PlatformService,
  PlatformValidationError,
  tenantFromSessionToken,
} from "@litemcp/core";
import { demoSubject, type McpGateway } from "@litemcp/mcp-gateway";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { z, type ZodType } from "zod";

type AuthRuntime = {
  handler(request: Request): Response | Promise<Response>;
  api: {
    getSession(input: { headers: Headers }): Promise<unknown>;
    getActiveMemberRole(input: {
      headers: Headers;
      query?: { organizationId?: string };
    }): Promise<unknown>;
  };
};

type ApiActor = {
  id: string;
  tenantId: string;
  subject: Subject;
};

type AppVariables = {
  actor: ApiActor;
};

export type PlatformAppOptions = {
  platform: PlatformService;
  gateway: McpGateway;
  auth?: AuthRuntime;
  publicOrigin: string;
  webOrigins: string[];
  demoMode?: boolean;
};

const problem = (
  request: Request,
  requestIdValue: string,
  status: number,
  title: string,
  detail: string,
  errors?: Array<{ path: string; message: string }>
) => ({
  type: `https://litemcp.dev/problems/${title.toLowerCase().replaceAll(" ", "-")}`,
  title,
  status,
  detail,
  instance: new URL(request.url).pathname,
  requestId: requestIdValue,
  ...(errors ? { errors } : {}),
});

const bearerToken = (authorization: string | null) =>
  /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1] ?? null;

const sessionActor = (value: unknown, roles: string[]): ApiActor | null => {
  if (!value || typeof value !== "object") return null;
  const sessionValue = value as {
    user?: { id?: unknown; role?: unknown };
    session?: { activeOrganizationId?: unknown };
  };
  const id = sessionValue.user?.id;
  const tenantId = sessionValue.session?.activeOrganizationId;
  if (typeof id !== "string" || typeof tenantId !== "string") return null;
  return {
    id,
    tenantId,
    subject: {
      type: "user",
      id,
      roles,
      groups: [],
      claims: {},
    },
  };
};

const organizationRoles = (value: unknown) => {
  if (!value || typeof value !== "object") return [];
  const role = (value as { role?: unknown }).role;
  if (typeof role !== "string") return [];
  return role
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const managementRoles = new Set(["owner", "admin"]);

const hasManagementRole = (actor: ApiActor) =>
  actor.subject.roles.some((role) => managementRoles.has(role));

const requireManagementRole = (actor: ApiActor) => {
  if (!hasManagementRole(actor)) {
    throw new PlatformAuthorizationError(
      "An organization owner or administrator role is required."
    );
  }
};

const parseBody = async <T>(request: Request, schema: ZodType<T>) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new PlatformValidationError("Request body must be valid JSON.");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const error = new PlatformValidationError("Request validation failed.");
    Object.assign(error, {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    throw error;
  }
  return result.data;
};

const openApiDocument = (origin: string) => ({
  openapi: "3.1.0",
  info: {
    title: "LiteMCP Composer Control Plane API",
    version: "0.1.0",
    description:
      "Portable management API for MCP registry, composition, policy, sessions, and audit.",
    license: { name: "Apache-2.0", identifier: "Apache-2.0" },
  },
  servers: [{ url: origin }],
  tags: [
    { name: "Platform" },
    { name: "Registry" },
    { name: "Composer" },
    { name: "Policy" },
    { name: "Sessions" },
    { name: "Audit" },
  ],
  components: {
    securitySchemes: {
      cookieSession: {
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
      },
      bearerAuth: { type: "http", scheme: "bearer" },
    },
    schemas: {
      CreateServerInput: z.toJSONSchema(createServerInputSchema),
      CreateCompositionInput: z.toJSONSchema(createCompositionInputSchema),
      CreateSessionInput: z.toJSONSchema(createSessionInputSchema),
      PolicySimulationInput: z.toJSONSchema(policySimulationInputSchema),
    },
  },
  security: [{ cookieSession: [] }, { bearerAuth: [] }],
  paths: {
    "/api/v1/overview": {
      get: { tags: ["Platform"], responses: { "200": { description: "Overview" } } },
    },
    "/api/v1/servers": {
      get: { tags: ["Registry"], responses: { "200": { description: "Servers" } } },
      post: {
        tags: ["Registry"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateServerInput" },
            },
          },
        },
        responses: { "201": { description: "Server created" } },
      },
    },
    "/api/v1/compositions": {
      get: {
        tags: ["Composer"],
        responses: { "200": { description: "Compositions" } },
      },
      post: {
        tags: ["Composer"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateCompositionInput" },
            },
          },
        },
        responses: { "201": { description: "Composition created" } },
      },
    },
    "/api/v1/sessions": {
      post: {
        tags: ["Sessions"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateSessionInput" },
            },
          },
        },
        responses: { "201": { description: "One-time session token" } },
      },
    },
    "/api/v1/sessions/{sessionId}/revoke": {
      post: {
        tags: ["Sessions"],
        parameters: [
          {
            name: "sessionId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "200": { description: "Session revoked" } },
      },
    },
    "/api/v1/policy/simulate": {
      post: {
        tags: ["Policy"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PolicySimulationInput" },
            },
          },
        },
        responses: { "200": { description: "Policy decision and explanation" } },
      },
    },
    "/api/v1/audit": {
      get: { tags: ["Audit"], responses: { "200": { description: "Audit events" } } },
    },
    "/api/v1/export": {
      get: {
        tags: ["Platform"],
        responses: { "200": { description: "Portable export" } },
      },
    },
  },
});

export const createPlatformApp = (options: PlatformAppOptions) => {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use("*", requestId());
  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
      referrerPolicy: "no-referrer",
      xFrameOptions: "DENY",
    })
  );
  app.use(
    "/api/*",
    cors({
      origin: (origin) =>
        options.webOrigins.includes(origin) ? origin : (options.webOrigins[0] ?? ""),
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "Idempotency-Key",
        "X-LiteMCP-Tenant",
        "X-LiteMCP-Role",
        "X-Request-ID",
      ],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      exposeHeaders: ["X-Request-ID"],
      credentials: true,
      maxAge: 600,
    })
  );
  app.use(
    "*",
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: (c) =>
        c.json(
          problem(
            c.req.raw,
            c.get("requestId"),
            413,
            "Payload Too Large",
            "Request bodies are limited to 1 MiB."
          ),
          413
        ),
    })
  );

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      service: "litemcp",
      version: "0.1.0",
      storage: options.platform.store.capabilities,
      time: new Date().toISOString(),
    })
  );
  app.get("/ready", async (c) => {
    if (options.demoMode) {
      await options.platform.ensureDemoTenant("org_demo", options.publicOrigin);
      return c.json({ status: "ready" });
    }
    if (!options.auth || options.platform.store.capabilities.driver === "memory") {
      return c.json(
        {
          status: "not_ready",
          reason:
            "Production readiness requires persistent storage and authentication.",
        },
        503
      );
    }
    try {
      await options.platform.store.list("__readiness__", "organizations", {
        limit: 1,
      });
      return c.json({ status: "ready" });
    } catch {
      return c.json(
        { status: "not_ready", reason: "The product data store is unavailable." },
        503
      );
    }
  });

  app.on(["GET", "POST", "PUT", "PATCH", "DELETE"], "/api/auth/*", (c) => {
    if (!options.auth) {
      return c.json(
        problem(
          c.req.raw,
          c.get("requestId"),
          503,
          "Authentication Unavailable",
          "Better Auth is not configured for this process."
        ),
        503
      );
    }
    return options.auth.handler(c.req.raw);
  });

  app.use("/api/v1/*", async (c, next) => {
    if (options.demoMode) {
      await options.platform.ensureDemoTenant("org_demo", options.publicOrigin);
      const requestedTenant = c.req.header("x-litemcp-tenant") ?? "org_demo";
      if (requestedTenant !== "org_demo") {
        return c.json(
          problem(
            c.req.raw,
            c.get("requestId"),
            403,
            "Tenant Denied",
            "The local demo runtime exposes only org_demo."
          ),
          403
        );
      }
      const requestedRole = c.req.header("x-litemcp-role");
      const role = requestedRole === "finance-admin" ? "finance-admin" : "employee";
      const demoIdentity = demoSubject(role);
      const subject =
        role === "finance-admin"
          ? { ...demoIdentity, roles: ["admin", "finance-admin"] }
          : demoIdentity;
      c.set("actor", { id: subject.id, tenantId: "org_demo", subject });
      await next();
      return;
    }
    if (!options.auth) {
      return c.json(
        problem(
          c.req.raw,
          c.get("requestId"),
          503,
          "Authentication Unavailable",
          "The production API requires Better Auth."
        ),
        503
      );
    }
    const session = await options.auth.api.getSession({
      headers: c.req.raw.headers,
    });
    const identity = sessionActor(session, []);
    if (!identity) {
      return c.json(
        problem(
          c.req.raw,
          c.get("requestId"),
          401,
          "Authentication Required",
          "Sign in and select an active organization."
        ),
        401
      );
    }
    let membership: unknown;
    try {
      membership = await options.auth.api.getActiveMemberRole({
        headers: c.req.raw.headers,
        query: { organizationId: identity.tenantId },
      });
    } catch {
      return c.json(
        problem(
          c.req.raw,
          c.get("requestId"),
          403,
          "Membership Required",
          "The authenticated identity is not an active member of this organization."
        ),
        403
      );
    }
    const roles = organizationRoles(membership);
    if (roles.length === 0) {
      return c.json(
        problem(
          c.req.raw,
          c.get("requestId"),
          403,
          "Membership Required",
          "The active organization membership has no recognized role."
        ),
        403
      );
    }
    c.set("actor", {
      ...identity,
      subject: { ...identity.subject, roles },
    });
    await next();
  });

  const respond = <T>(
    c: {
      json: (value: unknown, status?: 200 | 201) => Response;
      get: (key: "requestId") => string;
    },
    data: T,
    status: 200 | 201 = 200
  ) => c.json({ data, meta: { requestId: c.get("requestId") } }, status);

  app.get("/api/v1/openapi.json", (c) => c.json(openApiDocument(options.publicOrigin)));
  app.get("/api/v1/overview", async (c) => {
    const actor = c.get("actor");
    return respond(
      c,
      await options.platform.getOverview(actor.tenantId, options.publicOrigin)
    );
  });
  app.get("/api/v1/servers", async (c) => {
    return respond(c, await options.platform.listServers(c.get("actor").tenantId));
  });
  app.post("/api/v1/servers", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    const input = await parseBody(c.req.raw, createServerInputSchema);
    return respond(
      c,
      await options.platform.createServer(
        actor.tenantId,
        input,
        actor.id,
        c.get("requestId")
      ),
      201
    );
  });
  app.get("/api/v1/compositions", async (c) => {
    return respond(c, await options.platform.listCompositions(c.get("actor").tenantId));
  });
  app.post("/api/v1/compositions", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    const input = await parseBody(c.req.raw, createCompositionInputSchema);
    return respond(
      c,
      await options.platform.createComposition(
        actor.tenantId,
        input,
        actor.id,
        c.get("requestId")
      ),
      201
    );
  });
  app.get("/api/v1/policies", async (c) => {
    return respond(c, await options.platform.listPolicies(c.get("actor").tenantId));
  });
  app.post("/api/v1/policy/simulate", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    const input = await parseBody(c.req.raw, policySimulationInputSchema);
    return respond(c, await options.platform.simulatePolicy(actor.tenantId, input));
  });
  app.post("/api/v1/sessions", async (c) => {
    const actor = c.get("actor");
    const requestedInput = await parseBody(c.req.raw, createSessionInputSchema);
    // A production caller may only mint a session for its authenticated
    // identity. Delegated/service-principal issuance needs a separate,
    // explicitly authorized API instead of trusting roles from request JSON.
    const input = options.demoMode
      ? requestedInput
      : { ...requestedInput, subject: actor.subject };
    return respond(
      c,
      await options.platform.createSession(
        actor.tenantId,
        input,
        actor.id,
        c.get("requestId"),
        options.publicOrigin
      ),
      201
    );
  });
  app.post("/api/v1/sessions/:sessionId/revoke", async (c) => {
    const actor = c.get("actor");
    return respond(
      c,
      await options.platform.revokeSession(
        actor.tenantId,
        c.req.param("sessionId"),
        actor.id,
        c.get("requestId"),
        hasManagementRole(actor)
      )
    );
  });
  app.get("/api/v1/audit", async (c) => {
    requireManagementRole(c.get("actor"));
    const limitValue = Number(c.req.query("limit") ?? "100");
    const limit = Number.isFinite(limitValue) ? Math.max(1, limitValue) : 100;
    return respond(c, await options.platform.listAudit(c.get("actor").tenantId, limit));
  });
  app.get("/api/v1/identity-providers", async (c) => {
    requireManagementRole(c.get("actor"));
    return respond(
      c,
      await options.platform.listIdentityProviders(c.get("actor").tenantId)
    );
  });
  app.get("/api/v1/approvals", async (c) => {
    requireManagementRole(c.get("actor"));
    return respond(c, await options.platform.listApprovals(c.get("actor").tenantId));
  });
  app.get("/api/v1/export", async (c) => {
    requireManagementRole(c.get("actor"));
    return respond(c, await options.platform.exportTenant(c.get("actor").tenantId));
  });

  app.post("/mcp/:tenantId/:compositionSlug", async (c) => {
    const requestIdValue = c.get("requestId");
    const tenantId = c.req.param("tenantId");
    const token = bearerToken(c.req.header("authorization") ?? null);
    if (token && tenantFromSessionToken(token) !== tenantId) {
      return c.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32003, message: "Session tenant does not match endpoint." },
        },
        403
      );
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
        400
      );
    }
    const result = await options.gateway.handle({
      tenantId,
      compositionSlug: c.req.param("compositionSlug"),
      authorization: c.req.header("authorization") ?? null,
      body,
      requestId: requestIdValue,
      signal: c.req.raw.signal,
    });
    if (!result.body) return c.body(null, result.status === 202 ? 202 : 204);
    return c.json(result.body, result.status as 200);
  });

  app.post("/demo-upstreams/finance/mcp", async (c) => {
    if (!options.demoMode) return c.notFound();
    const body = (await c.req.json()) as {
      id?: string | number | null;
      method?: string;
      params?: { name?: string; arguments?: Record<string, unknown> };
    };
    if (body.method === "initialize") {
      return c.json({
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: {
          protocolVersion: "2025-11-25",
          capabilities: { tools: {} },
          serverInfo: { name: "LiteMCP Composer Finance Sandbox", version: "1.0.0" },
        },
      });
    }
    if (body.method === "tools/list") {
      return c.json({
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: {
          tools: [
            {
              name: "list_invoices",
              description: "Lists deterministic sandbox invoices.",
              inputSchema: {
                type: "object",
                properties: { accountId: { type: "string" } },
                required: ["accountId"],
              },
            },
            {
              name: "issue_refund",
              description: "Creates a sandbox refund.",
              inputSchema: {
                type: "object",
                properties: {
                  invoiceId: { type: "string" },
                  reason: { type: "string" },
                },
                required: ["invoiceId", "reason"],
              },
            },
          ],
        },
      });
    }
    if (body.method === "tools/call" && body.params?.name === "list_invoices") {
      const accountId = String(body.params.arguments?.accountId ?? "unknown");
      return c.json({
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: {
          content: [
            {
              type: "text",
              text: `invoice_100 · ${accountId} · EUR 42.00 · open`,
            },
          ],
          structuredContent: {
            invoices: [
              {
                id: "invoice_100",
                accountId,
                currency: "EUR",
                amount: 42,
                status: "open",
              },
            ],
          },
        },
      });
    }
    return c.json(
      {
        jsonrpc: "2.0",
        id: body.id ?? null,
        error: { code: -32601, message: "Method or tool not found" },
      },
      404
    );
  });

  app.notFound((c) =>
    c.json(
      problem(
        c.req.raw,
        c.get("requestId"),
        404,
        "Not Found",
        "No route matched this request."
      ),
      404
    )
  );

  app.onError((error, c) => {
    const requestIdValue = c.get("requestId");
    if (error instanceof PlatformNotFoundError) {
      return c.json(
        problem(c.req.raw, requestIdValue, 404, "Not Found", error.message),
        404
      );
    }
    if (error instanceof PlatformAuthorizationError) {
      return c.json(
        problem(c.req.raw, requestIdValue, 403, "Forbidden", error.message),
        403
      );
    }
    if (error instanceof PlatformValidationError) {
      const issues = (
        error as PlatformValidationError & {
          issues?: Array<{ path: string; message: string }>;
        }
      ).issues;
      return c.json(
        problem(
          c.req.raw,
          requestIdValue,
          422,
          "Validation Failed",
          error.message,
          issues
        ),
        422
      );
    }
    console.error("[litemcp] request failed", {
      requestId: requestIdValue,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return c.json(
      problem(
        c.req.raw,
        requestIdValue,
        500,
        "Internal Error",
        "The request failed. Sensitive details were not returned."
      ),
      500
    );
  });

  return app;
};

export type PlatformApp = ReturnType<typeof createPlatformApp>;
