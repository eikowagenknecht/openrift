import type { MissingImagePrinting } from "@openrift/shared/contracts/card-submissions";
import type { InitResponse } from "@openrift/shared/types/api/init";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    children: ReactNode;
    className?: string;
  }) => {
    let path = to;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        path = path.replace(`$${key}`, value);
      }
    }
    return (
      <a href={path} className={className}>
        {children}
      </a>
    );
  },
}));

const missingImages = vi.hoisted(() => ({ items: [] as MissingImagePrinting[] }));

vi.mock("@/features/contribute/hooks/use-missing-images", () => ({
  useMyMissingImages: () => ({ data: { items: missingImages.items } }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MyMissingImagesSection } from "@/features/contribute/components/my-missing-images-section";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { initKeys } from "@/lib/query-keys";

const INIT_RESPONSE: InitResponse = {
  enums: {
    cardTypes: [],
    rarities: [],
    domains: [],
    superTypes: [],
    finishes: [{ slug: "foil", label: "Foil", sortOrder: 0 }],
    artVariants: [],
    cardSizes: [],
    deckFormats: [],
    deckZones: [],
    conditions: [],
    graders: [],
    languages: [{ slug: "DE", label: "German", sortOrder: 0, color: null }],
    markers: [],
  },
  keywords: {},
  distributionChannels: [],
  customTags: [],
  championIdentifierTags: [],
  tagCategories: [],
  tagCategoryMap: {},
};

function item(index: number, overrides: Partial<MissingImagePrinting> = {}): MissingImagePrinting {
  return {
    printingId: `printing-${index}`,
    cardSlug: `card-${index}`,
    cardName: `Card ${index}`,
    setSlug: "ogn",
    setName: "Origins",
    publicCode: `OGN-${index}`,
    finish: "foil",
    language: "DE",
    copies: 2,
    ...overrides,
  };
}

function renderSection(items: MissingImagePrinting[]) {
  missingImages.items = items;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(initKeys.all, INIT_RESPONSE);
  return render(
    <QueryClientProvider client={client}>
      <MyMissingImagesSection />
    </QueryClientProvider>,
  );
}

describe("MyMissingImagesSection", () => {
  it("renders nothing when the user owns no card without an image", () => {
    const { container } = renderSection([]);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows each printing with its labels and links to its suggest page", () => {
    renderSection([item(1, { cardName: "Ahri, Alluring" })]);

    expect(screen.getByText("Ahri, Alluring")).toBeInTheDocument();
    expect(screen.getByText("Origins · OGN-1 · Foil · German")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ahri, Alluring/u })).toHaveAttribute(
      "href",
      "/contribute/card-1/image/printing-1",
    );
    expect(screen.getByTitle("2 in your collections")).toHaveTextContent("2");
  });

  it("points the primary action at the first printing", () => {
    renderSection([item(1), item(2)]);

    expect(screen.getByRole("link", { name: "Start with the first card" })).toHaveAttribute(
      "href",
      "/contribute/card-1/image/printing-1",
    );
  });

  it("caps the list at twenty rows until the toggle reveals the rest", async () => {
    const user = userEvent.setup();
    renderSection(Array.from({ length: 22 }, (_, index) => item(index + 1)));

    expect(screen.queryByText("Card 21")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show all 22" }));

    expect(screen.getByText("Card 22")).toBeInTheDocument();
  });

  it("shows no toggle when everything already fits", () => {
    renderSection([item(1), item(2)]);

    expect(screen.queryByRole("button", { name: /Show all/u })).not.toBeInTheDocument();
  });
});
