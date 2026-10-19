import assert from "node:assert/strict";
import React from "react";
import test from "node:test";
import { renderToString } from "ink";
import { ModelChooser } from "../src/ui/components/model-chooser.component.jsx";
import {
  ModelDownloader,
  modelDetailLines,
} from "../src/ui/components/model-downloader.component.jsx";
import { ToolApprovalDialog } from "../src/ui/components/tool-approval-dialog.component.jsx";
import { DownloadProgressDialog } from "../src/ui/components/download-progress-dialog.component.jsx";

const common = { width: 80, height: 24, onClose() {} };

test("download progress dialog shows filename, progress, byte counts and cancellation", () => {
  const output = renderToString(
    React.createElement(DownloadProgressDialog, {
      ...common,
      fileName: "coder.Q4_K_M.gguf",
      progress: 0.25,
      totalSize: 4_000_000_000,
      downloadedSize: 1_000_000_000,
      onCancel() {},
    }),
  );
  assert.match(output, /DOWNLOADING MODEL/);
  assert.match(output, /coder.Q4_K_M.gguf/);
  assert.match(output, /25%/);
  assert.match(output, /1.00 GB \/ 4.00 GB/);
  assert.match(output, /Cancel download/);
  const canceling = renderToString(
    React.createElement(DownloadProgressDialog, {
      ...common,
      fileName: "coder.gguf",
      canceling: true,
      onCancel() {},
    }),
  );
  assert.match(canceling, /CANCELING DOWNLOAD/);
  assert.match(canceling, /removing partial files/);
  assert.doesNotMatch(canceling, /Enter \/ Esc/);
});

test("renders the three-section router and tier worker chooser", () => {
  const output = renderToString(
    React.createElement(ModelChooser, {
      ...common,
      models: ["/models/coder.gguf"],
      modelSettings: { "/models/coder.gguf": { name: "Friendly Coder" } },
      directory: "/models",
      classifierModel: "/models/coder.gguf",
      tierWorkers: {
        1: { provider: "openai", model: "gpt-test" },
        2: { provider: "openai", model: "gpt-test" },
        3: { provider: "openai", model: "gpt-test" },
      },
      openAIModels: [{ id: "gpt-test", name: "GPT Test" }],
    }),
  );
  assert.match(output, /ROUTING & MODEL ASSIGNMENTS/);
  assert.match(output, /ROUTER MODEL/);
  assert.match(output, /TIERS/);
  assert.match(output, /TIER 1 WORKER/);
  assert.match(output, /Friendly Coder/);
  assert.match(output, /OpenAI · GPT Test/);
  assert.doesNotMatch(output, /Local ·/);
  assert.match(output, /Tier 1 · OpenAI/);
  assert.doesNotMatch(output, /Tier [123] · local/);
  assert.match(output, /Enter apply\/assign/);
  assert.ok(output.split("\n").some((line) => (line.match(/╭/g) ?? []).length === 3));
  assert.doesNotMatch(output, /Get Models/);
});

test("renders a standalone Hugging Face downloader modal", () => {
  const output = renderToString(
    React.createElement(ModelDownloader, {
      ...common,
      downloads: [],
      onSearch() {},
      onDownloadSelected() {},
    }),
  );
  assert.match(output, /DOWNLOAD A MODEL/);
  assert.match(output, /Search Hugging Face/);
  assert.match(output, /Type search/);
  assert.doesNotMatch(output, /Local ·/);
  const lines = output.split("\n");
  assert.equal(lines[0].trim(), "");
  assert.equal(lines[1].trim(), "");
  assert.match(lines[2], /^ {4}DOWNLOAD A MODEL/);
  assert.equal(lines[3].trim(), "");
  assert.match(lines[4], /^ {2}╭/);
  assert.equal(lines.length, common.height);
});

