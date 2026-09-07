/**
 * For JSON that arrives already serialized from the server; avoids parsing
 * and re-serializing a payload that can be several megabytes.
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

export function downloadJSON(data: unknown, filename: string): void {
  downloadJSONText(JSON.stringify(data, null, 2), filename);
}
