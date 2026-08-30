/**
 * The counters and checkpoint fields every meta-sync crawl reports, declared
 * once so a source cannot drift on what `complete` or `coveredThrough` mean:
 * `isResumableCheckpoint` and the admin panel read this shape whatever wrote it.
 */
export interface MetaSyncResultBase {
  /** Listing requests this run spent. */
  requests: number;
  /** Listing rows read, including ones already up to date. */
  rows: number;
  inserted: number;
  changed: number;
  unchanged: number;
  /** Rows a covering crawl stopped returning; flagged, never deleted. */
  missing: number;
  autoAccepted: number;
  /** False when a skip, the request budget, a block, or a cancel left a gap. */
  complete: boolean;
  /** Every event starting at or before this was attempted. The resume point. */
  coveredThrough: string | null;
  /** The prior run this one resumed from, when it did. */
  resumedFrom: string | null;
  cancelRequested: boolean;
  errors: string[];
}

export function emptyMetaSyncResult(): MetaSyncResultBase {
  return {
    requests: 0,
    rows: 0,
    inserted: 0,
    changed: 0,
    unchanged: 0,
    missing: 0,
    autoAccepted: 0,
    complete: true,
    coveredThrough: null,
    resumedFrom: null,
    cancelRequested: false,
    errors: [],
  };
}
