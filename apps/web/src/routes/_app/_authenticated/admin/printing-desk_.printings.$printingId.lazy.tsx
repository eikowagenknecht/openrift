import { createLazyFileRoute, useParams } from "@tanstack/react-router";

import { PrintingDeskPrintingPage } from "@/features/admin/components/printing-desk-printing-page";

function PrintingDeskPrintingRoute() {
  const { printingId } = useParams({
    from: "/_app/_authenticated/admin/printing-desk_/printings/$printingId",
  });
  return <PrintingDeskPrintingPage printingId={printingId} />;
}

export const Route = createLazyFileRoute(
  "/_app/_authenticated/admin/printing-desk_/printings/$printingId",
)({
  component: PrintingDeskPrintingRoute,
});
