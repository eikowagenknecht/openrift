import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { CardBrowser } from "@/components/card-browser";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  useEffect(() => {
    document.documentElement.classList.add("hide-scrollbar");
    return () => document.documentElement.classList.remove("hide-scrollbar");
  }, []);

  return <CardBrowser />;
}
