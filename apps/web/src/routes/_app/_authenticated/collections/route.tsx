import { createFileRoute, Outlet, redirect, useMatches } from "@tanstack/react-router";

import { CollectionSidebar } from "@/components/collection/collection-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";

const pageTitles: Record<string, string> = {
  "/_app/_authenticated/collections/": "All Cards",
  "/_app/_authenticated/collections/sources": "Sources",
};

export const Route = createFileRoute("/_app/_authenticated/collections")({
  beforeLoad: async ({ context }) => {
    const flags = (await context.queryClient.ensureQueryData(
      featureFlagsQueryOptions,
    )) as FeatureFlags;
    if (!featureEnabled(flags, "collection")) {
      throw redirect({ to: "/cards" });
    }
  },
  component: CollectionLayout,
});

function CollectionLayout() {
  return (
    <div className="-mx-4 -mt-6 flex-1">
      <SidebarProvider className="min-h-0!">
        <CollectionSidebar />
        <CollectionContent />
      </SidebarProvider>
    </div>
  );
}

function CollectionContent() {
  const matches = useMatches();
  const routeId = matches.at(-1)?.routeId ?? "";
  const title = pageTitles[routeId] ?? "Collection";

  return (
    <div className="relative flex w-full flex-1 flex-col">
      <header className="flex h-12 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-1 h-4! self-center!" />
        <h1 className="text-sm font-medium">{title}</h1>
      </header>
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <Outlet />
      </div>
    </div>
  );
}
