#!/usr/bin/env node
import { LiteMcpClient } from "@litemcp/sdk";
import { pathToFileURL } from "node:url";

export type ParsedArguments = {
  command: string;
  flags: Record<string, string | boolean>;
};

export const parseArguments = (arguments_: string[]): ParsedArguments => {
  const [command = "help", ...rest] = arguments_;
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const entry = rest[index];
    if (!entry?.startsWith("--")) continue;
    const key = entry.slice(2);
    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
};

const stringFlag = (
  flags: Record<string, string | boolean>,
  key: string,
  fallback?: string
) => {
  const value = flags[key];
  return typeof value === "string" ? value : fallback;
};

const output = (value: unknown, json: boolean) => {
  if (json || typeof value !== "object") {
    console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
    return;
  }
  console.log(JSON.stringify(value, null, 2));
};

const help = `LiteMCP Composer CLI

Usage: litemcp <command> [options]

Commands:
  doctor          Check API health and local runtime prerequisites
  status          Show organization and gateway status
  export          Print a secret-free portable configuration
  policy-test     Explain one policy decision
  session-create  Issue a short-lived scoped MCP session

Global options:
  --api <url>       Control-plane URL (default LITEMCP_API_URL or localhost)
  --tenant <id>     Tenant header for explicit local demo mode
  --role <role>     employee or finance-admin in demo mode
  --json            Machine-readable output
`;

export const run = async (arguments_: string[]) => {
  const parsed = parseArguments(arguments_);
  if (parsed.command === "help" || parsed.flags.help) {
    console.log(help);
    return 0;
  }
  const api =
    stringFlag(parsed.flags, "api") ??
    process.env.LITEMCP_API_URL ??
    "http://localhost:8787";
  const tenantId = stringFlag(parsed.flags, "tenant") ?? process.env.LITEMCP_TENANT_ID;
  const requestedRole =
    stringFlag(parsed.flags, "role") ?? process.env.LITEMCP_DEMO_ROLE;
  const demoRole =
    requestedRole === "employee" || requestedRole === "finance-admin"
      ? requestedRole
      : undefined;
  const client = new LiteMcpClient({ baseUrl: api, tenantId, demoRole });
  const json = parsed.flags.json === true;

  if (parsed.command === "doctor") {
    const started = performance.now();
    const response = await fetch(`${api.replace(/\/$/, "")}/health`, {
      redirect: "error",
    });
    const health = await response.json();
    const result = {
      ok: response.ok,
      node: process.version,
      api,
      latencyMs: Math.round(performance.now() - started),
      health,
    };
    output(result, json);
    return response.ok ? 0 : 1;
  }

  if (parsed.command === "status") {
    output(await client.overview(), json);
    return 0;
  }

  if (parsed.command === "export") {
    output(await client.exportConfiguration(), true);
    return 0;
  }

  if (parsed.command === "policy-test") {
    const toolName = stringFlag(parsed.flags, "tool");
    const role = stringFlag(parsed.flags, "role", "employee") ?? "employee";
    const actionValue = stringFlag(parsed.flags, "action", "execute");
    const riskValue = stringFlag(parsed.flags, "risk", "read");
    if (!toolName) throw new Error("policy-test requires --tool.");
    const action = actionValue === "discover" ? "discover" : "execute";
    const risks = [
      "read",
      "write",
      "destructive",
      "financial",
      "identity-admin",
      "code-exec",
    ] as const;
    const risk = risks.find((entry) => entry === riskValue);
    if (!risk) throw new Error(`Unsupported risk class: ${riskValue}`);
    output(
      await client.simulatePolicy({
        subject: {
          type: "user",
          id: "cli_subject",
          roles: [role],
          groups: [],
          claims: {},
        },
        action,
        toolName,
        risk,
      }),
      json
    );
    return 0;
  }

  if (parsed.command === "session-create") {
    const compositionId = stringFlag(
      parsed.flags,
      "composition",
      "composition_company"
    ) as string;
    const environmentId = stringFlag(
      parsed.flags,
      "environment",
      "env_production"
    ) as string;
    const role = stringFlag(parsed.flags, "role", "employee") as string;
    const result = await client.createSession({
      compositionId,
      environmentId,
      subject: {
        type: "user",
        id: stringFlag(parsed.flags, "subject", "cli_subject") as string,
        roles: [role],
        groups: [],
        claims: { client: "litemcp-cli" },
      },
      approvedClients: ["litemcp-cli"],
      expiresInSeconds: Number(stringFlag(parsed.flags, "expires", "3600")),
    });
    output(result, true);
    return 0;
  }

  throw new Error(`Unknown command: ${parsed.command}`);
};

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isEntrypoint) {
  run(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : "CLI command failed.");
      process.exitCode = 1;
    });
}
