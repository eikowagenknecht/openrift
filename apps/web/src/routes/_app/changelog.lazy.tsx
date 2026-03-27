import { createLazyFileRoute } from "@tanstack/react-router";

import { ChangelogPage } from "@/components/changelog/changelog-page";
import { Footer } from "@/components/layout/footer";

export const Route = createLazyFileRoute("/_app/changelog")({
  component: ChangelogRoute,
});

function ChangelogRoute() {
  return (
    <>
      <ChangelogPage />
      <Footer />
    </>
  );
}
