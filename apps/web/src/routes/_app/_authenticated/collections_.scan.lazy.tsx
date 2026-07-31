import { createLazyFileRoute } from "@tanstack/react-router";

import { ScanPage } from "@/components/scan/scan-page";

export const Route = createLazyFileRoute("/_app/_authenticated/collections_/scan")({
  component: ScanPage,
});
