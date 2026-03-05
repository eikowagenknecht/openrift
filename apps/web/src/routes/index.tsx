import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { CardBrowser } from "@/components/card-browser";

import { useDisplaySettings } from "./__root";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  const { showImages, cardFields, maxColumns, setMaxColumns } = useDisplaySettings();

  useEffect(() => {
    document.documentElement.classList.add("hide-scrollbar");
    return () => document.documentElement.classList.remove("hide-scrollbar");
  }, []);

  return (
    <CardBrowser
      showImages={showImages}
      cardFields={cardFields}
      maxColumns={maxColumns}
      onMaxColumnsChange={setMaxColumns}
    />
  );
}
