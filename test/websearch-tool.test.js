import test from "node:test";
import assert from "node:assert/strict";
import { createWebsearchTool } from "../src/agent/tools/websearch-tool.js";

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}

test("requires a Tavily key and validates queries before approval or network calls", async () => {
  let fetchCalls = 0;
  const tool = createWebsearchTool({
    fetchImpl: async () => {
      fetchCalls += 1;
    },
  });
  assert.match(await tool.handler({ query: "   " }), /non-empty web search query/);
  assert.match(
    await tool.handler({ query: "current information" }),
    /Tavily API key is not configured/,
  );
  assert.equal(fetchCalls, 0);
});

test("sends a Tavily search without approval and returns source-linked excerpts", async () => {
  const events = [];
  let approvalCalled = false;
  let request;
  const tool = createWebsearchTool({
    getApiKey: () => "tvly-test-secret",
    requestApproval: async () => {
      approvalCalled = true;
      return false;
    },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response({
        results: [
          {
            title: "Example result",
            url: "https://example.com/article",
            content: "Useful excerpt.",
          },
          { title: "Unsafe scheme", url: "javascript:alert(1)", content: "Must be omitted." },
        ],
      });
    },
    onEvent: (event) => events.push(event),
  });

  const result = await tool.handler({ query: "  current local model news  " });
  assert.equal(approvalCalled, false);
  assert.equal(request.url, "https://api.tavily.com/search");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.authorization, "Bearer tvly-test-secret");
  assert.deepEqual(JSON.parse(request.options.body), {
    query: "current local model news",
    search_depth: "basic",
    max_results: 5,
    include_answer: false,
    include_raw_content: false,
  });
  assert.match(result, /Example result/);
  assert.match(result, /URL: https:\/\/example\.com\/article/);
  assert.match(result, /Useful excerpt/);
  assert.doesNotMatch(result, /javascript:|Must be omitted/);
  assert.equal(
    events.some((event) => event.type === "approval_required"),
    false,
  );
  assert.deepEqual(events.at(-1), {
    type: "searched",
    query: "current local model news",
    results: 1,
  });
});

test("runs without an approval callback", async () => {
  let fetchCalls = 0;
  const tool = createWebsearchTool({
    getApiKey: () => "key",
    fetchImpl: async () => {
      fetchCalls += 1;
      return response({ results: [] });
    },
  });
  assert.match(await tool.handler({ query: "search this" }), /No web results/);
  assert.equal(fetchCalls, 1);
});

test("handles Tavily authorization, rate-limit, and timeout errors safely", async () => {
  for (const [status, expected] of [
    [401, /rejected the API key/],
    [429, /rate limit or credit limit/],
  ]) {
    const tool = createWebsearchTool({
      getApiKey: () => "key",
      requestApproval: async () => true,
      fetchImpl: async () => response({}, status),
    });
    assert.match(await tool.handler({ query: "query" }), expected);
  }

  const timeoutTool = createWebsearchTool({
    getApiKey: () => "key",
    requestApproval: async () => true,
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          { once: true },
        );
      }),
  });
  assert.match(await timeoutTool.handler({ query: "query" }), /timed out/);
});

test("bounds result count and excerpt size", async () => {
  const tool = createWebsearchTool({
    getApiKey: () => "key",
    requestApproval: async () => true,
    fetchImpl: async () =>
      response({
        results: Array.from({ length: 8 }, (_, index) => ({
          title: `Result ${index + 1}`,
          url: `https://example.com/${index}`,
          content: "x".repeat(2_000),
        })),
      }),
  });
  const result = await tool.handler({ query: "many" });
  assert.ok(result.length <= 8 * 1024);
  assert.match(result, /Result 5/);
  assert.doesNotMatch(result, /Result 6/);
  assert.match(result, /…/);
});
