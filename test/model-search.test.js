import assert from "node:assert/strict";
import test from "node:test";
import {
  getHuggingFaceModelDetails,
  searchHuggingFaceModels,
} from "../src/utils/huggingface-model-search.js";

test("search returns lightweight GGUF results without fetching every repository", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(String(url));
    return Response.json([
      {
        id: "publisher/Coder-7B-GGUF",
        downloads: 42,
        likes: 3,
        siblings: [{ rfilename: "coder.Q4_K_M.gguf" }],
      },
      { id: "publisher/not-gguf", siblings: [{ rfilename: "config.json" }] },
    ]);
  });
  const results = await searchHuggingFaceModels("coder");
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]).searchParams.get("filter"), "gguf");
  assert.equal(results.length, 1);
  assert.equal(results[0].parameters, "7B");
  assert.equal(results[0].downloads, 42);
  assert.equal(results[0].files[0].quantization, "Q4_K_M");
  assert.equal(results[0].files[0].size, null);
});

test("details include metadata, model card and paginated file sizes", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = String(input);
    if (url.includes("?blobs=true"))
      return Response.json({
        id: "org/model",
        sha: "revision123",
        cardData: { license: "apache-2.0" },
        siblings: [{ rfilename: "nested/model.Q4_K_M.gguf" }],
      });
    if (url.includes("/raw/revision123/README.md")) return new Response("# Model\nDocumentation");
    if (url.includes("cursor=next"))
      return Response.json([{ path: "nested/model.Q4_K_M.gguf", size: 1234 }]);
    return Response.json([{ path: "README.md", size: 25 }], {
      headers: {
        link: '<https://huggingface.co/api/models/org/model/tree/main?cursor=next>; rel="next"',
      },
    });
  });
  const details = await getHuggingFaceModelDetails("org/model");
  assert.equal(details.metadata.cardData.license, "apache-2.0");
  assert.match(details.modelCard, /Documentation/);
  assert.equal(details.files[0].size, 1234);
  assert.equal(
    details.files[0].uri,
    "https://huggingface.co/org/model/resolve/main/nested/model.Q4_K_M.gguf",
  );
});

test("optional model card and size failures do not hide download files", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) =>
    String(input).includes("?blobs=true")
      ? Response.json({ id: "org/model", siblings: [{ rfilename: "model.gguf" }] })
      : new Response("Unavailable", { status: 404 }),
  );
  const details = await getHuggingFaceModelDetails("org/model");
  assert.equal(details.files.length, 1);
  assert.equal(details.files[0].size, null);
  assert.match(details.modelCardError, /404/);
});

test("detail request errors are actionable", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("Unavailable", { status: 503 }));
  await assert.rejects(getHuggingFaceModelDetails("org/model"), /HTTP 503/);
});
