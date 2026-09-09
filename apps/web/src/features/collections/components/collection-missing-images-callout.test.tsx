import type { MissingImagePrinting } from "@openrift/shared/contracts/card-submissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

const missingImages = vi.hoisted(() => ({ items: [] as MissingImagePrinting[] }));

vi.mock("@/features/contribute/hooks/use-missing-images", () => ({
  useMyMissingImages: () => ({ data: { items: missingImages.items } }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { useOnboardingStore } from "@/features/account/stores/onboarding-store";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { CollectionMissingImagesCallout } from "@/features/collections/components/collection-missing-images-callout";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { initKeys } from "@/lib/query-keys";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { stubMissingImagePrinting } from "@/test/factories";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { stubInitResponse } from "@/test/init-fixtures";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { createStoreResetter } from "@/test/store-helpers";

const resetOnboarding = createStoreResetter(useOnboardingStore);

function renderCallout(items: MissingImagePrinting[]) {
  missingImages.items = items;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(initKeys.all, stubInitResponse());
  return render(
    <QueryClientProvider client={client}>
      <CollectionMissingImagesCallout />
    </QueryClientProvider>,
  );
}

describe("CollectionMissingImagesCallout", () => {
  beforeEach(resetOnboarding);
  afterEach(resetOnboarding);

  it("renders nothing when nothing is missing an image", () => {
    const { container } = renderCallout([]);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing once the nudge is dismissed", () => {
    useOnboardingStore.getState().dismissMissingImagesNudge();
    const { container } = renderCallout([stubMissingImagePrinting(1)]);

    expect(container).toBeEmptyDOMElement();
  });

  it("points its only link at the contribute page", () => {
    renderCallout([stubMissingImagePrinting(1), stubMissingImagePrinting(2)]);

    expect(screen.getByText("2 cards you own have no photo yet")).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Add photos");
    expect(links[0]).toHaveAttribute("href", "/contribute");
  });

  it("uses singular copy for a single card", () => {
    renderCallout([stubMissingImagePrinting(1)]);

    expect(screen.getByText("1 card you own has no photo yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a photo" })).toBeInTheDocument();
  });
});
