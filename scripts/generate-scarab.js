import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { PNG } from "pngjs";

const palette = [
  null,
  "#fff2a1",
  "#ffe36b",
  "#ffc43c",
  "#e9a12a",
  "#bd711c",
  "#80501b",
  "#89f6e7",
  "#2cd4d4",
  "#139eaf",
  "#10768e",
  "#096ab2",
  "#0a4688",
  "#082b62",
  "#04163d",
  "#020b20",
];
const colors = palette.map((color) =>
  color?.match(/[\da-f]{2}/g).map((channel) => Number.parseInt(channel, 16)),
);

export function convertScarab(buffer) {
  const image = PNG.sync.read(buffer);
  // The supplied artwork has its wordmark below the beetle. Render that wordmark as text instead.
  const bottom = Math.floor(image.height * 0.74);
  let left = image.width,
    top = bottom,
    right = 0,
    last = 0;
  const visible = (offset) =>
    image.data[offset + 3] >= 128 && Math.max(...image.data.subarray(offset, offset + 3)) > 48;
  for (let y = 0; y < bottom; y++)
    for (let x = 0; x < image.width; x++) {
      if (!visible((y * image.width + x) * 4)) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      last = Math.max(last, y);
    }
  if (right <= left || last <= top) throw new Error("No scarab was found in assets/xarab.png");
  const crop = { x: left, y: top, width: right - left + 1, height: last - top + 1 };
  const width = 48;
  const height = Math.ceil((width * crop.height) / crop.width / 2) * 2;
  const rows = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const x0 = crop.x + Math.floor((x * crop.width) / width);
      const x1 = crop.x + Math.floor(((x + 1) * crop.width) / width);
      const y0 = crop.y + Math.floor((y * crop.height) / height);
      const y1 = crop.y + Math.floor(((y + 1) * crop.height) / height);
      const total = [0, 0, 0];
      let count = 0;
      for (let py = y0; py < y1; py++)
        for (let px = x0; px < x1; px++) {
          const offset = (py * image.width + px) * 4;
          if (!visible(offset)) continue;
          count++;
          for (let channel = 0; channel < 3; channel++)
            total[channel] += image.data[offset + channel];
        }
      if (count < (x1 - x0) * (y1 - y0) * 0.1) return "0";
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
      return closest.toString(16);
    }).join(""),
  );
  return {
    source: "assets/xarab.png",
    sha256: createHash("sha256").update(buffer).digest("hex"),
    crop,
    width,
    height,
    palette,
    rows,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = convertScarab(await readFile(new URL("../assets/xarab.png", import.meta.url)));
  process.stdout.write(
    `// Generated from assets/xarab.png; regenerate with npm run logo:generate --silent.\nexport const scarabArt = ${JSON.stringify(data, null, 2)};\n`,
  );
}
