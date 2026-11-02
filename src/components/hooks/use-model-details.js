import { useEffect, useRef, useState } from "react";
import { getHuggingFaceModelDetails } from "../../utils/huggingface-model-search.js";

export function useModelDetails(modelId) {
  const [detailState, setDetailState] = useState({});
  const cache = useRef(new Map());

  useEffect(() => {
    if (!modelId) return;
    if (cache.current.has(modelId)) {
      setDetailState({ id: modelId, data: cache.current.get(modelId) });
      return;
    }
    const controller = new AbortController();
    setDetailState({ id: modelId, loading: true });
    const timer = setTimeout(async () => {
      try {
        const data = await getHuggingFaceModelDetails(modelId, { signal: controller.signal });
        if (!controller.signal.aborted) {
          cache.current.set(modelId, data);
          setDetailState({ id: modelId, data });
        }
      } catch (error) {
        if (!controller.signal.aborted) setDetailState({ id: modelId, error: error.message });
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [modelId]);

  return detailState;
}
