import { createLogger } from "@openrift/shared/logger";
import { Hono } from "hono";

import type { Fetch } from "../../../io.js";
import type { Variables } from "../../../types.js";

const log = createLogger("sentry-tunnel");

const MAX_ENVELOPE_BYTES = 1_000_000;

// Tunnels envelopes through our own origin because `*.ingest.sentry.io` is on
// Firefox ETP and ad-blocker blocklists.
// Forward is fire-and-forget: the browser gets a 200 immediately, and the SDK
// never reads the response, so upstream 429s are only logged, not backed off from.
export const sentryTunnelRoute = new Hono<{ Variables: Variables }>().post(
  "/sentry-tunnel",
  async (c) => {
    const { sentryDsnSsr } = c.get("config");
    const { fetch } = c.get("io");

    if (!sentryDsnSsr) {
      return c.json({ error: "Sentry tunnel not configured" }, 503);
    }

    const allowed = new URL(sentryDsnSsr);
    const allowedProjectId = allowed.pathname.replace(/^\/+/u, "");

    const body = await c.req.raw.arrayBuffer();
    if (body.byteLength > MAX_ENVELOPE_BYTES) {
      return c.body(null, 413);
    }

    const text = new TextDecoder().decode(body);
    const newlineIdx = text.indexOf("\n");
    if (newlineIdx === -1) {
      return c.body(null, 400);
    }

    let envelopeDsn: URL;
    try {
      const header = JSON.parse(text.slice(0, newlineIdx)) as { dsn?: string };
      if (!header.dsn) {
        return c.body(null, 400);
      }
      envelopeDsn = new URL(header.dsn);
    } catch {
      return c.body(null, 400);
    }

    const projectId = envelopeDsn.pathname.replace(/^\/+/u, "");
    if (envelopeDsn.host !== allowed.host || projectId !== allowedProjectId) {
      return c.body(null, 400);
    }

    const headers: Record<string, string> = {
      "content-type": c.req.header("content-type") ?? "application/x-sentry-envelope",
    };
    const encoding = c.req.header("content-encoding");
    if (encoding) {
      headers["content-encoding"] = encoding;
    }

    void forwardEnvelope(fetch, envelopeDsn.host, projectId, headers, body);

    return c.body(null, 200);
  },
);

async function forwardEnvelope(
  fetch: Fetch,
  ingestHost: string,
  projectId: string,
  headers: Record<string, string>,
  body: ArrayBuffer,
): Promise<void> {
  try {
    const upstream = await fetch(`https://${ingestHost}/api/${projectId}/envelope/`, {
      method: "POST",
      headers,
      body,
      redirect: "manual",
    });
    if (!upstream.ok) {
      log.warn({ status: upstream.status, projectId }, "Sentry ingest rejected envelope");
    }
    // Drain so the connection can be released back to the pool.
    await upstream.arrayBuffer();
  } catch (error) {
    log.warn({ error: String(error) }, "Failed to forward envelope to Sentry ingest");
  }
}
