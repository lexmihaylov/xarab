const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function previousTextPosition(value, cursor) {
  let previous = 0;
  for (const segment of graphemes.segment(value)) {
    if (segment.index >= cursor) break;
    previous = segment.index;
  }
  return previous;
}

export function nextTextPosition(value, cursor) {
  for (const segment of graphemes.segment(value)) {
    if (segment.index > cursor) return segment.index;
  }
  return value.length;
}
