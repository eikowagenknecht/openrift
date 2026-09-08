import { createLazyFileRoute, useSearch } from "@tanstack/react-router";

import { PrintingDeskPostPage } from "@/features/admin/components/printing-desk-post-page";
import { decodePostSlides } from "@/features/admin/lib/printing-post-slides";

function PrintingDeskPostRoute() {
  const { slides, label, aspect, date } = useSearch({
    from: "/_app/_authenticated/admin/printing-desk_/post",
  });
  return (
    <PrintingDeskPostPage
      slides={decodePostSlides(slides)}
      label={label}
      aspect={aspect}
      date={date}
    />
  );
}

export const Route = createLazyFileRoute("/_app/_authenticated/admin/printing-desk_/post")({
  component: PrintingDeskPostRoute,
});
