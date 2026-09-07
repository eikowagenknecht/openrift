/** `total` is 0 when the server sends no usable content-length; render without a percentage in that case. */
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

  // A gzip/brotli response reports the encoded length, so counting decoded
  // bytes against it would overshoot; only trust it for identity responses.
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
