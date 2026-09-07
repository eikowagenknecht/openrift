// Optimistic copy rows use this prefix until the add API returns a
// server-assigned uuid. Until swapped, the id must not flow into API calls
// (zod rejects with 400) or selection state.

export const TEMP_COPY_ID_PREFIX = "temp-";

export function isTempCopyId(id: string): boolean {
  return id.startsWith(TEMP_COPY_ID_PREFIX);
}
