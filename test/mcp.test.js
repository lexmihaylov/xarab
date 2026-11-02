import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { loadMcpConfig } from "../src/agent/worker/mcp-config.js";
import { createMcpClient } from "../src/agent/worker/mcp-client.js";
test("task MCP selection filters servers before consent or connection", async (t) => {
  const { workspace, save } = await fixture(t);
  await save({ unselected: { type: "local", command: ["/must-not-start"] } });
  const errors = [];
  let approvals = 0;
  const client = createMcpClient({
    workspace,
    configStore: { get: () => ({ mcp: {} }) },
    requestQuestions: async () => {
      approvals++;
      return answer(true);
    },
    onError: (error) => errors.push(error),
  });
  t.after(() => client.dispose());
  const connection = await client.discover({ servers: [] });
  assert.deepEqual(connection.definitions, {});
  assert.equal(approvals, 0);
  assert.deepEqual(errors, []);
  await connection.close();
  await assert.rejects(client.discover({ servers: "bad" }), /array/);
});

test("failed servers are isolated and aborted discovery rejects", async (t) => {
  const { workspace } = await fixture(t);
  const errors = [];
  const client = createMcpClient({
    workspace,
    configStore: {
      get: () => ({
        mcp: {
          broken: { type: "local", command: ["/nonexistent/xarab-mcp-server"] },
          good: config,
        },
      }),
    },
    onError: (message) => errors.push(message),
  });
  t.after(() => client.dispose());
  const connection = await client.discover();
  assert.equal(errors.length, 1);
  assert.equal(Object.keys(connection.definitions).length, 1);
  await connection.close();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.discover({ signal: controller.signal }));
});

async function fixture(t) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "xarab-mcp-"));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  await mkdir(path.join(workspace, ".xarab"));
  const save = (mcp) =>
    writeFile(path.join(workspace, ".xarab", "mcp.json"), JSON.stringify({ mcp }));
  return { workspace, save };
}
const config = {
  type: "local",
  command: [process.execPath, fileURLToPath(new URL("./fixtures/mcp-server.mjs", import.meta.url))],
};
const answer = (approve) => ({
  cancelled: false,
  answers: [{ id: "mcp_approval", choices: [approve ? "Approve" : "Deny"] }],
});

test("Streamable HTTP discovers and invokes tools with configured headers", async (t) => {
  const { workspace } = await fixture(t);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => "fixture-session",
    enableJsonResponse: true,
  });
  const server = new Server(
    { name: "http-fixture", version: "1" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{ name: "ping", inputSchema: { type: "object" } }],
  }));
  server.setRequestHandler(CallToolRequestSchema, async () => ({
    content: [{ type: "text", text: "pong" }],
  }));
  await server.connect(transport);
  const http = createServer((req, res) => {
    if (req.headers.authorization !== "Bearer fixture") {
      res.writeHead(401).end();
      return;
    }
    transport.handleRequest(req, res).catch(() => {
      if (!res.writableEnded) res.writeHead(500).end();
    });
  });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await server.close();
    http.closeAllConnections();
    await new Promise((resolve) => http.close(resolve));
  });
  const client = createMcpClient({
    workspace,
    configStore: {
      get: () => ({
        mcp: {
          remote: {
            type: "remote",
            url: `http://127.0.0.1:${http.address().port}/mcp`,
            headers: { Authorization: "Bearer fixture" },
          },
        },
      }),
    },
    requestQuestions: async () => answer(true),
  });
  const connection = await client.discover();
  t.after(() => client.dispose());
  assert.match((await Object.values(connection.definitions)[0].handler({})).output, /pong/);
  await connection.close();
});

