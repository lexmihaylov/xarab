import { randomUUID } from "node:crypto";
import { open, unlink } from "node:fs/promises";
import path from "node:path";
import { resolveWorkspaceFile } from "../../../utils/workspace-file-utils.js";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function createGenerateImageTool({
  workspace,
  getCredentials,
  fetchImpl = fetch,
  timeoutMs = 240000,
}) {
  return {
    description:
      "Generate a PNG image using the connected Codex account (consumes usage). Provide a prompt and a workspace-relative folder; a new uniquely named PNG is saved there. Never writes outside the workspace.",
    params: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Image description." },
        folder: {
          type: "string",
          description: "Workspace-relative destination folder (created if necessary).",
        },
      },
      required: ["prompt", "folder"],
    },
    async handler({ prompt, folder } = {}, { signal } = {}) {
      if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 10000)
        return { ok: false, output: "Error: provide a prompt of at most 10000 characters." };
      if (
        typeof folder !== "string" ||
        !folder.trim() ||
        path.isAbsolute(folder) ||
        folder.split(/[\\/]/).includes("..")
      )
        return {
          ok: false,
          output: "Error: provide a workspace-relative folder without traversal.",
        };
      try {
        const credentials = await getCredentials();
        const timeout = AbortSignal.timeout(timeoutMs);
        const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
        const response = await fetchImpl(
          "https://chatgpt.com/backend-api/codex/images/generations",
          {
            method: "POST",
            headers: {
              originator: "xarab",
              "user-agent": "xarab/1.0.0",
              authorization: `Bearer ${credentials.access_token}`,
              "chatgpt-account-id": credentials.account_id,
              "content-type": "application/json",
              accept: "application/json",
            },
            body: JSON.stringify({
              model: "gpt-image-2",
              prompt,
              n: 1,
              size: "1024x1024",
              quality: "low",
            }),
            signal: combined,
          },
        );
        if (!response.ok)
          return { ok: false, output: `Error: image generation failed (HTTP ${response.status}).` };
        const declaredLength = Number(response.headers.get("content-length"));
        if (declaredLength > MAX_IMAGE_BYTES * 1.5)
          throw new Error("Image response exceeds size limit.");
        let length = 0;
        const chunks = [];
        for await (const chunk of response.body) {
          length += chunk.length;
          if (length > MAX_IMAGE_BYTES * 1.5) throw new Error("Image response exceeds size limit.");
          chunks.push(chunk);
        }
        const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const encoded = data?.data?.[0]?.b64_json;
        if (
          typeof encoded !== "string" ||
          encoded.length > MAX_IMAGE_BYTES * 1.4 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
        )
          throw new Error("Invalid image response.");
        const bytes = Buffer.from(encoded, "base64");
        if (bytes.length > MAX_IMAGE_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE))
          throw new Error("Invalid or oversized PNG image.");
        if (combined.aborted) throw new Error("Image generation cancelled.");
        const requested = path.join(folder, `image-${randomUUID()}.png`);
        const destination = await resolveWorkspaceFile(workspace, requested, {
          createParents: true,
        });
        const handle = await open(destination.target, "wx", 0o600);
        try {
          await handle.writeFile(bytes);
        } catch (error) {
          await handle.close();
          await unlink(destination.target).catch(() => {});
          throw error;
        }
        await handle.close();
        return { ok: true, output: `Generated image: ${destination.displayPath}` };
      } catch (error) {
        return {
          ok: false,
          output: `Error generating image: ${error?.name === "AbortError" || error?.name === "TimeoutError" ? "request cancelled or timed out" : (error?.message ?? "unknown error")}`,
        };
      }
    },
  };
}
