import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Match the ChatGPT/Codex OAuth client and redirect used by Pi and Codex CLI.
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const REDIRECT_URI = "http://localhost:1455/auth/callback";
const SCOPE = "openid profile email offline_access";

function createPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function accountIdFromAccessToken(token) {
  const payloadPart = token.split(".")[1];
  if (!payloadPart)
    throw new Error("Codex OAuth access token did not contain account information.");
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    throw new Error("Could not read account information from the Codex OAuth token.");
  }
  const accountId = payload?.["https://api.openai.com/auth"]?.chatgpt_account_id;
  if (typeof accountId !== "string" || !accountId)
    throw new Error("Codex OAuth token did not include a ChatGPT account ID.");
  return accountId;
}

async function readTokenResponse(response, operation) {
  if (!response.ok) {
    let code = "unknown_error";
    try {
      const body = await response.json();
      code = typeof body.error === "string" ? body.error : code;
    } catch {
      // Do not surface remote response bodies or credentials in diagnostics.
    }
    throw new Error(`OpenAI Codex token ${operation} failed (${response.status}, ${code}).`);
  }
  const tokens = await response.json();
  if (
    !tokens?.access_token ||
    !tokens.refresh_token ||
    typeof tokens.expires_in !== "number" ||
    tokens.expires_in <= 0
  )
    throw new Error(`OpenAI Codex token ${operation} returned incomplete credentials.`);
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
    account_id: accountIdFromAccessToken(tokens.access_token),
  };
}

export function createOpenAICodexAuth({
  credentialsPath,
  fetchImpl = fetch,
  now = () => Date.now(),
}) {
  let credentials;
  let pendingAuthorization;
  let refreshInFlight;

  async function load() {
    if (credentials !== undefined) return credentials;
    try {
      const parsed = JSON.parse(await readFile(credentialsPath, "utf8"));
      if (
        parsed?.provider !== "openai-codex" ||
        typeof parsed.access_token !== "string" ||
        typeof parsed.refresh_token !== "string" ||
        typeof parsed.account_id !== "string" ||
        !Number.isFinite(parsed.expires_at)
      )
        throw new Error("Saved OpenAI Codex credentials are incomplete.");
      credentials = parsed;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      credentials = null;
    }
    return credentials;
  }

  async function save(nextCredentials) {
    const directory = path.dirname(credentialsPath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${credentialsPath}.${process.pid}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(nextCredentials, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporaryPath, credentialsPath);
      credentials = nextCredentials;
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  async function startAuthorization() {
    const { verifier, challenge } = createPkce();
    const state = randomBytes(16).toString("hex");
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: SCOPE,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      originator: "xarab",
    }).toString();
    pendingAuthorization = { verifier, state, expiresAt: now() + 10 * 60 * 1000 };
    return { authorizationUrl: url.toString(), redirectUri: REDIRECT_URI };
  }

  async function completeAuthorization(input) {
    const pending = pendingAuthorization;
    pendingAuthorization = undefined;
    if (!pending || pending.expiresAt <= now())
      throw new Error("No active sign-in attempt. Run /openai login again.");

    let code;
    let returnedState;
    try {
      const callback = new URL(input);
      if (
        callback.origin !== new URL(REDIRECT_URI).origin ||
        callback.pathname !== new URL(REDIRECT_URI).pathname
      )
        throw new Error("Paste the full URL from the browser's localhost redirect.");
      if (callback.searchParams.has("error")) {
        const error = callback.searchParams.get("error");
        if (error === "access_denied") throw new Error("OpenAI sign-in was cancelled.");
        const description = callback.searchParams
          .get("error_description")
          ?.replace(/[\u0000-\u001f\u007f]/g, " ")
          .slice(0, 240);
        throw new Error(
          `OpenAI sign-in failed (${error || "unknown_error"})${description ? `: ${description}` : "."}`,
        );
      }
      code = callback.searchParams.get("code");
      returnedState = callback.searchParams.get("state");
    } catch (error) {
      if (error instanceof TypeError)
        throw new Error("Paste the full URL from the browser's localhost redirect.");
      throw error;
    }
    if (!code) throw new Error("The pasted redirect URL did not contain an authorization code.");
    if (returnedState !== pending.state)
      throw new Error("OpenAI sign-in state did not match. Start a new sign-in.");

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      code_verifier: pending.verifier,
      redirect_uri: REDIRECT_URI,
    });
    const response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const tokens = await readTokenResponse(response, "exchange");
    await save({ provider: "openai-codex", ...tokens, saved_at: new Date(now()).toISOString() });
    return { accountId: tokens.account_id };
  }

  async function getCredentials() {
    const current = await load();
    if (!current) throw new Error("Sign in first with /openai login.");
    if (current.expires_at > now() + 60_000) return current;
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: current.refresh_token,
        client_id: CLIENT_ID,
      });
      const response = await fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      const tokens = await readTokenResponse(response, "refresh");
      if (tokens.account_id !== current.account_id)
        throw new Error("Refreshed Codex OAuth token belongs to a different ChatGPT account.");
      const next = {
        provider: "openai-codex",
        ...tokens,
        saved_at: new Date(now()).toISOString(),
      };
      await save(next);
      return next;
    })();
    try {
      return await refreshInFlight;
    } finally {
      refreshInFlight = undefined;
    }
  }

  async function getStatus() {
    const current = await load();
    return current
      ? { connected: true, accountId: current.account_id, expiresAt: current.expires_at }
      : { connected: false };
  }

  async function signOut() {
    pendingAuthorization = undefined;
    await rm(credentialsPath, { force: true });
    credentials = null;
    return { signedOut: true, revoked: false };
  }

  return {
    startAuthorization,
    completeAuthorization,
    getCredentials,
    getStatus,
    signOut,
    hasPendingAuthorization: () => Boolean(pendingAuthorization),
  };
}

export const CODEX_OAUTH_REDIRECT_URI = REDIRECT_URI;
