#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { LiteMcpClient } from "@litemcp/sdk";

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

const requiredFlag = (
  flags: Record<string, string | boolean>,
  key: string,
  command: string
) => {
  const value = stringFlag(flags, key);
  if (!value) throw new Error(`${command} requires --${key}.`);
  return value;
};

const positiveIntegerFlag = (
  flags: Record<string, string | boolean>,
  key: string,
  command: string
) => {
  const value = requiredFlag(flags, key, command);
  if (!/^\d+$/.test(value)) {
    throw new Error(`${command} --${key} must be a positive integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${command} --${key} must be a positive integer.`);
  }
  return parsed;
};

export const readJsonInput = async (
  flags: Record<string, string | boolean>,
  command: string
): Promise<Record<string, unknown>> => {
  const inline = stringFlag(flags, "input");
  const file = stringFlag(flags, "file");
  if (inline && file) {
    throw new Error(`${command} accepts either --input or --file, not both.`);
  }
  const source = inline ?? (file ? await readFile(file, "utf8") : undefined);
  if (!source) {
    throw new Error(`${command} requires --input <json> or --file <path>.`);
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(`${command} input must be valid JSON.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${command} input must be a JSON object.`);
  }
  return value as Record<string, unknown>;
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
  environment-list List available deployment environments
  server-list      List registered MCP servers
  server-create    Register a server from --input or --file JSON
  server-update    Patch --id from --input or --file JSON
  server-probe     Probe --id and import its tool schema
  server-delete    Delete --id when it has no composition dependencies
  composition-list List compositions
  composition-create Create a draft from --input or --file JSON
  composition-update Patch --id from --input or --file JSON
  composition-publish Publish --id
  composition-delete Delete --id after revoking dependent sessions
  policy-list      List policy versions
  policy-create    Create a draft from --input or --file JSON
  policy-update    Patch draft --id from --input or --file JSON
  policy-lint      Lint policy --id
  policy-activate  Atomically activate policy --id
  policy-archive   Archive inactive policy --id
  export          Print a secret-free portable configuration
  import          Import a pristine tenant from --file or --input JSON
  policy-test     Explain one policy decision
  session-create  Issue a short-lived scoped MCP session
  session-list    List redacted sessions
  session-revoke  Revoke session --id
  approval-list   List approval requests
  approval-decide Approve/deny --id with --decision, --reason, --generation, and --fingerprint
  activation-events Show the tenant activation funnel
  freeze           Enable emergency deny-all (optional --reason)
  unfreeze         Remove emergency deny-all

Global options:
  --api <url>       Control-plane URL (default LITEMCP_API_URL or localhost)
  --tenant <id>     Tenant header for explicit local demo mode
  --role <role>     employee or finance-admin in demo mode
  --api-key <token> Bearer credential (or LITEMCP_API_KEY)
  --input <json>    Inline JSON for create/update/import commands
  --file <path>     Read JSON from a file
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
  const apiKey = stringFlag(parsed.flags, "api-key") ?? process.env.LITEMCP_API_KEY;
  const client = new LiteMcpClient({ baseUrl: api, tenantId, demoRole, apiKey });
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

  if (parsed.command === "environment-list") {
    output(await client.environments(), json);
    return 0;
  }

  if (parsed.command === "server-list") {
    output(await client.servers(), json);
    return 0;
  }

  if (parsed.command === "server-create") {
    const input = await readJsonInput(parsed.flags, parsed.command);
    output(
      await client.createServer(input as Parameters<LiteMcpClient["createServer"]>[0]),
      json
    );
    return 0;
  }

  if (parsed.command === "server-update") {
    const id = requiredFlag(parsed.flags, "id", parsed.command);
    const input = await readJsonInput(parsed.flags, parsed.command);
    output(
      await client.updateServer(
        id,
        input as Parameters<LiteMcpClient["updateServer"]>[1]
      ),
      json
    );
    return 0;
  }

  if (parsed.command === "server-probe") {
    const id = requiredFlag(parsed.flags, "id", parsed.command);
    output(
      await client.probeServer(id, {
        acceptDrift: parsed.flags["accept-drift"] === true,
      }),
      json
    );
    return 0;
  }

  if (parsed.command === "server-delete") {
    output(
      await client.deleteServer(requiredFlag(parsed.flags, "id", parsed.command)),
      json
    );
    return 0;
  }

  if (parsed.command === "composition-list") {
    output(await client.compositions(), json);
    return 0;
  }

  if (parsed.command === "composition-create") {
    const input = await readJsonInput(parsed.flags, parsed.command);
    output(
      await client.createComposition(
        input as Parameters<LiteMcpClient["createComposition"]>[0]
      ),
      json
    );
    return 0;
  }

  if (parsed.command === "composition-update") {
    const id = requiredFlag(parsed.flags, "id", parsed.command);
    const input = await readJsonInput(parsed.flags, parsed.command);
    output(
      await client.updateComposition(
        id,
        input as Parameters<LiteMcpClient["updateComposition"]>[1]
      ),
      json
    );
    return 0;
  }

  if (parsed.command === "composition-publish") {
    output(
      await client.publishComposition(requiredFlag(parsed.flags, "id", parsed.command)),
      json
    );
    return 0;
  }

  if (parsed.command === "composition-delete") {
    output(
      await client.deleteComposition(requiredFlag(parsed.flags, "id", parsed.command)),
      json
    );
    return 0;
  }

  if (parsed.command === "policy-list") {
    output(await client.policies(), json);
    return 0;
  }

  if (parsed.command === "policy-create") {
    const input = await readJsonInput(parsed.flags, parsed.command);
    output(
      await client.createPolicy(input as Parameters<LiteMcpClient["createPolicy"]>[0]),
      json
    );
    return 0;
  }

  if (parsed.command === "policy-update") {
    const id = requiredFlag(parsed.flags, "id", parsed.command);
    const input = await readJsonInput(parsed.flags, parsed.command);
    output(
      await client.updatePolicy(
        id,
        input as Parameters<LiteMcpClient["updatePolicy"]>[1]
      ),
      json
    );
    return 0;
  }

  if (parsed.command === "policy-lint") {
    output(
      await client.lintPolicy(requiredFlag(parsed.flags, "id", parsed.command)),
      json
    );
    return 0;
  }

  if (parsed.command === "policy-activate") {
    output(
      await client.activatePolicy(requiredFlag(parsed.flags, "id", parsed.command)),
      json
    );
    return 0;
  }

  if (parsed.command === "policy-archive") {
    output(
      await client.archivePolicy(requiredFlag(parsed.flags, "id", parsed.command)),
      json
    );
    return 0;
  }

  if (parsed.command === "export") {
    output(await client.exportConfiguration(), true);
    return 0;
  }

  if (parsed.command === "import") {
    const input = await readJsonInput(parsed.flags, parsed.command);
    output(
      await client.importConfiguration(
        input as Parameters<LiteMcpClient["importConfiguration"]>[0]
      ),
      json
    );
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

  if (parsed.command === "session-list") {
    output(await client.sessions(), json);
    return 0;
  }

  if (parsed.command === "session-revoke") {
    output(
      await client.revokeSession(requiredFlag(parsed.flags, "id", parsed.command)),
      json
    );
    return 0;
  }

  if (parsed.command === "approval-list") {
    output(await client.approvals(), json);
    return 0;
  }

  if (parsed.command === "approval-decide") {
    const decision = requiredFlag(parsed.flags, "decision", parsed.command);
    if (decision !== "approved" && decision !== "denied") {
      throw new Error("approval-decide --decision must be approved or denied.");
    }
    output(
      await client.decideApproval(requiredFlag(parsed.flags, "id", parsed.command), {
        decision,
        reason: requiredFlag(parsed.flags, "reason", parsed.command),
        generation: positiveIntegerFlag(parsed.flags, "generation", parsed.command),
        fingerprint: requiredFlag(parsed.flags, "fingerprint", parsed.command),
      }),
      json
    );
    return 0;
  }

  if (parsed.command === "activation-events") {
    output(await client.activationEvents(), json);
    return 0;
  }

  if (parsed.command === "freeze") {
    output(await client.freeze(stringFlag(parsed.flags, "reason")), json);
    return 0;
  }

  if (parsed.command === "unfreeze") {
    output(await client.unfreeze(), json);
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
