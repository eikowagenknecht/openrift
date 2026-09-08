import { formatPrintingCode } from "@openrift/shared/printing-code";
import { formatPostDate, postDateFromQuery } from "@openrift/shared/printing-post-date";
import {
  postImageAspectFromQuery,
  postImageCreditFromQuery,
  postImageLabelFromQuery,
  postImageScaleFromQuery,
} from "@openrift/shared/printing-post-image";
import { WellKnown } from "@openrift/shared/well-known";
import type { Hono } from "hono";

import { assertFound } from "../../../lib/assertions.js";
import { requireAdmin } from "../../../middleware/require-admin.js";
import type { Variables } from "../../../types.js";
import { siteHostFromOrigin } from "../../lists/services/list-image.js";
import { renderPrintingPostImage } from "../services/printing-post-image.js";

const PATH = "/api/admin/v1/printing-desk/printings/:printingId/post-image.png";

/**
 * Binary, so not an oRPC procedure. It gates itself: the global admin
 * middleware is registered after this route wins the path match.
 */
export function mountAdminPrintingPostImage(app: Hono<{ Variables: Variables }>): void {
  app.use(PATH, requireAdmin);
  app.get(PATH, async (c) => {
    const repos = c.get("repos");
    const io = c.get("io");
    const config = c.get("config");
    const printingId = c.req.param("printingId");

    const printing = await repos.printingDesk.getPostImageRow(printingId);
    assertFound(printing, "Printing not found");

    const imageFileId = c.req.query("imageFileId") ?? printing.activeImageFileId;
    const label = postImageLabelFromQuery(c.req.query("label"));
    const aspect = postImageAspectFromQuery(c.req.query("aspect"));
    const scale = postImageScaleFromQuery(c.req.query("scale"));
    const postDate = postDateFromQuery(c.req.query("date"));
    const withCredit = postImageCreditFromQuery(c.req.query("credit"));
    const detailsLine = c.req.query("details")?.trim();

    const [channels, markers, finish, imageCredit] = await Promise.all([
      repos.distributionChannels.listForPrintingIds([printingId]),
      repos.markers.listBySlugs(printing.markerSlugs),
      repos.finishes.getBySlug(printing.finish),
      imageFileId && withCredit ? repos.printingDesk.getImageCredit(imageFileId) : undefined,
    ]);

    const leaf = channels[0];
    const parent = leaf?.channelParentId
      ? await repos.distributionChannels.getById(leaf.channelParentId)
      : undefined;
    const channelLabel = leaf
      ? parent
        ? `${parent.label} › ${leaf.channelLabel}`
        : leaf.channelLabel
      : null;

    const png = await renderPrintingPostImage(
      io,
      {
        cardName: printing.cardName,
        publicCode: formatPrintingCode(printing.publicCode),
        finishLabel: finish?.label ?? printing.finish,
        channelLabel,
        markerLabels: markers.map((marker) => marker.label),
        artist: printing.artist,
        siteHost: siteHostFromOrigin(config.corsOrigin),
        imageCredit: imageCredit?.credit ?? null,
        detailsLine: detailsLine || undefined,
        label,
        dateText: postDate === undefined ? undefined : formatPostDate(postDate),
        imageFileId,
        orientation:
          printing.cardType === WellKnown.cardType.BATTLEFIELD ? "landscape" : "portrait",
      },
      aspect,
      scale,
    );

    return new Response(png, {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" },
    });
  });
}
