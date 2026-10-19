import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CODEX_OAUTH_REDIRECT_URI, createOpenAICodexAuth } from "../src/agent/openai-codex-auth.js";

const TOKEN_URL = "https://auth.openai.com/oauth/token";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

function accessToken(accountId) {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      "https://api.openai.com/auth": { chatgpt_account_id: accountId },
    }),
  ).toString("base64url");
  return `${header}.${payload}.test-signature`;
}

async function withCredentialsPath(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xarab-codex-oauth-"));
  try {
    await run(path.join(directory, "auth", "openai-chatgpt.json"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("builds the Pi-compatible Codex OAuth URL for manual localhost callback paste", async () => {
  await withCredentialsPath(async (credentialsPath) => {
    const auth = createOpenAICodexAuth({ credentialsPath });
    const result = await auth.startAuthorization();
    const url = new URL(result.authorizationUrl);

    assert.equal(url.origin + url.pathname, "https://auth.openai.com/oauth/authorize");
    assert.equal(url.searchParams.get("client_id"), CLIENT_ID);
    assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:1455/auth/callback");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("scope"), "openid profile email offline_access");
    assert.equal(url.searchParams.get("codex_cli_simplified_flow"), "true");
    assert.equal(url.searchParams.get("id_token_add_organizations"), "true");
    assert.equal(url.searchParams.get("originator"), "xarab");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.match(url.searchParams.get("code_challenge"), /^[A-Za-z0-9_-]{43}$/);
    assert.ok(url.searchParams.get("state"));
    assert.equal(result.redirectUri, CODEX_OAUTH_REDIRECT_URI);
  });
});

test("pasted redirect URL exchanges the code and stores Codex tokens privately", async () => {
  await withCredentialsPath(async (credentialsPath) => {
    let capturedBody;
    const auth = createOpenAICodexAuth({
      credentialsPath,
      fetchImpl: async (url, options) => {
        assert.equal(String(url), TOKEN_URL);
        capturedBody = new URLSearchParams(options.body);
        return Response.json({
          access_token: accessToken("account-123"),
          refresh_token: "refresh-secret",
          expires_in: 3600,
        });
      },
    });
    const authorization = await auth.startAuthorization();
    const state = new URL(authorization.authorizationUrl).searchParams.get("state");

    const result = await auth.completeAuthorization(
      `http://localhost:1455/auth/callback?code=authorization-code&state=${state}`,
    );

    assert.deepEqual(result, { accountId: "account-123" });
    assert.equal(capturedBody.get("grant_type"), "authorization_code");
    assert.equal(capturedBody.get("client_id"), CLIENT_ID);
    assert.equal(capturedBody.get("code"), "authorization-code");
    assert.ok(capturedBody.get("code_verifier"));
    assert.equal(capturedBody.get("redirect_uri"), CODEX_OAUTH_REDIRECT_URI);
    assert.equal(capturedBody.has("resource"), false);
    const saved = JSON.parse(await readFile(credentialsPath, "utf8"));
    assert.equal(saved.provider, "openai-codex");
    assert.equal(saved.account_id, "account-123");
    assert.equal(saved.refresh_token, "refresh-secret");
    assert.equal((await stat(credentialsPath)).mode & 0o777, 0o600);
    assert.deepEqual(await auth.getStatus(), {
      connected: true,
      accountId: "account-123",
      expiresAt: saved.expires_at,
    });
  });
});

test("rejects a mismatched pasted state without exchanging the code", async () => {
  await withCredentialsPath(async (credentialsPath) => {
    let tokenRequests = 0;
    const auth = createOpenAICodexAuth({
      credentialsPath,
      fetchImpl: async () => {
        tokenRequests++;
        return Response.json({});
      },
    });
    await auth.startAuthorization();
    await assert.rejects(
      auth.completeAuthorization("http://localhost:1455/auth/callback?code=some-code&state=wrong"),
      /state did not match/,
    );
    assert.equal(tokenRequests, 0);
    assert.equal(auth.hasPendingAuthorization(), false);
  });
});

test("reports the OAuth error code and description returned in the redirect", async () => {
  await withCredentialsPath(async (credentialsPath) => {
    const auth = createOpenAICodexAuth({ credentialsPath });
    await auth.startAuthorization();
    await assert.rejects(
      auth.completeAuthorization(
        "http://localhost:1455/auth/callback?error=invalid_request&error_description=Redirect+URI+rejected",
      ),
      /OpenAI sign-in failed \(invalid_request\): Redirect URI rejected/,
    );
  });
});

test("refreshes expiring access and rotating refresh tokens once for concurrent callers", async () => {
  await withCredentialsPath(async (credentialsPath) => {
    let currentTime = 1_800_000_000_000;
    let refreshRequests = 0;
    const auth = createOpenAICodexAuth({
      credentialsPath,
      now: () => currentTime,
      fetchImpl: async (url, options = {}) => {
        assert.equal(String(url), TOKEN_URL);
        const body = new URLSearchParams(options.body);
        if (body.get("grant_type") === "authorization_code")
          return Response.json({
            access_token: accessToken("account-456"),
            refresh_token: "refresh-old",
            expires_in: 3600,
          });
        refreshRequests++;
        assert.equal(body.get("grant_type"), "refresh_token");
        assert.equal(body.get("client_id"), CLIENT_ID);
        assert.equal(body.get("refresh_token"), "refresh-old");
        await new Promise((resolve) => setTimeout(resolve, 5));
        return Response.json({
          access_token: accessToken("account-456"),
          refresh_token: "refresh-new",
          expires_in: 3600,
        });
      },
    });
    const authorization = await auth.startAuthorization();
    const state = new URL(authorization.authorizationUrl).searchParams.get("state");
    await auth.completeAuthorization(
      `http://localhost:1455/auth/callback?code=code&state=${state}`,
    );
    currentTime += 3_600_000;

    const [first, second] = await Promise.all([auth.getCredentials(), auth.getCredentials()]);

    assert.equal(first.access_token, accessToken("account-456"));
    assert.equal(second.access_token, accessToken("account-456"));
    assert.equal(refreshRequests, 1);
    const saved = JSON.parse(await readFile(credentialsPath, "utf8"));
    assert.equal(saved.refresh_token, "refresh-new");
  });
});

test("rejects a refresh token that changes ChatGPT account identity", async () => {
  await withCredentialsPath(async (credentialsPath) => {
    const auth = createOpenAICodexAuth({
      credentialsPath,
      now: () => 1_800_000_000_000,
      fetchImpl: async (_url, options = {}) => {
        const body = new URLSearchParams(options.body);
        if (body.get("grant_type") === "authorization_code")
          return Response.json({
            access_token: accessToken("account-original"),
            refresh_token: "refresh-old",
            expires_in: 3600,
          });
        return Response.json({
          access_token: accessToken("different-account"),
          refresh_token: "refresh-new",
          expires_in: 3600,
        });
      },
    });
    const authorization = await auth.startAuthorization();
    const state = new URL(authorization.authorizationUrl).searchParams.get("state");
    await auth.completeAuthorization(
      `http://localhost:1455/auth/callback?code=code&state=${state}`,
    );

    await assert.rejects(auth.getCredentials(), /different ChatGPT account/);
  });
});

test("logout removes stored tokens locally", async () => {
  await withCredentialsPath(async (credentialsPath) => {
    const auth = createOpenAICodexAuth({
      credentialsPath,
      fetchImpl: async () =>
        Response.json({
          access_token: accessToken("account-789"),
          refresh_token: "refresh-secret",
          expires_in: 3600,
        }),
    });
    const authorization = await auth.startAuthorization();
    const state = new URL(authorization.authorizationUrl).searchParams.get("state");
    await auth.completeAuthorization(
      `http://localhost:1455/auth/callback?code=code&state=${state}`,
    );

    assert.deepEqual(await auth.signOut(), { signedOut: true, revoked: false });
    assert.deepEqual(await auth.getStatus(), { connected: false });
  });
});