test("model browser shows results and download variants together", () => {
  const output = renderToString(
    React.createElement(ModelDownloader, {
      ...common,
      width: 120,
      height: 30,
      downloads: [
        {
          name: "org/Coder-7B",
          title: "Coder-7B",
          parameters: "7B",
          files: [
            {
              fileName: "coder.Q4_K_M.gguf",
              quantization: "Q4_K_M",
              size: 4_800_000_000,
              uri: "https://example.com/model.gguf",
            },
          ],
        },
      ],
    }),
  );
  assert.match(output, /RESULTS/);
  assert.match(output, /org\/Coder-7B/);
  assert.match(output, /QUANTIZATIONS/);
  assert.match(output, /Q4_K_M\s+4.8 GB/);
  assert.match(output, /Overview\s+Model card\s+Metadata/);
  assert.match(output, /MODEL SPECIFICATIONS/);
  assert.match(output, /Parameters\s+~7B/);
  assert.doesNotMatch(output, /ALL REPOSITORY METADATA/);
  assert.equal(output.split("\n").length, 30);
  const lines = output.split("\n");
  const heading = lines.find((line) => line.includes("RESULTS"));
  const quantizationHeader = lines.findIndex((line) => /Type\s+File size/.test(line));
  assert.match(lines[quantizationHeader - 1], /─{10,}/, "Quantization headers have a top border");
  assert.match(
    lines[quantizationHeader + 1],
    /─{10,}/,
    "Quantization headers have a bottom border",
  );
  const tabLine = lines.findIndex((line) => /Overview\s+Model card\s+Metadata/.test(line));
  assert.match(lines[tabLine + 1], /[─═]{10,}/, "The bottom divider touches the tabs");
  assert.match(lines[tabLine + 2], /MODEL SPECIFICATIONS/);
  assert.match(heading, /RESULTS.*QUANTIZATIONS.*Coder-7B/);
  assert.ok(heading.indexOf("QUANTIZATIONS") > heading.indexOf("RESULTS"));
});

test("medium terminals show models and quantizations side by side", () => {
  const output = renderToString(
    React.createElement(ModelDownloader, {
      ...common,
      downloads: [],
    }),
  );
  assert.match(output, /RESULTS.*QUANTIZATIONS/);
  assert.doesNotMatch(output, /Overview/);
  assert.equal(output.split("\n").length, 24);
});

test("narrow model browser keeps the search results readable", () => {
  const output = renderToString(
    React.createElement(ModelDownloader, {
      ...common,
      width: 50,
      downloads: [],
    }),
  );
  assert.match(output, /RESULTS/);
  assert.doesNotMatch(output, /MODEL DETAILS/);
  assert.equal(output.split("\n").length, 24);
});

test("details expose model card and all additional metadata without terminal controls", () => {
  const lines = modelDetailLines(
    { name: "org/model", parameters: "7B" },
    {
      metadata: {
        config: { architectures: ["Coder"], max_position_embeddings: 32768 },
        cardData: { license: "apache-2.0", language: ["en"] },
        customField: "Extra information",
        siblings: [{ rfilename: "tokenizer.json" }],
      },
      modelCard: "# Documentation\nHello\u001b[31m world",
    },
    100,
  ).join("\n");
  assert.match(lines, /Architecture: Coder/);
  assert.match(lines, /Context length: 32,768 tokens/);
  assert.match(lines, /License: apache-2.0/);
  assert.match(lines, /Documentation/);
  assert.match(lines, /Extra information/);
  assert.match(lines, /tokenizer.json/);
  assert.doesNotMatch(lines, /\u001b/);
});

test("GGUF metadata takes precedence over parameter estimates and generic config", () => {
  const output = modelDetailLines(
    { name: "org/Coder-7B", parameters: "7B" },
    {
      metadata: { gguf: { total: 7000000000, architecture: "qwen3", context_length: 40960 } },
    },
    100,
  ).join("\n");
  assert.match(output, /Parameters: 7,000,000,000/);
  assert.match(output, /Architecture: qwen3/);
  assert.match(output, /Context length: 40,960 tokens/);
  assert.doesNotMatch(output, /from name/);
});

test("renders a Tavily approval prompt with the exact query", () => {
  const output = renderToString(
    React.createElement(ToolApprovalDialog, {
      ...common,
      type: "websearch",
      command: "latest model news",
      reasons: ["This query will be sent to Tavily, an external web search provider."],
      onApprove() {},
      onDeny() {},
    }),
  );
  assert.match(output, /WEB SEARCH APPROVAL/);
  assert.match(output, /This search query will be sent to Tavily/);
  assert.match(output, /latest model news/);
  assert.match(output, /approve search/);
});

test("renders a web fetch approval prompt with the exact URL", () => {
  const output = renderToString(
    React.createElement(ToolApprovalDialog, {
      ...common,
      type: "webfetch",
      command: "https://example.com/page",
      reasons: ["This URL will be requested directly."],
      onApprove() {},
      onDeny() {},
    }),
  );
  assert.match(output, /WEB FETCH APPROVAL/);
  assert.match(output, /requested directly/);
  assert.match(output, /https:\/\/example\.com\/page/);
  assert.match(output, /approve fetch/);
});
