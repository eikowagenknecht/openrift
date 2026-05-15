// Optimistic copy rows inserted by useBatchedAddCopies live in the synced
// copies collection with this prefix until the add API returns a server-
// assigned uuid and the temp row is swapped for the real one. Until that
// swap happens the id is not a valid uuid, so it must not flow into API
// calls (zod rejects with 400) or selection state.

export const TEMP_COPY_ID_PREFIX = "temp-";

/**
 * @returns Whether the given copy id is an optimistic placeholder rather
 *   than a server-confirmed row.
 */
export function isTempCopyId(id: string): boolean {
  return id.startsWith(TEMP_COPY_ID_PREFIX);
}
