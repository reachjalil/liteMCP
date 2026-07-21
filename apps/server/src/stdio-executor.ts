import { spawn } from "node:child_process";

import type { McpServerDefinition } from "@litemcp/contracts";
import type {
  ExecutionContext,
  ToolExecutionResult,
  UpstreamExecutor,
} from "@litemcp/mcp-gateway";

type StdioExecutorOptions = {
  allowedExecutables: string[];
  timeoutMs?: number;
  maxOutputBytes?: number;
};

/**
 * Conservative local stdio adapter. Production installations should run this
 * behind the sandbox runner; host execution is disabled unless an operator
 * explicitly allowlists the exact executable.
 */
export class SupervisedStdioExecutor implements UpstreamExecutor {
  constructor(private readonly options: StdioExecutorOptions) {}

  supports(server: McpServerDefinition) {
    return server.transport === "stdio";
  }

  async execute(
    server: McpServerDefinition,
    toolName: string,
    args: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ToolExecutionResult> {
    const [executable, ...commandArgs] = server.command ?? [];
    if (!executable || !this.options.allowedExecutables.includes(executable)) {
      throw new Error("The stdio executable is not in the operator allowlist.");
    }
    const child = spawn(executable, commandArgs, {
      cwd: "/tmp",
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const maxOutputBytes = this.options.maxOutputBytes ?? 1024 * 1024;
    const timeoutMs = this.options.timeoutMs ?? 20_000;
    const request = JSON.stringify({
      jsonrpc: "2.0",
      id: context.requestId,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    });
    child.stdin.end(`${request}\n`);

    return await new Promise<ToolExecutionResult>((resolve, reject) => {
      let output = "";
      let errors = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Stdio MCP execution timed out."));
      }, timeoutMs);
      const abort = () => {
        child.kill("SIGTERM");
        reject(new Error("Stdio MCP execution was cancelled."));
      };
      context.signal?.addEventListener("abort", abort, { once: true });
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        output += chunk;
        if (Buffer.byteLength(output) > maxOutputBytes) {
          child.kill("SIGKILL");
          reject(new Error("Stdio MCP output exceeded its byte limit."));
        }
      });
      child.stderr.on("data", (chunk: string) => {
        errors += chunk;
        if (Buffer.byteLength(errors) > 16_384) errors = errors.slice(-16_384);
      });
      child.once("error", reject);
      child.once("close", (code) => {
        clearTimeout(timer);
        context.signal?.removeEventListener("abort", abort);
        if (code !== 0) {
          reject(
            new Error(`Stdio MCP exited with code ${code}; stderr was suppressed.`)
          );
          return;
        }
        try {
          const line = output.trim().split("\n").at(-1) ?? "";
          const payload = JSON.parse(line) as {
            result?: ToolExecutionResult;
            error?: { message?: string };
          };
          if (payload.error) {
            reject(new Error(payload.error.message ?? "Stdio MCP returned an error."));
            return;
          }
          if (!payload.result?.content) {
            reject(new Error("Stdio MCP returned an invalid tool result."));
            return;
          }
          resolve(payload.result);
        } catch {
          reject(new Error("Stdio MCP returned invalid JSON-RPC output."));
        }
      });
    });
  }
}
