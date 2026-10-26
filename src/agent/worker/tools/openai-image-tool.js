import { randomUUID } from "node:crypto";
import { open, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { resolveWorkspaceFile } from "../../../utils/workspace-file-utils.js";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function createOpenAIImageGenerationTool(options) {
  return createOpenAIImageTool({ ...options, edit: false });
}

export function createOpenAIImageEditTool(options) {
  return createOpenAIImageTool({ ...options, edit: true });
}

function createOpenAIImageTool({
  workspace,
  getCredentials,
  fetchImpl = fetch,
  timeoutMs = 240000,
  edit,
}) {
  return {
    description: edit
      ? "Edit a workspace PNG or JPEG with the connected Codex account (consumes usage). Provide a workspace-relative input path, prompt, and output folder. Saves a new PNG without overwriting the original."
      : "Generate a PNG image using the connected Codex account (consumes usage). Provide a prompt and a workspace-relative folder; a new uniquely named PNG is saved there. Never writes outside the workspace.",
    params: {
      type: "object",
      properties: {
        ...(edit
          ? { path: { type: "string", description: "Workspace-relative input PNG or JPEG path." } }
          : {}),
        prompt: { type: "string", description: "Image description." },
        folder: {
          type: "string",
          description: "Workspace-relative destination folder (created if necessary).",
        },
      },
      required: edit ? ["path", "prompt", "folder"] : ["prompt", "folder"],
    },
    async handler({ path: inputPath, prompt, folder } = {}, { signal } = {}) {
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
        let images;
        if (edit) {
          if (
            typeof inputPath !== "string" ||
            !inputPath.trim() ||
            path.isAbsolute(inputPath) ||
            inputPath.split(/[\\/]/).includes("..")
          )
            return { ok: false, output: "Error: provide a workspace-relative input image path." };
          const source = await resolveWorkspaceFile(workspace, inputPath);
          if (!source.exists) return { ok: false, output: "Error: input image does not exist." };
          if ((await stat(source.target)).size > MAX_IMAGE_BYTES)
            return { ok: false, output: "Error: input image exceeds size limit." };
          const input = await readFile(source.target);
          const png = input.subarray(0, 8).equals(PNG_SIGNATURE);
          const jpeg = input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
          if (!png && !jpeg) return { ok: false, output: "Error: input must be PNG or JPEG." };
          images = [
            { image_url: `data:image/${png ? "png" : "jpeg"};base64,${input.toString("base64")}` },
          ];
        }
        const credentials = await getCredentials();
        const timeout = AbortSignal.timeout(timeoutMs);
        const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
        const response = await fetchImpl(
          `https://chatgpt.com/backend-api/codex/images/${edit ? "edits" : "generations"}`,
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
              ...(edit ? { images } : {}),
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
