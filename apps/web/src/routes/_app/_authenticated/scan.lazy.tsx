import { createLazyFileRoute } from "@tanstack/react-router";

import { ScanPage } from "@/components/scan/scan-page";

export const Route = createLazyFileRoute("/_app/_authenticated/scan")({
  component: ScanPage,
});
