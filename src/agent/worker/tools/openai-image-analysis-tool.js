import { open, stat } from "node:fs/promises";
import path from "node:path";
import { resolveWorkspaceFile } from "../../../utils/workspace-file-utils.js";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_ANSWER = 16 * 1024;
const MAX_STREAM = 1024 * 1024;
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function createOpenAIImageAnalysisTool({
  workspace,
  getCredentials,
  fetchImpl = fetch,
  model = "gpt-6-astra",
  timeoutMs = 120000,
}) {
  return {
    description:
      "Analyze a workspace PNG or JPEG with the connected Codex account (consumes usage). Provide a workspace-relative image path and a question. Returns text only.",
    params: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative PNG or JPEG path." },
        question: { type: "string", description: "Question about the image." },
      },
      required: ["path", "question"],
    },
    async handler({ path: imagePath, question } = {}, { signal } = {}) {
      if (typeof question !== "string" || !question.trim() || question.length > 10000)
        return { ok: false, output: "Error: provide a question of at most 10000 characters." };
      if (
        typeof imagePath !== "string" ||
        !imagePath.trim() ||
        path.isAbsolute(imagePath) ||
        imagePath.split(/[\\/]/).includes("..")
      )
        return { ok: false, output: "Error: provide a workspace-relative image path." };
      try {
        const source = await resolveWorkspaceFile(workspace, imagePath);
        if (!source.exists) throw new Error("Image does not exist.");
        if ((await stat(source.target)).size > MAX_IMAGE_BYTES)
          throw new Error("Image exceeds size limit.");
        const file = await open(source.target, "r");
        let bytes;
        try {
          const info = await file.stat();
          if (!info.isFile() || info.size > MAX_IMAGE_BYTES)
            throw new Error("Image exceeds size limit.");
          bytes = await file.readFile();
        } finally {
          await file.close();
        }
        if (bytes.length > MAX_IMAGE_BYTES) throw new Error("Image exceeds size limit.");
        const png = bytes.subarray(0, 8).equals(PNG);
        const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        if (!png && !jpeg) throw new Error("Image must be PNG or JPEG.");
        const credentials = await getCredentials();
        const combined = signal
          ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
          : AbortSignal.timeout(timeoutMs);
        const response = await fetchImpl("https://chatgpt.com/backend-api/codex/responses", {
          method: "POST",
          headers: {
            originator: "xarab",
            "user-agent": "xarab/1.0.0",
            authorization: `Bearer ${credentials.access_token}`,
            "chatgpt-account-id": credentials.account_id,
            "content-type": "application/json",
            accept: "text/event-stream",
            "openai-beta": "responses=experimental",
          },
          body: JSON.stringify({
            model,
            instructions: "Answer the user's question about the image using text only.",
            input: [
              {
                role: "user",
                content: [
                  { type: "input_text", text: question },
                  {
                    type: "input_image",
                    image_url: `data:image/${png ? "png" : "jpeg"};base64,${bytes.toString("base64")}`,
                  },
                ],
              },
            ],
            tools: [],
            store: false,
            stream: true,
            reasoning: { effort: "low", summary: "auto" },
            include: ["reasoning.encrypted_content"],
          }),
          signal: combined,
        });
        if (!response.ok) throw new Error(`Image analysis failed (HTTP ${response.status}).`);
        if (!response.body) throw new Error("Image analysis returned no stream.");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let answer = "";
        let total = 0;
        let completed = false;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_STREAM) throw new Error("Image analysis response exceeds size limit.");
            buffer += decoder.decode(value, { stream: true });
            let match;
            while ((match = /\r?\n\r?\n/.exec(buffer))) {
              const block = buffer.slice(0, match.index);
              buffer = buffer.slice(match.index + match[0].length);
              const data = block
                .split(/\r?\n/)
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trimStart())
                .join("\n");
              if (!data || data === "[DONE]") continue;
              const event = JSON.parse(data);
              if (event.type === "response.output_text.delta") {
                answer += event.delta ?? "";
                if (answer.length > MAX_ANSWER)
                  throw new Error("Image analysis answer exceeds size limit.");
              } else if (event.type === "response.completed") {
                completed = true;
                if (!answer)
                  answer = (event.response?.output ?? [])
                    .flatMap((item) => item.content ?? [])
                    .filter((item) => item.type === "output_text")
                    .map((item) => item.text ?? "")
                    .join("");
              } else if (["response.failed", "response.incomplete", "error"].includes(event.type)) {
                throw new Error(
                  `Image analysis failed (${event.response?.error?.code ?? event.error?.code ?? "unknown_error"}).`,
                );
              }
            }
          }
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        if (combined.aborted) throw combined.reason;
        if (!completed || !answer.trim() || answer.length > MAX_ANSWER)
          throw new Error("Image analysis did not return a bounded text answer.");
        return { ok: true, output: answer };
      } catch (error) {
        return {
          ok: false,
          output: `Error analyzing image: ${error?.name === "AbortError" || error?.name === "TimeoutError" ? "request cancelled or timed out" : (error?.message ?? "unknown error")}`,
        };
      }
    },
  };
}
