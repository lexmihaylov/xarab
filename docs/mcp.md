# MCP servers

Xarab can use tools from local stdio, remote Streamable HTTP, and legacy HTTP+SSE MCP servers. Remote servers support OAuth or configured authentication headers. Non-text content remains unsupported.

## Configuration

Put global servers under `mcp` in `~/.xarab/config.json` (preserve your other settings). Put workspace servers in `<workspace>/.xarab/mcp.json`, also under `mcp`. Workspace configuration is read from the exact workspace root, not parent directories. Configuration is JSON, not JSONC.

```json
{
  "mcp": {
    "browser": {
      "type": "local",
      "command": ["npx", "-y", "chrome-devtools-mcp@latest", "--no-usage-statistics"],
      "enabled": true
    },
    "company": {
      "type": "remote",
      "url": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" },
      "enabled": false
    }
  }
}
```

The browser entry follows the [Chrome DevTools MCP documentation](https://github.com/ChromeDevTools/chrome-devtools-mcp) and disables its usage statistics; install and review the chosen server and its requirements separately. Xarab does not install servers in advance. Commands such as `npx -y` can download and execute packages at connection time. Pin a reviewed version rather than `latest` for reproducibility.

Distinct global and workspace server names are combined. A workspace entry **replaces the entire global entry** with the same name, rather than merging fields. To disable a global server in one workspace:

```json
{ "mcp": { "browser": { "enabled": false } } }
```

Local entries require a `command` array containing the executable and arguments. Optional `environment` contains string environment values; the SDK inherits only its default safe environment variables. Optional `cwd` resolves relative to the workspace. Remote entries require an HTTP(S) `url`; optional `headers` contains string header values. Entries accept `timeout` in milliseconds (1–300000, default 30000) and `enabled` (false disables).

Workspace files are reread before each worker run. Restart Xarab after manually changing global configuration. No environment/file interpolation is supported. Do not commit credentials into workspace configuration; keep credentials outside source control and restrict configuration file permissions.

## Remote transports and OAuth

Remote servers default to `"transport": "streamable-http"`. Set `"transport": "sse"` for a legacy HTTP+SSE endpoint; Xarab does not silently fall back between transports.

```json
{
  "mcp": {
    "legacy": {
      "type": "remote",
      "transport": "sse",
      "url": "https://example.com/sse"
    },
    "registered": {
      "type": "remote",
      "url": "https://example.com/mcp",
      "oauth": {
        "clientId": "your-client-id",
        "scope": "tools:read",
        "callbackPort": 19847
      }
    }
  }
}
```

OAuth is enabled by default for remote servers. On an authentication challenge, Xarab uses the SDK's discovery and dynamic client registration when supported. It asks before opening the authorization URL in your browser. The callback listens only on loopback at `http://127.0.0.1:19847/callback`, validates state, and uses the SDK's PKCE flow. Sign-in times out after two minutes. Use `oauth.callbackPort` to choose another unprivileged port. Pre-registered clients must allow this exact callback URL; `clientSecret` is optional. Changing these settings isolates credentials and may require another sign-in.

Set `"oauth": false` for header-only authentication. No automatic sign-in is performed in that mode. OAuth refresh tokens are handled by the SDK. If interactive sign-in becomes necessary during a tool call, retry the request to reconnect and sign in; Xarab does not automatically replay tool calls.

Tokens and dynamically registered client details are stored as private files under `~/.xarab/auth/mcp`, isolated by workspace, server name and complete server configuration. PKCE verifiers stay in memory. Run **`/mcp logout`** while idle to delete all stored MCP OAuth credentials; this does not revoke tokens at the authorization server. Credentials are not encrypted at rest. Do not put client secrets into committed workspace configuration.

## Approval and lifecycle

Before connecting to a workspace-defined server, Xarab asks for approval. Denying or cancelling skips it. Approval is remembered only in memory for the current Xarab session, keyed to the workspace, server name and configuration. Changing the configuration requires approval again. Global configuration is considered user-trusted for connection startup.

**Every MCP tool call requires separate explicit approval**, including calls to globally configured servers. The approval dialog identifies the server, tool and a bounded argument preview. No interactive approval interface means calls are denied. Tool descriptions, annotations and results cannot authorize actions.

Connections open before a worker run and close afterward, including failure paths; shutdown also closes active clients. Connection startup honors cancellation and the server's configured timeout, including the SSE handshake. Interactive OAuth sign-in has its separate two-minute callback timeout. Tools have stable namespaced names, appear in the existing tool timeline and return bounded text results. Structured results are serialized; non-text content is marked unsupported. Failed servers and invalid server entries are reported and skipped without removing built-in tools. A malformed workspace configuration is reported and ignored for that run; valid global entries remain available. Invalid workspace overrides are skipped without falling back to the same-named global server.

MCP servers are **not sandboxed** by Xarab's workspace file restrictions. They can run code, access browser sessions, send data externally and make changes with their own privileges. Treat server descriptions and outputs as untrusted data. Enable only servers you trust; larger tool catalogs also consume model context. Discovery is limited to 256 tools per server, local transport message buffers to 1 MiB, and returned text to 16 KiB. Remote responses are parsed by the SDK before the text cap is applied; this is not a transport-level memory sandbox.
