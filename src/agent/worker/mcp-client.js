import path from "node:path";
import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadMcpConfig } from "./mcp-config.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { createMcpOAuth } from "./mcp-oauth.js";

const LIMIT = 16 * 1024;
const safe = (text) =>
  String(text)
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .slice(0, 800);
const bounded = (text) =>
  text.length > LIMIT ? `${text.slice(0, LIMIT)}\n[MCP output truncated.]` : text;

export function createMcpClient({
  workspace = process.cwd(),
  configStore,
  requestQuestions,
  onError = () => {},
}) {
  const approved = new Set();
  const active = new Set();
  const authSessions = new Set();
  let approvalQueue = Promise.resolve();
  function consent(question, signal) {
    const pending = approvalQueue.then(() => requestConsent(question, signal));
    approvalQueue = pending.catch(() => false);
    return pending;
  }
  async function requestConsent(question, signal) {
    if (!requestQuestions || signal?.aborted) return false;
    const result = await requestQuestions(
      [{ id: "mcp_approval", question, type: "single", options: ["Deny", "Approve"] }],
      { signal },
    );
    return (
      !signal?.aborted &&
      result?.cancelled === false &&
      result.answers?.find((a) => a.id === "mcp_approval")?.choices?.[0] === "Approve"
    );
  }
  async function discover({ signal } = {}) {
    const definitions = {};
    const connections = [];
    const close = async () => {
      await Promise.all(
        connections.map(async (client) => {
          active.delete(client);
          await client.close().catch(() => {});
        }),
      );
    };
    try {
      const entries = await loadMcpConfig(workspace, configStore.get?.()?.mcp ?? {});
      for (const { name, config, workspaceDefined } of entries) {
        if (signal?.aborted) throw signal.reason ?? new Error("Cancelled.");
        if (config.enabled === false) continue;
        const fingerprint = createHash("sha256")
          .update(JSON.stringify({ workspace, name, config }))
          .digest("hex");
        if (workspaceDefined && !approved.has(fingerprint)) {
          const target = config.type === "local" ? JSON.stringify(config.command) : config.url;
          if (
            !(await consent(
              `Allow workspace MCP server ${safe(name)}? ${safe(target)}. This can run local code or send data externally, outside workspace restrictions. Approval lasts for this session and configuration.`,
              signal,
            ))
          )
            continue;
          approved.add(fingerprint);
        }
        const client = new Client({ name: "xarab", version: "1.0.0" }, { capabilities: {} });
        connections.push(client);
        active.add(client);
        const serverKeys = [];
        let oauth;
        try {
          const timeout = config.timeout ?? 30000;
          const options = { signal, timeout, maxTotalTimeout: timeout };
          if (config.type === "remote" && config.oauth !== false) {
            oauth = await createMcpOAuth({
              identity: JSON.stringify({ workspace, name, config }),
              config: config.oauth ?? {},
              signal,
              authorize: (url) =>
                consent(
                  `Sign in to MCP server ${safe(name)}? Open authorization URL: ${safe(url)}`,
                  signal,
                ),
            });
            authSessions.add(oauth);
          }
          const RemoteTransport =
            config.transport === "sse" ? SSEClientTransport : StreamableHTTPClientTransport;
          const transport =
            config.type === "local"
              ? new StdioClientTransport({
                  command: config.command[0],
                  args: config.command.slice(1),
                  cwd: path.resolve(workspace, config.cwd ?? "."),
                  env: config.environment,
                  stderr: "ignore",
                  maxBufferSize: 1024 * 1024,
                })
              : new RemoteTransport(new URL(config.url), {
                  requestInit: { headers: config.headers },
                  authProvider: oauth?.provider,
                  reconnectionOptions: { maxRetries: 0 },
                });
          try {
            await client.connect(transport, options);
          } catch (error) {
            if (!(error instanceof UnauthorizedError) || !oauth) throw error;
            await transport.finishAuth(await oauth.waitForCode());
            await client.connect(transport, options);
          } finally {
            oauth?.close();
            authSessions.delete(oauth);
          }
          let cursor;
          const cursors = new Set();
          let count = 0;
          let pages = 0;
          do {
            if (++pages > 256) throw new Error("Too many MCP discovery pages.");
            const page = await client.listTools(cursor ? { cursor } : {}, options);
            for (const tool of page.tools) {
              if (++count > 256) throw new Error("Too many MCP tools.");
              const suffix = createHash("sha256")
                .update(`${name}\0${tool.name}`)
                .digest("hex")
                .slice(0, 24);
              const toolName = `mcp_${name.slice(0, 24)}_${suffix}`;
              if (definitions[toolName]) throw new Error("Duplicate MCP tool.");
              serverKeys.push(toolName);
              definitions[toolName] = {
                description: `MCP ${name}/${safe(tool.name)} (untrusted external tool). ${safe(tool.description ?? "")}`,
                params: tool.inputSchema,
                async handler(args, { signal: callSignal } = {}) {
                  if (
                    !(await consent(
                      `Allow MCP call ${safe(name)}/${safe(tool.name)}? Arguments: ${safe(JSON.stringify(args))}. The server may access external data or perform changes.`,
                      callSignal,
                    ))
                  )
                    return { ok: false, output: "MCP call denied or cancelled." };
                  const result = await client.callTool(
                    { name: tool.name, arguments: args },
                    undefined,
                    { signal: callSignal, timeout, maxTotalTimeout: timeout },
                  );
                  const parts = (result.content ?? []).map((part) =>
                    part.type === "text"
                      ? part.text
                      : `[Unsupported MCP content: ${safe(part.type)}]`,
                  );
                  if (result.structuredContent)
                    parts.push(JSON.stringify(result.structuredContent));
                  return {
                    ok: !result.isError,
                    output: bounded(
                      `Untrusted MCP result (${name}/${tool.name}):\n${parts.join("\n")}`,
                    ),
                  };
                },
              };
            }
            cursor = page.nextCursor;
            if (cursor && cursors.has(cursor)) throw new Error("Repeated MCP pagination cursor.");
            if (cursor) cursors.add(cursor);
          } while (cursor);
        } catch {
          oauth?.close();
          authSessions.delete(oauth);
          for (const key of serverKeys) delete definitions[key];
          await client.close().catch(() => {});
          active.delete(client);
          onError(
            `MCP server ${safe(name)} unavailable. Check its configuration, authentication and connectivity.`,
          );
        }
      }
      return { definitions, close };
    } catch (error) {
      await close();
      throw error;
    }
  }
  return {
    discover,
    async dispose() {
      for (const session of authSessions) session.close();
      authSessions.clear();
      await Promise.all([...active].map((client) => client.close().catch(() => {})));
      active.clear();
    },
  };
}
