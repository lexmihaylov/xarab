import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

export async function createMcpOAuth({
  identity,
  config = {},
  directory = path.join(os.homedir(), ".xarab", "auth", "mcp"),
  signal,
  authorize = async () => false,
  openBrowser = launchBrowser,
}) {
  const file = path.join(directory, `${createHash("sha256").update(identity).digest("hex")}.json`);
  let saved = {};
  try {
    saved = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("Cannot read MCP credentials.");
  }
  const persist = async () => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${file}.${randomBytes(8).toString("hex")}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(saved), { mode: 0o600, flag: "wx" });
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
  };
  const state = randomBytes(32).toString("hex");
  let verifier;
  let server;
  let codePromise;
  let rejectCode;
  const redirectUrl = `http://127.0.0.1:${config.callbackPort ?? 19847}/callback`;
  let timer;
  let closed = false;
  const abort = () => {
    rejectCode?.(new Error("MCP sign-in cancelled."));
    server?.close();
  };
  async function listen() {
    codePromise = new Promise((resolve, reject) => {
      rejectCode = reject;
      server = createServer((req, res) => {
        const url = new URL(req.url, "http://127.0.0.1");
        if (url.pathname !== "/callback" || url.searchParams.get("state") !== state) {
          res.writeHead(400).end("Invalid callback.");
          return;
        }
        const code = url.searchParams.get("code");
        if (!code || url.searchParams.has("error")) {
          res.writeHead(400).end("Sign-in failed.");
          reject(new Error("MCP sign-in failed."));
          return;
        }
        res
          .writeHead(200, { "Content-Type": "text/plain" })
          .end("Signed in. You may close this window.");
        resolve(code);
      });
    });
    codePromise.catch(() => {});
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.callbackPort ?? 19847, "127.0.0.1", resolve);
    });
    timer = setTimeout(() => {
      rejectCode(new Error("MCP sign-in timed out."));
      server.close();
      server.closeAllConnections();
    }, 120000);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  }
  return {
    provider: {
      get redirectUrl() {
        return redirectUrl;
      },
      get clientMetadata() {
        return {
          client_name: "Xarab",
          redirect_uris: [redirectUrl],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: config.clientSecret ? "client_secret_post" : "none",
          ...(config.scope ? { scope: config.scope } : {}),
        };
      },
      state: () => state,
      clientInformation: () =>
        config.clientId
          ? {
              client_id: config.clientId,
              ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
            }
          : saved.client,
      async saveClientInformation(client) {
        saved.client = client;
        await persist();
      },
      tokens: () => saved.tokens,
      async saveTokens(tokens) {
        saved.tokens = tokens;
        await persist();
      },
      saveCodeVerifier(value) {
        verifier = value;
      },
      codeVerifier() {
        if (!verifier) throw new Error("Missing MCP PKCE verifier.");
        return verifier;
      },
      async redirectToAuthorization(url) {
        if (closed) throw new Error("MCP requires sign-in again; retry the request.");
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
          throw new Error("Invalid MCP authorization URL.");
        if (!(await authorize(url.toString())) || signal?.aborted)
          throw new Error("MCP sign-in denied.");
        if (!server?.listening) await listen();
        await openBrowser(url.toString());
      },
      async invalidateCredentials(scope) {
        if (scope === "all" || scope === "tokens") delete saved.tokens;
        if (scope === "all" || scope === "client") delete saved.client;
        if (scope === "all" || scope === "verifier") verifier = undefined;
        await persist();
      },
    },
    waitForCode: () => codePromise,
    close() {
      closed = true;
      rejectCode?.(new Error("MCP sign-in closed."));
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      server?.close();
      server?.closeAllConnections();
    },
  };
}

export async function logoutMcpOAuth(directory = path.join(os.homedir(), ".xarab", "auth", "mcp")) {
  await rm(directory, { recursive: true, force: true });
}

function launchBrowser(url) {
  return new Promise((resolve, reject) => {
    const command =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "rundll32"
          : "xdg-open";
    const child = spawn(
      command,
      process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url],
      { stdio: "ignore" },
    );
    child.once("error", () => reject(new Error("Cannot open browser for MCP sign-in.")));
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Cannot open browser for MCP sign-in.")),
    );
  });
}
