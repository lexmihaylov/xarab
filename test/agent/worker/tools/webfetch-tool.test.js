import test from "node:test";
import assert from "node:assert/strict";
import { createWebfetchTool } from "../../../../src/agent/worker/tools/web-fetch-tool.js";

function response(body, { status = 200, contentType = "text/html; charset=utf-8", location } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name === "content-type" ? contentType : name === "location" ? location : null;
      },
    },
    async text() {
      return body;
    },
  };
}

test("fetches public URLs and converts HTML to bounded readable text", async () => {
  let requestedUrl;
  const events = [];
  const tool = createWebfetchTool({
    fetchImpl: async (url, options) => {
      requestedUrl = [url.href, options];
      return response(
        "<html><head><title>Hidden</title></head><body><h1>Hello&nbsp;world</h1><script>ignore me</script><p>A &amp; B</p></body></html>",
      );
    },
    onEvent: (event) => events.push(event),
  });
  const result = await tool.handler({ url: "https://example.com/page#fragment" });
  assert.equal(requestedUrl[0], "https://example.com/page");
  assert.equal(requestedUrl[1].redirect, "manual");
  assert.match(result, /Hello world/);
  assert.match(result, /A & B/);
  assert.doesNotMatch(result, /Hidden|ignore me|<script/);
  assert.equal(events.at(-1).type, "fetched");
});

test("rejects unsafe URLs before requesting", async () => {
  let calls = 0;
  const tool = createWebfetchTool({
    fetchImpl: async () => {
      calls += 1;
    },
  });
  for (const url of [
    "file:///etc/passwd",
    "http://localhost/",
    "http://127.0.0.1/",
    "http://192.168.1.1/",
    "https://user:pass@example.com",
  ]) {
    assert.match(await tool.handler({ url }), /Error:/);
  }
  assert.equal(calls, 0);
});

test("checks redirect destinations and follows safe redirects", async () => {
  const urls = [];
  const tool = createWebfetchTool({
    requestApproval: async () => true,
    fetchImpl: async (url) => {
      urls.push(url.href);
      return urls.length === 1
        ? response("", { status: 302, location: "https://example.com/final" })
        : response("Plain content", { contentType: "text/plain" });
    },
  });
  const result = await tool.handler({ url: "https://example.com/start" });
  assert.deepEqual(urls, ["https://example.com/start", "https://example.com/final"]);
  assert.match(result, /Plain content/);

  const unsafe = createWebfetchTool({
    requestApproval: async () => true,
    fetchImpl: async () => response("", { status: 302, location: "http://127.0.0.1/admin" }),
  });
  assert.match(await unsafe.handler({ url: "https://example.com" }), /local and private network/);
});

test("bounds body and rejects unsupported or failed responses", async () => {
  const bounded = createWebfetchTool({
    maxResponseBytes: 24,
    requestApproval: async () => true,
    fetchImpl: async () => response("x".repeat(100), { contentType: "text/plain" }),
  });
  const result = await bounded.handler({ url: "https://example.com" });
  assert.match(result, /truncated/);
  assert.ok(result.length < 300);

  const binary = createWebfetchTool({
    requestApproval: async () => true,
    fetchImpl: async () => response("", { contentType: "application/octet-stream" }),
  });
  assert.match(
    await binary.handler({ url: "https://example.com/file" }),
    /Unsupported content type/,
  );

  const missing = createWebfetchTool({
    requestApproval: async () => true,
    fetchImpl: async () => response("", { status: 404 }),
  });
  assert.match(await missing.handler({ url: "https://example.com/missing" }), /HTTP 404/);
});
