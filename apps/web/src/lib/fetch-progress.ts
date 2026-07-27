/**
 * Fetch a binary resource while reporting transferred bytes.
 *
 * The scanner's assets are tens of megabytes, and a silent await makes a slow
 * connection look like a hang; a byte counter distinguishes the two. `total`
 * is 0 when the server sends no usable content-length (e.g. chunked
 * compression), so callers must render that case without a percentage.
 *
 * @returns The complete response body.
 */
export async function fetchWithProgress(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
  missingHint?: string,
): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(missingHint ?? `${url} failed with status ${response.status}`);
  }
  if (!response.body) {
    return await response.arrayBuffer();
  }

  // A gzip/brotli response reports the encoded length; counting decoded bytes
  // against it would overshoot, so the total is only trusted for identity
  // responses.
  const total =
    response.headers.get("content-encoding") === null
      ? Number(response.headers.get("content-length") ?? 0)
      : 0;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    received += value.byteLength;
    onProgress?.(received, total);
  }

  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}
