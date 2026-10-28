import wrapAnsi from "wrap-ansi";

// Reserve terminal margins and persistent title, progress, actions, and hints.
export function questionLayout(size, question, options, custom, cursor) {
  const width = Math.min(84, Math.max(1, size.width - 4));
  const contentWidth = Math.max(1, width - 8);
  const lines = (text, reserve = 0) =>
    wrapAnsi(text, Math.max(1, contentWidth - reserve), { hard: true }).split("\n").length;
  // Choice panes need two border rows and a non-shrinking label row.
  // Reserve a page-indicator row even on a single page to keep paging stable.
  const fixed = 11 + lines(question) + (options.length ? 4 : -3) + (custom ? 8 : 0);
  const budget = size.height - 4 - fixed;
  const pages = [];
  let page = [];
  let used = 0;
  let oversized = false;
  options.forEach((option, index) => {
    const cost = lines(option, 8);
    if (cost > budget) oversized = true;
    if (page.length && used + cost > budget) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(index);
    used += cost;
  });
  if (page.length) pages.push(page);
  const pageIndex = Math.max(
    0,
    pages.findIndex((items) => items.includes(cursor)),
  );
  const visible = pages[pageIndex] ?? [];
  const choiceRows = visible.reduce((total, i) => total + lines(options[i], 8), 0);
  const choicePaneHeight = options.length ? choiceRows + 4 : 0;
  const height = fixed + choiceRows;
  return {
    choicePaneHeight,
    width,
    height,
    pages,
    pageIndex,
    visible,
    tooSmall: width < 44 || height > size.height - 4 || oversized,
  };
}
