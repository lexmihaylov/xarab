const HUGGING_FACE_API = "https://huggingface.co/api/models";

export async function searchHuggingFaceModels(query) {
  const url = new URL(HUGGING_FACE_API);
  url.searchParams.set("search", query);
  url.searchParams.set("filter", "gguf");
  url.searchParams.set("sort", "downloads");
  url.searchParams.set("direction", "-1");
  url.searchParams.set("limit", "20");
  url.searchParams.append("expand[]", "siblings");
  for (const field of ["downloads", "likes", "tags", "lastModified", "pipeline_tag"])
    url.searchParams.append("expand[]", field);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Hugging Face search failed (HTTP ${response.status})`);
  }

  const repositories = await response.json();
  const results = repositories.map(createRepositoryResult);
  return results.filter(Boolean);
}

function createRepositoryResult(repository) {
  const ggufFiles = (repository.siblings ?? [])
    .map((file) => file.rfilename)
    .filter((fileName) => fileName?.toLowerCase().endsWith(".gguf"));

  if (ggufFiles.length === 0) return null;

  const parameters = getParameterCount(repository.id, ggufFiles[0]);

  return {
    name: repository.id,
    title: repository.id.split("/").at(-1),
    publisher: repository.id.split("/")[0],
    downloads: repository.downloads,
    likes: repository.likes,
    tags: repository.tags ?? [],
    parameters,
    files: ggufFiles.map((fileName) => ({
      fileName,
      quantization: getQuantizationLabel(fileName),
      size: repository.siblings.find((file) => file.rfilename === fileName)?.size ?? null,
      uri: createModelFileUrl(repository.id, fileName),
    })),
  };
}

async function getFileSizes(repositoryId, signal) {
  try {
    let url = `${HUGGING_FACE_API}/${repositoryId}/tree/main?recursive=true&expand=true`;
    const sizes = new Map();
    while (url) {
      const response = await fetch(url, { signal });
      if (!response.ok) return sizes;
      const files = await response.json();
      for (const file of files) sizes.set(file.path, file.size ?? file.lfs?.size);
      const next = response.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/);
      url = next ? next[1] : null;
      if (url && new URL(url).origin !== "https://huggingface.co") break;
    }
    return sizes;
  } catch {
    // File metadata is optional; search results are still useful without it.
    return new Map();
  }
}

export async function getHuggingFaceModelDetails(repositoryId, { signal } = {}) {
  const encodedId = repositoryId.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${HUGGING_FACE_API}/${encodedId}?blobs=true`, { signal });
  if (!response.ok) throw new Error(`Model details unavailable (HTTP ${response.status})`);
  const metadata = await response.json();
  const revision = encodeURIComponent(metadata.sha || "main");
  const [sizes, card] = await Promise.all([
    getFileSizes(encodedId, signal),
    fetch(`https://huggingface.co/${encodedId}/raw/${revision}/README.md`, { signal })
      .then(async (result) => ({
        text: result.ok ? await result.text() : "",
        error: result.ok ? null : `Model card unavailable (HTTP ${result.status})`,
      }))
      .catch((error) => ({ text: "", error: `Model card unavailable: ${error.message}` })),
  ]);
  const result = createRepositoryResult(metadata);
  return {
    metadata,
    modelCard: card.text,
    modelCardError: card.error,
    files: (result?.files ?? []).map((file) => ({
      ...file,
      size: file.size ?? sizes.get(file.fileName) ?? null,
    })),
  };
}

function getParameterCount(repositoryId, firstFileName) {
  const match = `${repositoryId} ${firstFileName ?? ""}`.match(
    /(?:^|[-_\s])(\d+(?:\.\d+)?)[-_\s]?([BM])(?:[-_.\s]|$)/i,
  );
  return match ? `${match[1]}${match[2].toUpperCase()}` : null;
}

function getQuantizationLabel(fileName) {
  const match = fileName.match(
    /(?:^|[-_.])(F16|F32|BF16|Q\d(?:_[A-Z0-9]+)*|IQ\d(?:_[A-Z0-9]+)*)(?:[-_.]|$)/i,
  );
  return match?.[1]?.toUpperCase() ?? "GGUF";
}

function createModelFileUrl(repositoryId, fileName) {
  const encodedPath = fileName.split("/").map(encodeURIComponent).join("/");
  return `https://huggingface.co/${repositoryId}/resolve/main/${encodedPath}`;
}
