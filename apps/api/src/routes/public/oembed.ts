import { sentenceCaseSlug } from "@openrift/shared/utils";
import { Hono } from "hono";

import type { Variables } from "../../types.js";

/**
 * oEmbed provider endpoint (https://oembed.com) for OpenRift's public share
 * links: answers a `photo` response pointing at the share image already used
 * as the page's og:image.
 */

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;

const CACHE_AGE_SECONDS = 86_400;

const SHARE_KINDS = new Set(["decks", "collections", "lists", "tier-lists", "users"]);

interface ResolvedShare {
  title: string;
  authorName?: string;
  version: string;
}

function versionFromDate(value: Date | string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const epochMs = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(epochMs) ? 0 : epochMs;
}

/** Must belong to the `CORS_ORIGIN` allow-list, or this endpoint is an open SSRF redirector. */
function allowedOrigins(corsOrigin: string | undefined): Set<string> {
  if (!corsOrigin) {
    return new Set();
  }
  return new Set(
    corsOrigin
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  );
}

function parseShareUrl(
  rawUrl: string,
  origins: Set<string>,
): { kind: string; token: string } | undefined {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return undefined;
  }
  if (!origins.has(parsed.origin)) {
    return undefined;
  }
  const segments = parsed.pathname.split("/").filter((segment) => segment.length > 0);
  // Exactly `/{kind}/share/{token}` — sub-pages (e.g. a bundle's single list)
  // have more segments and intentionally don't match.
  if (segments.length !== 3 || segments[1] !== "share") {
    return undefined;
  }
  const [kind, , token] = segments;
  if (!kind || !token || !SHARE_KINDS.has(kind)) {
    return undefined;
  }
  return { kind, token };
}

/**
 * Mirrors the per-surface title/version logic the web route `head()`
 * functions use so the oEmbed image matches the page's og:image.
 */
async function resolveShare(
  repos: Variables["repos"],
  kind: string,
  token: string,
): Promise<ResolvedShare | undefined> {
  switch (kind) {
    case "decks": {
      const found = await repos.decks.findByShareToken(token);
      if (!found) {
        return undefined;
      }
      const formatLabel = sentenceCaseSlug(found.deck.format);
      return {
        title: `${found.deck.name} (${formatLabel} deck)`,
        authorName: found.ownerName ?? undefined,
        version: String(versionFromDate(found.deck.updatedAt)),
      };
    }
    case "collections": {
      const found = await repos.collections.findByShareToken(token);
      if (!found) {
        return undefined;
      }
      // Copies changing does not bump collections.updatedAt, so fold copyCount
      // into the version (matches the web route's og:image cache key).
      return {
        title: `${found.collection.name} (collection)`,
        authorName: found.ownerName ?? undefined,
        version: `${versionFromDate(found.collection.updatedAt)}-${found.collection.copyCount}`,
      };
    }
    case "lists": {
      const found = await repos.lists.findByShareToken(token);
      if (!found) {
        return undefined;
      }
      return {
        title: `${found.list.name} (${found.list.intent} list)`,
        authorName: found.ownerName ?? undefined,
        version: String(versionFromDate(found.list.updatedAt)),
      };
    }
    case "tier-lists": {
      // `findByShareToken` requires is_public, so a revoked link resolves to
      // nothing here exactly as it does on the share page and its image route.
      const found = await repos.tierLists.findByShareToken(token);
      if (!found) {
        return undefined;
      }
      return {
        title: `${found.tierList.title} (tier list)`,
        authorName: found.ownerName ?? undefined,
        version: String(versionFromDate(found.tierList.updatedAt)),
      };
    }
    case "users": {
      const owner = await repos.userShares.findOwnerByShareToken(token);
      if (!owner) {
        return undefined;
      }
      // Anonymous (public-only) projection, like the share image itself.
      const summaries = await repos.userShares.listsForOwner(owner.userId, null);
      const latestUpdate = summaries.reduce(
        (latest, summary) => Math.max(latest, versionFromDate(summary.list.updatedAt)),
        0,
      );
      // Fold the list count into the version so removing a list busts the cache.
      return {
        title: `${owner.displayName ?? "Anonymous"}'s wish & tradelists`,
        authorName: owner.displayName ?? undefined,
        version: `${latestUpdate}-${summaries.length}`,
      };
    }
    default: {
      return undefined;
    }
  }
}

/** Only the reported dimensions shrink to fit maxwidth/maxheight; the image renders at full size. */
function scaledDimensions(maxWidth: number, maxHeight: number): { width: number; height: number } {
  const scale = Math.min(
    maxWidth > 0 ? maxWidth / IMAGE_WIDTH : 1,
    maxHeight > 0 ? maxHeight / IMAGE_HEIGHT : 1,
    1,
  );
  return {
    width: Math.round(IMAGE_WIDTH * scale),
    height: Math.round(IMAGE_HEIGHT * scale),
  };
}

function positiveQuery(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export const publicOembedRoute = new Hono<{ Variables: Variables }>().get("/oembed", async (c) => {
  const format = c.req.query("format");
  // Spec: a provider that can't return the requested format answers 501. We
  // only implement JSON (the default WordPress requests first).
  if (format && format !== "json") {
    return c.json({ error: "Only json format is supported" }, 501);
  }

  const rawUrl = c.req.query("url");
  if (!rawUrl) {
    return c.json({ error: "Missing url parameter" }, 400);
  }

  const config = c.get("config");
  const match = parseShareUrl(rawUrl, allowedOrigins(config.corsOrigin));
  if (!match) {
    return c.json({ error: "Unsupported url" }, 404);
  }

  const resolved = await resolveShare(c.get("repos"), match.kind, match.token);
  if (!resolved) {
    return c.json({ error: "Not found" }, 404);
  }

  // Same-origin as the validated page URL; the image route ignores `?v=` and
  // always renders current state — the version only changes the cache key.
  const origin = new URL(rawUrl).origin;
  const imageUrl = `${origin}/api/v1/${match.kind}/share/${match.token}/image.png?v=${resolved.version}`;
  const { width, height } = scaledDimensions(
    positiveQuery(c.req.query("maxwidth")),
    positiveQuery(c.req.query("maxheight")),
  );

  return c.json({
    version: "1.0",
    type: "photo",
    title: resolved.title,
    ...(resolved.authorName ? { author_name: resolved.authorName } : {}),
    provider_name: "OpenRift",
    provider_url: origin,
    cache_age: CACHE_AGE_SECONDS,
    url: imageUrl,
    width,
    height,
    thumbnail_url: imageUrl,
    thumbnail_width: width,
    thumbnail_height: height,
  });
});
