import type { PostImageAspect, PostImageLabel } from "@openrift/shared/printing-post-image";
import { MAX_POST_IMAGE_SCALE, POST_IMAGE_ASPECTS } from "@openrift/shared/printing-post-image";

// Relative on purpose: same-origin, so the admin session cookie rides along.
const POST_IMAGE_BASE = "/api/admin/v1/printing-desk/printings";

export interface PrintingPostImageOptions {
  imageFileId?: string | null;
  label: PostImageLabel;
  aspect: PostImageAspect;
  date?: string;
  scale?: 1 | 2;
  showCredit?: boolean;
  detailsLine?: string;
}

export function printingPostImageUrl(
  printingId: string,
  options: PrintingPostImageOptions,
): string {
  const params = new URLSearchParams();
  if (options.imageFileId) {
    params.set("imageFileId", options.imageFileId);
  }
  params.set("label", options.label);
  params.set("aspect", options.aspect);
  if (options.date) {
    params.set("date", options.date);
  }
  if (options.scale === 2) {
    params.set("scale", "2");
  }
  if (options.showCredit === false) {
    params.set("credit", "0");
  }
  if (options.detailsLine) {
    params.set("details", options.detailsLine);
  }
  return `${POST_IMAGE_BASE}/${encodeURIComponent(printingId)}/post-image.png?${params.toString()}`;
}

export const POST_IMAGE_PREVIEW_WIDTH = POST_IMAGE_ASPECTS.square.w / 2;

export function postImagePreviewCaption(aspect: PostImageAspect): string {
  const { w, h } = POST_IMAGE_ASPECTS[aspect];
  return `Preview at half size · ${w} × ${h} · download renders at ${w * MAX_POST_IMAGE_SCALE} px`;
}

export function printingPostImageFilename(
  cardSlug: string,
  label: PostImageLabel,
  aspect: PostImageAspect,
  slideNumber: number,
): string {
  return `${cardSlug}-${label}-${aspect}-${slideNumber}.png`;
}
