import { useCallback, useEffect, useMemo, useState } from "react";
import { buildChatRows, chatViewport } from "../chat-layout.js";
import { useMouseWheel } from "./use-mouse-wheel.js";
import { nextScrollOffset } from "../terminal-utils.js";

export function useChatScroll(
  messages,
  chatHeight,
  width,
  generating = false,
  sessionId,
  isActive = true,
) {
  const [scrollState, setScrollState] = useState({ sessionId, offset: 0 });
  const scrollOffset = scrollState.sessionId === sessionId ? scrollState.offset : 0;
  const lines = useMemo(
    () => buildChatRows(messages, width, { generating, height: chatHeight }),
    [messages, width, generating, chatHeight],
  );
  const viewport = chatViewport(lines, chatHeight, scrollOffset);
  const { maxScroll } = viewport;
  const scrollBy = useCallback(
    (direction, step) => {
      setScrollState((current) => ({
        sessionId,
        offset: nextScrollOffset(
          current.sessionId === sessionId ? current.offset : 0,
          direction,
          maxScroll,
          chatHeight,
          step,
        ),
      }));
    },
    [chatHeight, maxScroll, sessionId],
  );
  const scroll = useCallback((direction) => scrollBy(direction), [scrollBy]);
  const scrollWheel = useCallback((direction) => scrollBy(direction, 3), [scrollBy]);

  useMouseWheel(scrollWheel, chatHeight, isActive);
  useEffect(
    () =>
      setScrollState((current) =>
        current.sessionId === sessionId && current.offset <= maxScroll
          ? current
          : {
              sessionId,
              offset: current.sessionId === sessionId ? Math.min(current.offset, maxScroll) : 0,
            },
      ),
    [maxScroll, sessionId],
  );

  return { scroll, ...viewport };
}