test("legacy SSE discovers and calls tools", async (t) => {
  const { workspace } = await fixture(t);
  const server = new Server({ name: "sse-fixture", version: "1" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{ name: "ping", inputSchema: { type: "object" } }],
  }));
  server.setRequestHandler(CallToolRequestSchema, async () => ({
    content: [{ type: "text", text: "sse-pong" }],
  }));
  let transport;
  const http = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/sse") {
      transport = new SSEServerTransport("/messages", res);
      server.connect(transport).catch(() => res.end());
    } else if (req.method === "POST" && transport) {
      transport.handlePostMessage(req, res).catch(() => res.end());
    } else res.writeHead(404).end();
  });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await server.close();
    http.closeAllConnections();
    await new Promise((resolve) => http.close(resolve));
  });
  const client = createMcpClient({
    workspace,
    configStore: {
      get: () => ({
        mcp: {
          legacy: {
            type: "remote",
            transport: "sse",
            url: `http://127.0.0.1:${http.address().port}/sse`,
            oauth: false,
          },
        },
      }),
    },
    requestQuestions: async () => answer(true),
  });
  t.after(() => client.dispose());
  const connection = await client.discover();
  assert.match((await Object.values(connection.definitions)[0].handler({})).output, /sse-pong/);
  await connection.close();
});

test("SSE OAuth challenge reconnects with a fresh transport", async (t) => {
  const { workspace } = await fixture(t);
  const server = new Server({ name: "oauth-sse", version: "1" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{ name: "ping", inputSchema: { type: "object" } }],
  }));
  server.setRequestHandler(CallToolRequestSchema, async () => ({
    content: [{ type: "text", text: "authenticated" }],
  }));
  let transport;
  let base;
  let challenged = false;
  let tokenExchanged = false;
  const json = (res, body) =>
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
  const http = createServer((req, res) => {
    if (req.url.includes("oauth-protected-resource"))
      return json(res, { resource: `${base}/sse`, authorization_servers: [base] });
    if (req.url.includes(".well-known/"))
      return json(res, {
        issuer: base,
        authorization_endpoint: `${base}/authorize`,
        token_endpoint: `${base}/token`,
        response_types_supported: ["code"],
        code_challenge_methods_supported: ["S256"],
      });
    if (req.url === "/token") {
      tokenExchanged = true;
      return json(res, { access_token: "fixture-token", token_type: "Bearer" });
    }
    if (req.headers.authorization !== "Bearer fixture-token") {
      challenged = true;
      res.writeHead(401).end();
      return;
    }
    if (req.method === "GET" && req.url === "/sse") {
      transport = new SSEServerTransport("/messages", res);
      server.connect(transport).catch(() => res.end());
    } else if (req.method === "POST" && transport)
      transport.handlePostMessage(req, res).catch(() => res.end());
    else res.writeHead(404).end();
  });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${http.address().port}`;
  t.after(async () => {
    await server.close();
    http.closeAllConnections();
    http.close();
  });
  let tokens;
  let verifier;
  let redirected = false;
  const errors = [];
  const client = createMcpClient({
    workspace,
    configStore: {
      get: () => ({
        mcp: { authenticated: { type: "remote", transport: "sse", url: `${base}/sse` } },
      }),
    },
    requestQuestions: async () => answer(true),
    onError: (error) => errors.push(error),
    oauthFactory: async () => ({
      provider: {
        redirectUrl: "http://127.0.0.1:19847/callback",
        clientMetadata: {
          redirect_uris: ["http://127.0.0.1:19847/callback"],
          token_endpoint_auth_method: "none",
        },
        clientInformation: () => ({ client_id: "fixture-client" }),
        tokens: () => tokens,
        saveTokens: (value) => {
          tokens = value;
        },
        saveCodeVerifier: (value) => {
          verifier = value;
        },
        codeVerifier: () => verifier,
        redirectToAuthorization: async () => {
          redirected = true;
        },
      },
      waitForCode: async () => "fixture-code",
      close() {},
    }),
  });
  t.after(() => client.dispose());
  const connection = await client.discover();
  assert.deepEqual(errors, []);
  assert.ok(challenged && redirected && tokenExchanged);
  assert.match(
    (await Object.values(connection.definitions)[0].handler({})).output,
    /authenticated/,
  );
  await connection.close();
});

test("invalid entries and malformed workspace files do not disable other tools", async (t) => {
  const { workspace, save } = await fixture(t);
  await save({ broken: { type: "local", command: [] } });
  const errors = [];
  const client = createMcpClient({
    workspace,
    configStore: { get: () => ({ mcp: { good: config } }) },
    onError: (error) => errors.push(error),
  });
  t.after(() => client.dispose());
  let connection = await client.discover();
  assert.equal(Object.keys(connection.definitions).length, 1);
  await connection.close();
  await writeFile(path.join(workspace, ".xarab", "mcp.json"), "{");
  connection = await client.discover();
  assert.equal(Object.keys(connection.definitions).length, 1);
  await connection.close();
  assert.equal(errors.length, 2);
});

test("stalled SSE startup times out and responds to cancellation", async (t) => {
  const { workspace } = await fixture(t);
  let received;
  const http = createServer(() => received?.());
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    http.closeAllConnections();
    http.close();
  });
  const errors = [];
  const client = createMcpClient({
    workspace,
    configStore: {
      get: () => ({
        mcp: {
          stalled: {
            type: "remote",
            transport: "sse",
            oauth: false,
            url: `http://127.0.0.1:${http.address().port}/sse`,
            timeout: 100,
          },
        },
      }),
    },
    onError: (error) => errors.push(error),
  });
  t.after(() => client.dispose());
  const connection = await client.discover();
  assert.deepEqual(connection.definitions, {});
  assert.equal(errors.length, 1);
  const controller = new AbortController();
  const started = new Promise((resolve) => {
    received = resolve;
  });
  const pending = client.discover({ signal: controller.signal });
  await started;
  controller.abort(new Error("test cancellation"));
  await assert.rejects(pending, /test cancellation/);
});

