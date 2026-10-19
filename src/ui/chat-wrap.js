import wrapAnsi from "wrap-ansi";
import { toAnsi } from "./terminal-utils.js";

export function wrapChatLine(line, width) {
  return wrapAnsi(toAnsi(line), Math.max(1, width), {
    hard: true,
    wordWrap: true,
    trim: false,
  }).split("\n");
}
