import test from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { useModelDetails } from "../src/components/hooks/use-model-details.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("model details abort stale requests, cache results, and abort on unmount", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = (url, options) =>
    new Promise((resolve) => requests.push({ url: String(url), signal: options.signal, resolve }));
  let select;
  let latest;
  function Harness() {
    const [id, setId] = React.useState("owner/one");
    select = setId;
    latest = useModelDetails(id);
    return React.createElement("text", null, latest.id ?? "empty");
  }
  let view;
  try {
    view = await testRender(React.createElement(Harness), { width: 80, height: 24 });
    await act(async () => {
      await wait(220);
    });
    assert.equal(requests.length, 1);
    await act(async () => select("owner/two"));
    assert.equal(requests[0].signal.aborted, true);
    await act(async () => {
      await wait(220);
    });
    assert.equal(requests.length, 2);
    await act(async () => {
      requests[1].resolve({ ok: true, json: async () => ({ id: "owner/two", siblings: [] }) });
      await wait(0);
    });
    assert.equal(requests.length, 4);
    await act(async () => {
      requests[2].resolve({ ok: true, json: async () => [], headers: { get: () => null } });
      requests[3].resolve({ ok: true, text: async () => "card" });
      await wait(0);
    });
    assert.equal(latest.id, "owner/two");
    assert.equal(latest.data.modelCard, "card");
    await act(async () => select("owner/three"));
    await act(async () => {
      await wait(220);
    });
    assert.equal(requests.length, 5);
    await act(async () => select("owner/two"));
    assert.equal(requests[4].signal.aborted, true);
    assert.equal(latest.data.modelCard, "card");
    await act(async () => select("owner/four"));
    await act(async () => {
      await wait(220);
    });
    assert.equal(requests.length, 6);
    await act(async () => view.dispose());
    view = undefined;
    assert.equal(requests[5].signal.aborted, true);
  } finally {
    try {
      if (view) await act(async () => view.dispose());
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});
