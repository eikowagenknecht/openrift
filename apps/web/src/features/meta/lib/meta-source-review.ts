import type { MetaOverlayQueueRow, MetaUploadBody } from "@openrift/shared/types/api/meta";

/** What a source is called and how its badge is toned. */
export interface SourceProviderDisplay {
  label: string;
  variant: "outline" | "violet";
}

const USER_SUBMISSION_PROVIDER = "usersubmission";

/** Provider slugs are shown verbatim, except the player's own submission gets a label. */
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
 * The file must be the whole request body, a `{ provider, events }` object.
 * Guessing either from a filename would stage rows under the wrong key.
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
 * there is none to skip. A person's overlay corrects the archive directly, so it has no key.
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
