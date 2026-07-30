import { onMessage, sendMessage } from "./messaging";

// Keeps String.fromCharCode argument counts below engine limits.
const BASE64_CHUNK_SIZE = 8192;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function fetchOrThrow(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch (${response.status}): ${url}`);
  }
  return response;
}

/**
 * Registers background-side handlers that fetch on behalf of content
 * scripts. The background isn't subject to the page's CORS policy (it has
 * `<all_urls>` host_permissions), so this is the fallback path when a
 * content-script fetch of a cross-origin stylesheet/font is blocked.
 * Call once from the background entrypoint.
 */
export function setupRemoteFetch(): void {
  onMessage("fetchRemoteText", async ({ data }) => {
    const response = await fetchOrThrow(data.url);
    return await response.text();
  });

  onMessage("fetchRemoteBinary", async ({ data }) => {
    const response = await fetchOrThrow(data.url);
    // Messages are JSON-serialized, so binary payloads travel as base64.
    return arrayBufferToBase64(await response.arrayBuffer());
  });
}

/** Fetches text from a content script, falling back to a background fetch
 * when the direct request is CORS-blocked or otherwise fails. */
export async function fetchTextCorsAware(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (response.ok) {
      return await response.text();
    }
  } catch {
    // CORS/network failure — retry via the background below.
  }
  return await sendMessage("fetchRemoteText", { url });
}

/** Fetches a binary file from a content script, falling back to a
 * background fetch when the direct request is CORS-blocked or fails. */
export async function fetchArrayBufferCorsAware(
  url: string
): Promise<ArrayBuffer> {
  try {
    const response = await fetch(url);
    if (response.ok) {
      return await response.arrayBuffer();
    }
  } catch {
    // CORS/network failure — retry via the background below.
  }
  return base64ToArrayBuffer(await sendMessage("fetchRemoteBinary", { url }));
}
