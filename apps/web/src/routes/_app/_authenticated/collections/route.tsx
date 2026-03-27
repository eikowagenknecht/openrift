import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { createContext, use, useEffect, useState } from "react";

import { CollectionSidebar } from "@/components/collection/collection-sidebar";
import { Footer } from "@/components/layout/footer";
import { Separator } from "@/components/ui/separator";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";

type SetTitle = (title: string) => void;

// oxlint-disable-next-line no-empty-function -- default is a no-op before the provider mounts
const CollectionTitleContext = createContext<SetTitle>(() => {});

/** Call from a child route to set the collection layout header title. */
export function useCollectionTitle(title: string) {
  const setTitle = use(CollectionTitleContext);
  useEffect(() => {
    setTitle(title);
  }, [setTitle, title]);
}

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
  const [title, setTitle] = useState("Collection");

  return (
    <SidebarProvider>
      <CollectionSidebar />
      <CollectionTitleContext value={setTitle}>
        <CollectionContent title={title} />
      </CollectionTitleContext>
    </SidebarProvider>
  );
}

function CollectionContent({ title }: { title: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-12 items-center gap-2 px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-1 h-4 self-center!" />
        <h1 className="text-sm font-medium">{title}</h1>
      </header>
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}
