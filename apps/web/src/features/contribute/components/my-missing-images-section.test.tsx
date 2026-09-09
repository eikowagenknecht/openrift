import type { MissingImagePrinting } from "@openrift/shared/contracts/card-submissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
// oxlint-disable-next-line import/first -- must import after vi.mock
import { stubMissingImagePrinting } from "@/test/factories";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { MISSING_IMAGE_ENUMS, stubInitResponse } from "@/test/init-fixtures";

function renderSection(items: MissingImagePrinting[]) {
  missingImages.items = items;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(initKeys.all, stubInitResponse(MISSING_IMAGE_ENUMS));
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

  it("lists the printings under the section heading", () => {
    renderSection([stubMissingImagePrinting(1, { cardName: "Ahri, Alluring" })]);

    expect(
      screen.getByRole("heading", { name: "Cards you own that have no image" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ahri, Alluring/u })).toHaveAttribute(
      "href",
      "/contribute/card/card-1/printing/printing-1/image",
    );
  });
});
