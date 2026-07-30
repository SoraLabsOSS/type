// Kept in sync with apps/extension/utils/app-bridge.ts.
const REQUEST_TYPE = "sora-type:fetch-font-request";
const RESPONSE_TYPE = "sora-type:fetch-font-response";
const BRIDGE_TIMEOUT_MS = 4000;

/**
 * Asks the Sora Type browser extension (if installed) to fetch a font file
 * on this page's behalf — its background fetch isn't subject to CORS, so
 * this rescues `?inspectUrl=` targets whose host sends no
 * `Access-Control-Allow-Origin`. Rejects after a short timeout when the
 * extension isn't installed (its content script never answers).
 */
export function fetchFontViaExtension(url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();

    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Extension bridge timed out"));
    }, BRIDGE_TIMEOUT_MS);

    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }
      const data = event.data as {
        buffer?: unknown;
        error?: unknown;
        id?: unknown;
        type?: unknown;
      } | null;
      if (data?.type !== RESPONSE_TYPE || data.id !== id) {
        return;
      }
      cleanup();
      if (data.buffer instanceof ArrayBuffer) {
        resolve(data.buffer);
      } else {
        reject(
          new Error(
            typeof data.error === "string"
              ? data.error
              : "Extension fetch failed"
          )
        );
      }
    }

    window.addEventListener("message", onMessage);
    window.postMessage({ type: REQUEST_TYPE, id, url }, window.location.origin);
  });
}
