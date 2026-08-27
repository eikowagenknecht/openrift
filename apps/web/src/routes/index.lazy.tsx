import { createLazyFileRoute } from "@tanstack/react-router";

import { LandingPage } from "@/components/landing/landing-page";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { FOOTER_PADDING_NO_TOP } from "@/lib/utils";

export const Route = createLazyFileRoute("/")({
  component: LandingRoute,
});

// The landing stays outside `_app` so the hero gradient spans the viewport
// rather than the container width, so it composes the header and footer itself.
// Only signed-out visitors get here: `__root` beforeLoad redirects a session to
// /cards, which is also what preloads the session the header renders from.
function LandingRoute() {
  return (
    <>
      <Header />
      <LandingPage />
      <Footer className={FOOTER_PADDING_NO_TOP} />
    </>
  );
}
