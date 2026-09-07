import { createLazyFileRoute } from "@tanstack/react-router";

import { ScanPage } from "@/features/scan/components/scan-page";

export const Route = createLazyFileRoute("/_app/_authenticated/scan")({
  component: ScanPage,
});
