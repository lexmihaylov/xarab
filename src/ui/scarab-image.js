import { scarabArt } from "./scarab-art.js";

const colors = scarabArt.palette.map((color) =>
  color?.match(/[\da-f]{2}/g).map((channel) => Number.parseInt(channel, 16)),
);
const cache = new Map();

function sample(x, y, width, height) {
  const x0 = Math.floor((x * scarabArt.width) / width);
  const x1 = Math.floor(((x + 1) * scarabArt.width) / width);
  const y0 = Math.floor((y * scarabArt.height) / height);
  const y1 = Math.floor(((y + 1) * scarabArt.height) / height);
  const total = [0, 0, 0];
  let count = 0;
  for (let py = y0; py < y1; py++)
    for (let px = x0; px < x1; px++) {
      const index = Number.parseInt(scarabArt.rows[py][px], 16);
      if (!index) continue;
      count++;
      for (let channel = 0; channel < 3; channel++) total[channel] += colors[index][channel];
    }
  if (count < (x1 - x0) * (y1 - y0) * 0.12) return undefined;
  const average = total.map((sum) => sum / count);
  let closest = 1,
    distance = Infinity;
  for (let index = 1; index < colors.length; index++) {
    const candidate = colors[index].reduce(
      (sum, channel, index) => sum + (channel - average[index]) ** 2,
      0,
    );
    if (candidate < distance) {
      closest = index;
      distance = candidate;
    }
  }
  return scarabArt.palette[closest];
}

export function renderScarab({ width = 80, maxRows = 10 } = {}) {
  const availableRows = Math.max(1, Math.min(27, Math.floor(maxRows)));
  const columns = Math.max(
    1,
    Math.min(
      scarabArt.width,
      Math.floor(width),
      Math.round((2 * availableRows * scarabArt.crop.width) / scarabArt.crop.height),
    ),
  );
  const height =
    2 *
    Math.min(
      availableRows,
      Math.ceil((columns * scarabArt.crop.height) / scarabArt.crop.width / 2),
    );
  const key = `${columns}:${height}`;
  if (cache.has(key)) return cache.get(key);
  const rows = Array.from({ length: height / 2 }, (_, y) => {
    const pixels = [];
    for (let x = 0; x < columns; x++) {
      const top = sample(x, y * 2, columns, height);
      const bottom = sample(x, y * 2 + 1, columns, height);
      const color = top ?? bottom;
      const backgroundColor = top && bottom && top !== bottom ? bottom : undefined;
      const text = !color ? " " : top === bottom ? "█" : top ? "▀" : "▄";
      const previous = pixels.at(-1);
      if (previous && previous.color === color && previous.backgroundColor === backgroundColor)
        previous.text += text;
      else pixels.push({ text, color, backgroundColor });
    }
    return { type: "welcome-logo", text: pixels.map((pixel) => pixel.text).join(""), pixels };
  });
  cache.set(key, rows);
  if (cache.size > 24) cache.delete(cache.keys().next().value);
  return rows;
}
