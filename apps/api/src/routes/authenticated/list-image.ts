import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { createApiApp } from "../../openapi.js";
import { renderListImage, siteHostFromOrigin } from "../../services/list-image.js";
import { assertFound } from "../../utils/assertions.js";

/**
 * Owner-authenticated download of a list's share image (ADR-024). The share
 * dialog's "Download image" uses this so it works whether or not the list is
 * publicly shared: the public og:image route resolves by share token, this one
 * resolves the caller's own list by id. Owner-only, served `no-store` (the
 * list is mutable and this is an on-demand, low-traffic download).
 */
export const listImageRoute = createApiApp()
  .basePath("/lists")
  .use(requireAuth)
  .get("/:id/image.png", async (c) => {
    const { lists, canonicalPrintings } = c.get("repos");
    const config = c.get("config");
    const io = c.get("io");
    const userId = getUserId(c);
    const id = c.req.param("id");

    const list = await lists.getByIdForUser(id, userId);
    assertFound(list, "Not found");

    const entries = await lists.entriesWithDetailsAnon(list.id, list.kind);
    const png = await renderListImage(io, {
      ownerName: c.get("user")?.name ?? "Anonymous",
      listName: list.name,
      intent: list.intent,
      kind: list.kind,
      entries,
      siteHost: siteHostFromOrigin(config.corsOrigin),
      canonicalPrintings,
    });

    return new Response(png, {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" },
    });
  });
