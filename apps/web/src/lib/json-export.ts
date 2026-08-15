/**
 * Triggers a browser download of JSON text that is already serialized.
 *
 * For payloads that arrive as a string from the server, where parsing them
 * back into objects only to re-serialize would cost a full copy of a file that
 * is several megabytes for no gain.
 *
 * @returns void
 */
export function downloadJSONText(json: string, filename: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Triggers a browser download of the given value serialized as pretty-printed JSON.
 * @returns void
 */
export function downloadJSON(data: unknown, filename: string): void {
  downloadJSONText(JSON.stringify(data, null, 2), filename);
}
