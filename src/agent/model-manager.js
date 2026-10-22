import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { searchHuggingFaceModels } from "./model-search.js";

export function createModelManager({
  modelsDir,
  configStore,
  downloadFile,
  notify,
  addMessage,
  getModelModal,
  setModelModal,
  getActiveDownload,
  setActiveDownload,
  getNextDownloadId,
  setNextDownloadId,
  getTierClassifier,
  clearTierClassifier,
}) {
  async function listModels() {
    const entries = await readdir(modelsDir, { withFileTypes: true }).catch(() => []);
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".gguf"))
      .map((entry) => path.join(modelsDir, entry.name));
  }

  function getModelSettings(models) {
    return Object.fromEntries(
      models.map((modelPath) => [modelPath, configStore.getModel(modelPath)]),
    );
  }

  async function deleteModel(modelToDelete) {
    const modelModal = getModelModal();
    if (!modelModal || modelModal.mode !== "chooser") return;
    const resolvedPath = path.resolve(modelToDelete);
    const relativePath = path.relative(path.resolve(modelsDir), resolvedPath);
    if (
      !relativePath ||
      relativePath.startsWith("..") ||
      path.isAbsolute(relativePath) ||
      !resolvedPath.toLowerCase().endsWith(".gguf")
    ) {
      setModelModal({ ...modelModal, error: "Only local GGUF models can be deleted." });
      notify();
      return;
    }
    try {
      await unlink(resolvedPath);
      if (
        configStore.getClassifierModel() &&
        path.resolve(configStore.getClassifierModel()) === resolvedPath
      ) {
        await configStore.setClassifierModel(null);
        await getTierClassifier()?.dispose?.();
        clearTierClassifier();
      }
      const models = await listModels();
      if (!getModelModal()) return;
      let errorMessage = null;
      try {
        await configStore.removeModel(resolvedPath);
      } catch (error) {
        errorMessage = `Model deleted, but its config could not be removed: ${error.message}`;
      }
      setModelModal({
        ...getModelModal(),
        models,
        modelSettings: getModelSettings(models),
        error: errorMessage,
      });
    } catch (error) {
      if (!getModelModal()) return;
      setModelModal({ ...getModelModal(), error: `Could not delete model: ${error.message}` });
    }
    notify();
  }

  function downloadModel(uri, fileName) {
    const modelModal = getModelModal();
    if (!modelModal || modelModal.mode !== "download" || getActiveDownload()) return;
    const job = { id: getNextDownloadId(), controller: new AbortController() };
    setNextDownloadId(job.id + 1);
    let lastProgressAt = -Infinity;
    job.clearProgressTimer = () => {
      clearTimeout(job.progressTimer);
      job.progressTimer = undefined;
    };
    job.controller.signal.addEventListener("abort", job.clearProgressTimer, { once: true });
    setActiveDownload(job);
    const isCurrentModal = () =>
      getModelModal()?.mode === "download" && getModelModal().downloadId === job.id;
    const publishProgress = () => {
      job.progressTimer = undefined;
      if (!isCurrentModal() || job.controller.signal.aborted || job.settled) return;
      lastProgressAt = Date.now();
      const { totalSize, downloadedSize } = job.latestProgress;
      setModelModal({
        ...getModelModal(),
        totalSize,
        downloadedSize,
        progress: totalSize ? downloadedSize / totalSize : 0,
      });
      notify();
    };
    setModelModal({
      ...modelModal,
      downloadId: job.id,
      downloading: uri,
      downloadFileName: fileName,
      canceling: false,
      progress: 0,
      totalSize: 0,
      downloadedSize: 0,
      downloadNotice: null,
      error: null,
    });
    notify();
    job.promise = Promise.resolve()
      .then(() =>
        downloadFile(uri, {
          directory: modelsDir,
          fileName,
          signal: job.controller.signal,
          onProgress({ totalSize, downloadedSize }) {
            if (!isCurrentModal() || job.controller.signal.aborted || job.settled) return;
            job.latestProgress = { totalSize, downloadedSize };
            if (job.progressTimer !== undefined) return;
            const wait = 1000 - (Date.now() - lastProgressAt);
            if (wait <= 0) publishProgress();
            else job.progressTimer = setTimeout(publishProgress, wait);
          },
        }),
      )
      .then(async (resolvedPath) => {
        job.settled = true;
        job.clearProgressTimer();
        let configError;
        try {
          await configStore.ensureModel(resolvedPath);
        } catch (error) {
          configError = `Model downloaded, but its config could not be saved: ${error.message}`;
        }
        if (isCurrentModal()) {
          setModelModal({
            ...getModelModal(),
            ...job.latestProgress,
            downloading: null,
            canceling: false,
            progress: 1,
            error: configError ?? null,
          });
          notify();
        }
        addMessage({ type: "system", message: `Model downloaded: ${resolvedPath}` });
      })
      .catch((error) => {
        job.settled = true;
        job.clearProgressTimer();
        if (!isCurrentModal()) return;
        const canceled = error === job.controller.signal.reason;
        setModelModal({
          ...getModelModal(),
          downloading: null,
          canceling: false,
          progress: 0,
          downloadedSize: 0,
          totalSize: 0,
          downloadNotice: canceled ? "Download canceled. Partial files removed." : null,
          error: canceled ? null : `Download failed: ${error.message}`,
        });
        notify();
      })
      .finally(() => {
        job.clearProgressTimer();
        job.controller.signal.removeEventListener("abort", job.clearProgressTimer);
        if (getActiveDownload() === job) setActiveDownload(undefined);
      });
    return job.promise;
  }

  function cancelModelDownload() {
    const activeDownload = getActiveDownload();
    if (!activeDownload) return;
    const modelModal = getModelModal();
    if (modelModal?.downloadId === activeDownload.id) {
      setModelModal({ ...modelModal, canceling: true });
      notify();
    }
    activeDownload.controller.abort();
    return activeDownload.promise;
  }

  async function searchHuggingFace(query) {
    const modelModal = getModelModal();
    if (!modelModal || modelModal.mode !== "download" || !query.trim()) return;
    const trimmedQuery = query.trim();
    setModelModal({
      ...modelModal,
      query: trimmedQuery,
      searchQuery: trimmedQuery,
      downloads: [],
      searching: true,
      error: null,
    });
    notify();
    try {
      const downloads = await searchHuggingFaceModels(trimmedQuery);
      if (
        !getModelModal() ||
        getModelModal().mode !== "download" ||
        getModelModal().searchQuery !== trimmedQuery
      )
        return;
      setModelModal({ ...getModelModal(), downloads, searching: false });
      notify();
    } catch (error) {
      if (
        !getModelModal() ||
        getModelModal().mode !== "download" ||
        getModelModal().searchQuery !== trimmedQuery
      )
        return;
      setModelModal({ ...getModelModal(), searching: false, error: error.message });
      notify();
    }
  }

  return {
    listModels,
    getModelSettings,
    deleteModel,
    downloadModel,
    cancelModelDownload,
    searchHuggingFace,
  };
}
