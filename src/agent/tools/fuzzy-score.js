export function fuzzyScore(candidate, query) {
  const text = candidate.toLowerCase();
  const needle = query.toLowerCase();
  let score = 0;
  let previous = -1;

  for (const character of needle) {
    const index = text.indexOf(character, previous + 1);
    if (index === -1) return null;
    if (previous === -1) score += index * 2;
    else score += index - previous - 1;
    if (index === 0 || "/._- ".includes(text[index - 1])) score -= 3;
    if (index === previous + 1) score -= 2;
    previous = index;
  }

  if (text.includes(needle)) score -= 20;
  score += Math.max(0, text.length - needle.length) * 0.02;
  return score;
}
