import { createFileRoute } from "@tanstack/react-router";

import { CardBrowser } from "@/components/CardBrowser";

import { useDisplaySettings } from "./__root";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  const { showImages, cardFields, maxColumns, setMaxColumns } = useDisplaySettings();

  return (
    <CardBrowser
      showImages={showImages}
      cardFields={cardFields}
      maxColumns={maxColumns}
      onMaxColumnsChange={setMaxColumns}
    />
  );
}
