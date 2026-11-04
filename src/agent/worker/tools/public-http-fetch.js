import { lookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

// Resolve once and pin the selected address in the socket lookup. Keep the
// original URL for Host and TLS SNI/verification.
export function createPublicFetch({ resolve = lookup, requestImpl } = {}) {
  return async function publicFetch(url, { signal, headers, method = "GET" } = {}) {
    const target = new URL(url);
    if (target.protocol !== "https:") throw new Error("Only HTTPS URLs are allowed.");
    const host = target.hostname.replace(/^\[|\]$/g, "");
    const answers = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await resolveWithSignal(resolve, host, signal);
    signal?.throwIfAborted();
    if (!answers.length) throw new Error("Hostname did not resolve to an address.");
    const approved = answers[0];
    return new Promise((resolveResponse, reject) => {
      const request = requestImpl ?? https.request;
      const req = request(
        target,
        {
          method,
          headers,
          signal,
          agent: false,
          rejectUnauthorized: true,
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
