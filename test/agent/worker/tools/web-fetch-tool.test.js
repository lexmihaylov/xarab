import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import https from "node:https";
import { Readable } from "node:stream";
import { createPublicFetch } from "../../../../src/agent/worker/tools/public-http-fetch.js";
import { createWebfetchTool } from "../../../../src/agent/worker/tools/web-fetch-tool.js";
test("real TLS validates the trusted certificate and original hostname", async (t) => {
  const cert = readFileSync(new URL("./fixtures/webfetch-cert.pem", import.meta.url));
  const key = readFileSync(new URL("./fixtures/webfetch-key.pem", import.meta.url));
  const server = https.createServer({ key, cert }, (_req, res) => res.end("secure content"));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(
    () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  );
  const port = server.address().port;
  const resolve = async () => [{ address: "127.0.0.1", family: 4 }];
  const trustedFetch = createPublicFetch({
    resolve,
    requestImpl: (url, options, respond) => https.request(url, { ...options, ca: cert }, respond),
  });
  assert.equal(
    await (await trustedFetch(`https://webfetch.test:${port}/`)).text(),
    "secure content",
  );
  await assert.rejects(trustedFetch(`https://wrong.test:${port}/`), {
    code: "ERR_TLS_CERT_ALTNAME_INVALID",
  });
  await assert.rejects(createPublicFetch({ resolve })(`https://webfetch.test:${port}/`), {
    code: "DEPTH_ZERO_SELF_SIGNED_CERT",
  });
});

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

test("private and local IPv4/IPv6 DNS answers are accepted and pinned", async () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "::1", "fc00::1", "fe80::1"]) {
    const family = address.includes(":") ? 6 : 4;
    let connectedAddress;
    const fetch = createPublicFetch({
      resolve: async () => [{ address, family }],
      requestImpl: transport((_url, options) => {
        options.lookup("example.com", {}, (error, pinned, pinnedFamily) => {
          assert.equal(error, null);
          connectedAddress = pinned;
          assert.equal(pinnedFamily, family);
        });
      }),
    });
    assert.equal(await (await fetch("https://example.com")).text(), "public content");
    assert.equal(connectedAddress, address);
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

test("mapped loopback URLs can be fetched", async () => {
  const tool = createWebfetchTool({
    fetchImpl: createPublicFetch({
      resolve: async () => [{ address: "::ffff:127.0.0.1", family: 6 }],
      requestImpl: transport(),
    }),
  });
  assert.match(await tool.handler({ url: "https://[::ffff:127.0.0.1]/" }), /public content/);
});

test("redirects to private destinations succeed with fresh DNS checks", async () => {
  const hosts = [];
  let count = 0;
  const tool = createWebfetchTool({
    fetchImpl: createPublicFetch({
      resolve: async (host) => {
        hosts.push(host);
        return [{ address: host === "example.com" ? "8.8.8.8" : "127.0.0.1", family: 4 }];
      },
      requestImpl: (...args) =>
        (++count === 1
          ? transport(() => {}, 302, ["location", "https://private.example/"])
          : transport())(...args),
    }),
  });
  assert.match(await tool.handler({ url: "https://example.com" }), /public content/);
  assert.deepEqual(hosts, ["example.com", "private.example"]);
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
