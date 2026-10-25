import React, { useEffect, useState } from "react";
import stringWidth from "string-width";

// Move by grapheme rather than UTF-16 units so model names remain intact.
export function marqueeFrame(text, width, offset) {
  const parts = Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
    (part) => part.segment,
  );
  let result = "";
  for (const part of parts.slice(offset)) {
    if (stringWidth(result + part) > width) break;
    result += part;
  }
  return result;
}

export function MarqueeText({ children, active = false, ...props }) {
  const text = String(children);
  const [width, setWidth] = useState(0);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    setOffset(0);
    if (!active || width < 1 || stringWidth(text) <= width) return;
    let timer;
    let position = 0;
    const advance = () => {
      const atEnd = stringWidth(marqueeFrame(text, Number.MAX_SAFE_INTEGER, position)) <= width;
      position = atEnd ? 0 : position + 1;
      setOffset(position);
      timer = setTimeout(advance, position === 0 ? 1200 : 180);
    };
    timer = setTimeout(advance, 1200);
    return () => clearTimeout(timer);
  }, [active, text, width]);

  return (
    <text
      {...props}
      height={1}
      flexShrink={0}
      wrapMode="none"
      truncate
      onSizeChange={function () {
        setWidth(this.width);
      }}
      ref={(node) => {
        if (node) setWidth(node.width);
      }}
    >
      {active && width > 0 && stringWidth(text) > width ? marqueeFrame(text, width, offset) : text}
    </text>
  );
}
