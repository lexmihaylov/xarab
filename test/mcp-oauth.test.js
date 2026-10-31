import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, stat, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { createMcpOAuth, logoutMcpOAuth } from "../src/agent/worker/mcp-oauth.js";

async function setup(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xarab-oauth-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const oauth = await createMcpOAuth({ identity: "test-server", directory, ...options });
  t.after(() => oauth.close());
  return { oauth, directory };
}

test("SDK OAuth exchanges PKCE codes and refreshes saved tokens", async (t) => {
  let authorization;
  const { oauth } = await setup(t, {
    config: { clientId: "registered-client" },
    authorize: async () => true,
    openBrowser: async (url) => {
      authorization = new URL(url);
    },
  });
  const grants = [];
  const fetchFn = async (url, init) => {
    const location = String(url);
    if (location.includes("oauth-protected-resource"))
      return Response.json({
        resource: "https://mcp.example/mcp",
        authorization_servers: ["https://auth.example"],
      });
    if (location.includes(".well-known/"))
      return Response.json({
        issuer: "https://auth.example",
        authorization_endpoint: "https://auth.example/authorize",
        token_endpoint: "https://auth.example/token",
        response_types_supported: ["code"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
      });
    if (location === "https://auth.example/token") {
      const params = new URLSearchParams(init.body);
      grants.push(params.get("grant_type"));
      if (params.get("grant_type") === "authorization_code")
        assert.equal(params.get("code_verifier"), oauth.provider.codeVerifier());
      return Response.json({
        access_token: `access-${grants.length}`,
        refresh_token: "refresh",
        token_type: "Bearer",
        expires_in: 3600,
      });
    }
    return new Response(null, { status: 404 });
  };
  const options = { serverUrl: "https://mcp.example/mcp", fetchFn };
  assert.equal(await auth(oauth.provider, options), "REDIRECT");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorization.searchParams.get("state"), oauth.provider.state());
  assert.equal(await auth(oauth.provider, { ...options, authorizationCode: "code" }), "AUTHORIZED");
  assert.equal(await auth(oauth.provider, options), "AUTHORIZED");
  assert.deepEqual(grants, ["authorization_code", "refresh_token"]);
});

test("OAuth callback validates state; verifier stays in memory", async (t) => {
  let opened;
  const { oauth } = await setup(t, {
    authorize: async () => true,
    openBrowser: async (url) => {
      opened = url;
    },
  });
  const provider = oauth.provider;
  provider.saveCodeVerifier("secret-verifier");
  assert.equal(provider.codeVerifier(), "secret-verifier");
  await provider.redirectToAuthorization(new URL("https://auth.example/authorize"));
  assert.equal(opened, "https://auth.example/authorize");
  const callback = new URL(provider.redirectUrl);
  callback.searchParams.set("state", "wrong");
  callback.searchParams.set("code", "valid-code");
  assert.equal((await fetch(callback)).status, 400);
  callback.searchParams.set("state", provider.state());
  assert.equal((await fetch(callback)).status, 200);
  assert.equal(await oauth.waitForCode(), "valid-code");
});

test("OAuth credentials persist privately, isolate identities, invalidate and logout", async (t) => {
  const { oauth, directory } = await setup(t);
  await oauth.provider.saveClientInformation({ client_id: "client" });
  await oauth.provider.saveTokens({
    access_token: "access",
    token_type: "Bearer",
    refresh_token: "refresh",
  });
  const files = await readdir(directory);
  assert.equal(files.length, 1);
  if (process.platform !== "win32")
    assert.equal((await stat(path.join(directory, files[0]))).mode & 0o777, 0o600);
  const restored = await createMcpOAuth({ identity: "test-server", directory });
  t.after(() => restored.close());
  assert.equal(restored.provider.tokens().refresh_token, "refresh");
  const other = await createMcpOAuth({ identity: "different-server", directory });
  t.after(() => other.close());
  assert.equal(other.provider.tokens(), undefined);
  await restored.provider.invalidateCredentials("tokens");
  assert.equal(restored.provider.tokens(), undefined);
  assert.equal(restored.provider.clientInformation().client_id, "client");
  await logoutMcpOAuth(directory);
  await assert.rejects(readdir(directory), { code: "ENOENT" });
});

test("OAuth denies browser launch without consent and supports callback cancellation", async (t) => {
  const { oauth } = await setup(t, { openBrowser: async () => assert.fail("must not open") });
  await assert.rejects(
    oauth.provider.redirectToAuthorization(new URL("https://auth.example/authorize")),
    /denied/,
  );
  const controller = new AbortController();
  const active = await createMcpOAuth({
    identity: "cancel",
    signal: controller.signal,
    authorize: async () => true,
    openBrowser: async () => {},
  });
  t.after(() => active.close());
  await active.provider.redirectToAuthorization(new URL("https://auth.example/authorize"));
  controller.abort();
  await assert.rejects(active.waitForCode(), /cancelled/);
});