test("workspace entries replace global entries, preserving distinct servers", async (t) => {
  const { workspace, save } = await fixture(t);
  await save({ shared: { enabled: false } });
  const entries = await loadMcpConfig(workspace, { shared: config, other: config });
  assert.deepEqual(entries[0].config, { enabled: false });
  assert.equal(entries[0].workspaceDefined, true);
  assert.equal(entries[1].workspaceDefined, false);
  await save({ bad: { type: "local", command: [] } });
  await assert.rejects(loadMcpConfig(workspace), /Invalid MCP server/);
  await save({ shared: { type: "local", command: [] } });
  const errors = [];
  const isolated = await loadMcpConfig(workspace, { shared: config, other: config }, (error) =>
    errors.push(error),
  );
  assert.deepEqual(
    isolated.map((entry) => entry.name),
    ["other"],
  );
  assert.equal(errors.length, 1);
});

test("stdio discovery, call approval, bounded output and cleanup", async (t) => {
  const { workspace } = await fixture(t);
  let allow = false;
  const client = createMcpClient({
    workspace,
    configStore: { get: () => ({ mcp: { echo: config } }) },
    requestQuestions: async () => answer(allow),
  });
  t.after(() => client.dispose());
  const connection = await client.discover();
  t.after(connection.close);
  const [[name, tool]] = Object.entries(connection.definitions);
  assert.match(name, /^mcp_echo_/);
  assert.equal((await tool.handler({ text: "hello" })).ok, false);
  allow = true;
  assert.match((await tool.handler({ text: "hello" })).output, /hello/);
  const long = await tool.handler({ text: "x".repeat(20000) });
  assert.match(long.output, /truncated/);
  assert.ok(long.output.length < 17000);
});

test("workspace activation is explicit, remembered and invalidated by changes", async (t) => {
  const { workspace, save } = await fixture(t);
  await save({ echo: config });
  let allow = false;
  let prompts = 0;
  const client = createMcpClient({
    workspace,
    configStore: { get: () => ({}) },
    requestQuestions: async () => {
      prompts++;
      return answer(allow);
    },
  });
  t.after(() => client.dispose());
  assert.deepEqual((await client.discover()).definitions, {});
  allow = true;
  await (await client.discover()).close();
  await (await client.discover()).close();
  assert.equal(prompts, 2);
  await save({ echo: { ...config, timeout: 1000 } });
  await (await client.discover()).close();
  assert.equal(prompts, 3);
});

test("cancelled and unavailable approval never starts workspace servers", async (t) => {
  const { workspace, save } = await fixture(t);
  await save({ echo: config });
  for (const requestQuestions of [undefined, async () => ({ cancelled: true, answers: [] })]) {
    const client = createMcpClient({
      workspace,
      configStore: { get: () => ({}) },
      requestQuestions,
    });
    assert.deepEqual((await client.discover()).definitions, {});
    await client.dispose();
  }
});
