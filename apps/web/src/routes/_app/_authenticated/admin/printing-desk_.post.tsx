import { postDateFromQuery } from "@openrift/shared/printing-post-date";
import type { PostImageAspect, PostImageLabel } from "@openrift/shared/printing-post-image";
import { POST_IMAGE_ASPECTS, POST_IMAGE_LABELS } from "@openrift/shared/printing-post-image";
import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { deskPrintingQueryOptions } from "@/features/admin/hooks/use-printing-desk";
import { POST_DATE_NONE } from "@/features/admin/lib/printing-post-date-default";
import { decodePostSlides } from "@/features/admin/lib/printing-post-slides";
import { adminDistributionChannelsQueryOptions } from "@/hooks/use-distribution-channels";
import { initQueryOptions } from "@/hooks/use-init";
import { adminMarkersQueryOptions } from "@/hooks/use-markers";
import { adminSeoHead } from "@/lib/seo";

interface PostComposerSearch {
  slides: string;
  label?: PostImageLabel;
  aspect?: PostImageAspect;
  date?: string;
}

function readLabel(value: unknown): PostImageLabel | undefined {
  return POST_IMAGE_LABELS.find((label) => label === value);
}

function readDate(value: unknown): string | undefined {
  return value === POST_DATE_NONE ? POST_DATE_NONE : postDateFromQuery(value);
}

function readAspect(value: unknown): PostImageAspect | undefined {
  return Object.keys(POST_IMAGE_ASPECTS).find((aspect) => aspect === value) as
    | PostImageAspect
    | undefined;
}

export const Route = createFileRoute("/_app/_authenticated/admin/printing-desk_/post")({
  head: () => adminSeoHead("Make a post"),
  validateSearch: (search: Record<string, unknown>): PostComposerSearch => {
    const result: PostComposerSearch = {
      slides: typeof search.slides === "string" ? search.slides : "",
    };
    const label = readLabel(search.label);
    if (label !== undefined) {
      result.label = label;
    }
    const aspect = readAspect(search.aspect);
    if (aspect !== undefined) {
      result.aspect = aspect;
    }
    const date = readDate(search.date);
    if (date !== undefined) {
      result.date = date;
    }
    return result;
  },
  loaderDeps: ({ search }) => ({ slides: search.slides }),
  loader: async ({ context, deps }) => {
    const printingIds = [
      ...new Set(decodePostSlides(deps.slides).map((slide) => slide.printingId)),
    ];
    await Promise.all([
      ...printingIds.map((printingId) =>
        context.queryClient.query({
          ...deskPrintingQueryOptions(printingId),
          staleTime: "static",
        }),
      ),
      context.queryClient.query({
        ...adminDistributionChannelsQueryOptions,
        staleTime: "static",
      }),
      context.queryClient.query({ ...adminMarkersQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...initQueryOptions, staleTime: "static" }),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
