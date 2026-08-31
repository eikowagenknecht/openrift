import type { MetaOverlayQueueRow, MetaUploadBody } from "@openrift/shared";

// Pure helpers for the Meta Archive's review surfaces (ADR-014): naming the
// source a row came from, and parsing a push provider's upload file.

/** What a source is called and how its badge is toned. */
export interface SourceProviderDisplay {
  label: string;
  variant: "outline" | "violet";
}

/** The provider a player's own submission is staged under. */
const USER_SUBMISSION_PROVIDER = "usersubmission";

/**
 * Label and badge tone for the source a row came from. Provider slugs are
 * the sources' own words and are shown verbatim, with one exception: a player's
 * submission is not a crawler and reads as one unless it is named.
 *
 * @param provider - The row's provider slug.
 * @returns The display label and the Badge variant to render it with.
 */
export function sourceProviderDisplay(provider: string): SourceProviderDisplay {
  if (provider === USER_SUBMISSION_PROVIDER) {
    return { label: "User submission", variant: "violet" };
  }
  return { label: provider, variant: "outline" };
}

export type MetaUploadParseResult =
  | { ok: true; body: MetaUploadBody }
  | { ok: false; error: string };

/**
 * Parses an upload file. The file must be the whole request body — a
 * `{ provider, events }` object — because provider and events travel together
 * and guessing either from a filename would silently stage rows under the wrong
 * key.
 *
 * @param text - Raw file contents.
 * @returns The parsed body, or the reason it was rejected.
 */
export function parseMetaUploadFile(text: string): MetaUploadParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "Not valid JSON." };
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { ok: false, error: "Expected a JSON object with `provider` and `events`." };
  }
  const body = json as Partial<MetaUploadBody>;
  if (typeof body.provider !== "string" || body.provider.trim().length === 0) {
    return { ok: false, error: "Missing a non-empty `provider` string." };
  }
  if (!Array.isArray(body.events) || body.events.length === 0) {
    return { ok: false, error: "Missing a non-empty `events` array." };
  }
  return { ok: true, body: { provider: body.provider.trim(), events: body.events } };
}

/** The ignore-list key one queue row's dismiss writes. */
export type MetaSourceDismissTarget =
  | { kind: "event"; provider: string; externalId: string }
  | { kind: "player"; provider: string; eventExternalId: string; externalId: string };

/**
 * The source key a dismiss on this row would skip from now on, or null when
 * there is none to skip.
 *
 * A person's overlay has no key at all — it is a correction to the archive, not
 * a row some crawl will produce again — so dismissing one would mean nothing. A
 * player key is scoped to its event, so both halves have to be present before
 * the control is offered.
 *
 * @param row - The queue row being reviewed.
 * @returns The key to write, or null when the row carries none.
 */
export function sourceDismissTarget(row: MetaOverlayQueueRow): MetaSourceDismissTarget | null {
  const { provider, sourceEventExternalId, sourcePlayerExternalId } = row;
  if (provider === null || sourceEventExternalId === null) {
    return null;
  }
  if (row.kind === "event") {
    return { kind: "event", provider, externalId: sourceEventExternalId };
  }
  if (sourcePlayerExternalId === null) {
    return null;
  }
  return {
    kind: "player",
    provider,
    eventExternalId: sourceEventExternalId,
    externalId: sourcePlayerExternalId,
  };
}
