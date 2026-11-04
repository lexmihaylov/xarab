import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import {
  createPublicFetch,
  isPublicAddress,
} from "../../../../src/agent/worker/tools/public-http-fetch.js";
import { createWebfetchTool } from "../../../../src/agent/worker/tools/web-fetch-tool.js";
test("invalid response statuses reject asynchronously and close the stream", async () => {
  let incoming;
  const fetch = createPublicFetch({
    resolve: async () => [{ address: "8.8.8.8", family: 4 }],
    requestImpl: (_url, _options, respond) => {
      const req = new EventEmitter();
      req.end = () =>
        setImmediate(() => {
          incoming = Readable.from([Buffer.from("invalid")]);
          incoming.statusCode = 600;
          incoming.rawHeaders = [];
          respond(incoming);
        });
      return req;
    },
  });
  await assert.rejects(fetch("https://example.com"), /status/);
  assert.equal(incoming.destroyed, true);
});

test("public text can be fetched and paginated with the pinned transport", async () => {
  const tool = createWebfetchTool({
    fetchImpl: createPublicFetch({
      resolve: async () => [{ address: "8.8.8.8", family: 4 }],
      requestImpl: transport(),
    }),
  });
  assert.match(
    await tool.handler({ url: "https://example.com", limit: 6 }),
    /public\nMore converted content available; continue with offset: 6/,
  );
  assert.match(await tool.handler({ url: "https://example.com", offset: 7 }), /content/);
});

test("redirects to approved destinations succeed with a fresh DNS check", async () => {
  const hosts = [];
  let count = 0;
  const tool = createWebfetchTool({
    fetchImpl: createPublicFetch({
      resolve: async (host) => {
        hosts.push(host);
        return [{ address: "8.8.8.8", family: 4 }];
      },
      requestImpl: (...args) =>
        (++count === 1
          ? transport(() => {}, 302, ["location", "https://other.example/"])
          : transport())(...args),
    }),
  });
  assert.match(await tool.handler({ url: "https://example.com" }), /public content/);
  assert.deepEqual(hosts, ["example.com", "other.example"]);
});

function transport(onRequest = () => {}, status = 200, headers = ["content-type", "text/plain"]) {
  return (url, options, respond) => {
    onRequest(url, options);
    const req = new EventEmitter();
    req.end = () => {
      const body = Readable.from([Buffer.from("public content")]);
      body.statusCode = status;
      body.rawHeaders = headers;
      respond(body);
    };
    return req;
  };
}

test("rejects nonpublic addresses, including mapped and special-use forms", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "192.0.0.1",
    "192.0.2.1",
    "::",
    "::1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "::ffff:7f00:1",
    "::ffff:a00:1",
    "2001:db8::1",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ["8.8.8.8", "2606:4700:4700::1111", "::ffff:808:808"])
    assert.equal(isPublicAddress(ip), true, ip);
});

test("private and mixed DNS answers never reach the transport", async () => {
  for (const addresses of [["127.0.0.1"], ["8.8.8.8", "10.0.0.1"]]) {
    const fetch = createPublicFetch({
      resolve: async () => addresses.map((address) => ({ address, family: 4 })),
      requestImpl: () => assert.fail("transport must not run"),
    });
    await assert.rejects(fetch("https://example.com"), /private/);
  }
});

test("approved DNS answers are pinned without re-resolution, retaining TLS hostname", async () => {
  let resolutions = 0;
  const fetch = createPublicFetch({
    resolve: async () => [{ address: ++resolutions === 1 ? "8.8.8.8" : "127.0.0.1", family: 4 }],
    requestImpl: transport((url, options) => {
      assert.equal(url.hostname, "example.com");
      assert.equal(options.agent, false);
      options.lookup("example.com", {}, (error, address, family) => {
        assert.equal(error, null);
        assert.equal(address, "8.8.8.8");
        assert.equal(family, 4);
      });
      options.lookup("example.com", { all: true }, (error, answers) => {
        assert.deepEqual(answers, [{ address: "8.8.8.8", family: 4 }]);
      });
    }),
  });
  assert.equal(await (await fetch("https://example.com")).text(), "public content");
  assert.equal(resolutions, 1);
});

test("mapped loopback URLs are rejected before fetching", async () => {
  const tool = createWebfetchTool({ fetchImpl: () => assert.fail("must not fetch") });
  assert.match(await tool.handler({ url: "http://[::ffff:127.0.0.1]/" }), /private/);
});

test("redirect host DNS is revalidated and private destinations never connect", async () => {
  let requests = 0;
  const tool = createWebfetchTool({
    fetchImpl: createPublicFetch({
      resolve: async (host) => [
        { address: host === "example.com" ? "8.8.8.8" : "127.0.0.1", family: 4 },
      ],
      requestImpl: transport(
        () => {
          requests++;
        },
        302,
        ["location", "https://private.example/"],
      ),
    }),
  });
  assert.match(await tool.handler({ url: "https://example.com" }), /private/);
  assert.equal(requests, 1);
});

test("DNS waiting respects cancellation", async () => {
  const tool = createWebfetchTool({
    timeoutMs: 10,
    fetchImpl: createPublicFetch({
      resolve: () => new Promise(() => {}),
      requestImpl: () => assert.fail("must not connect"),
    }),
  });
  assert.match(await tool.handler({ url: "https://example.com" }), /timed out/);
});
