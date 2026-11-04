import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import ipaddr from "ipaddr.js";

export function isPublicAddress(address) {
  try {
    // process() converts IPv4-mapped IPv6 to IPv4 before range classification.
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}

// Resolve once, reject mixed public/private answers, and pin the approved address
// in the socket lookup. Keep the original URL for Host and TLS SNI/verification.
export function createPublicFetch({ resolve = lookup, requestImpl } = {}) {
  return async function publicFetch(url, { signal, headers, method = "GET" } = {}) {
    const target = new URL(url);
    if (!["http:", "https:"].includes(target.protocol))
      throw new Error("Only HTTP and HTTPS URLs are allowed.");
    const host = target.hostname.replace(/^\[|\]$/g, "");
    const answers = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await resolveWithSignal(resolve, host, signal);
    signal?.throwIfAborted();
    if (!answers.length || answers.some(({ address }) => !isPublicAddress(address)))
      throw new Error("local and private network URLs are not allowed.");
    const approved = answers[0];
    return new Promise((resolveResponse, reject) => {
      const request = requestImpl ?? (target.protocol === "https:" ? https.request : http.request);
      const req = request(
        target,
        {
          method,
          headers,
          signal,
          agent: false,
          lookup: (_hostname, options, callback) => {
            if (options.all) callback(null, [approved]);
            else callback(null, approved.address, approved.family);
          },
        },
        (incoming) => {
          try {
            const responseHeaders = new Headers();
            for (let i = 0; i < incoming.rawHeaders.length; i += 2)
              responseHeaders.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
            const noBody = [204, 205, 304].includes(incoming.statusCode);
            const response = new Response(noBody ? null : Readable.toWeb(incoming), {
              status: incoming.statusCode,
              headers: responseHeaders,
            });
            if (noBody) incoming.resume();
            resolveResponse(response);
          } catch (error) {
            incoming.destroy();
            reject(error);
          }
        },
      );
      req.once("error", reject);
      req.end();
    });
  };
}

async function resolveWithSignal(resolve, host, signal) {
  signal?.throwIfAborted();
  let abort;
  try {
    return await Promise.race([
      resolve(host, { all: true, verbatim: true }),
      new Promise((_, reject) => {
        abort = () => reject(signal.reason);
        signal?.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    if (abort) signal?.removeEventListener("abort", abort);
  }
}
export const publicFetch = createPublicFetch();
