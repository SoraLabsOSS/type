import { fetchArrayBufferCorsAware } from "./remote-fetch";

// Kept in sync with apps/web/src/lib/extension-bridge.ts.
const REQUEST_TYPE = "sora-type:fetch-font-request";
const RESPONSE_TYPE = "sora-type:fetch-font-response";

// Only the Sora Type app (and its local dev server) may use the extension
// as a CORS-bypassing fetcher — otherwise any web page could proxy
// arbitrary requests through the extension's host_permissions.
const ALLOWED_ORIGIN_PATTERN =
  /^(?:https:\/\/type\.soralabs\.io\.vn|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)$/;

/**
 * Lets the Sora Type web app ask this content script to fetch a font file
 * it can't reach itself (`?inspectUrl=` pointing at a host without CORS
 * headers). The page posts a request message; the fetch runs with the
 * extension's CORS fallback (direct, then background) and the bytes are
 * posted back. Call once from the content-script entrypoint.
 */
export function setupAppBridge(): void {
  if (!ALLOWED_ORIGIN_PATTERN.test(window.location.origin)) {
    return;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }
    const data = event.data as {
      id?: unknown;
      type?: unknown;
      url?: unknown;
    } | null;
    if (
      data?.type !== REQUEST_TYPE ||
      typeof data.id !== "string" ||
      typeof data.url !== "string"
    ) {
      return;
    }

    let url: URL;
    try {
      url = new URL(data.url);
    } catch {
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return;
    }

    const respond = (payload: { buffer: ArrayBuffer } | { error: string }) => {
      window.postMessage(
        { type: RESPONSE_TYPE, id: data.id, ...payload },
        window.location.origin
      );
    };

    fetchArrayBufferCorsAware(url.href)
      .then((buffer) => respond({ buffer }))
      .catch((error: unknown) =>
        respond({
          error:
            error instanceof Error ? error.message : "Couldn't fetch font.",
        })
      );
  });
}
