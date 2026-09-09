import type { MissingImagePrinting } from "@openrift/shared/contracts/card-submissions";
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

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MissingImagesList } from "@/features/contribute/components/missing-images-list";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { initKeys } from "@/lib/query-keys";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { stubMissingImagePrinting } from "@/test/factories";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { MISSING_IMAGE_ENUMS, stubInitResponse } from "@/test/init-fixtures";

function renderList(items: MissingImagePrinting[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(initKeys.all, stubInitResponse(MISSING_IMAGE_ENUMS));
  return render(
    <QueryClientProvider client={client}>
      <MissingImagesList items={items} />
    </QueryClientProvider>,
  );
}

describe("MissingImagesList", () => {
  it("shows each printing with its labels and links to its suggest page", () => {
    renderList([stubMissingImagePrinting(1, { cardName: "Ahri, Alluring" })]);

    expect(screen.getByText("Ahri, Alluring")).toBeInTheDocument();
    expect(screen.getByText("Origins · OGN-1 · Foil · German")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ahri, Alluring/u })).toHaveAttribute(
      "href",
      "/contribute/card/card-1/printing/printing-1/image",
    );
    expect(screen.getByTitle("2 in your collections")).toHaveTextContent("2");
  });

  it("caps the list at ten rows until the toggle reveals the rest", async () => {
    const user = userEvent.setup();
    renderList(Array.from({ length: 12 }, (_, index) => stubMissingImagePrinting(index + 1)));

    expect(screen.queryByText("Card 11")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show all 12" }));

    expect(screen.getByText("Card 12")).toBeInTheDocument();
  });

  it("shows no toggle when everything already fits", () => {
    renderList([stubMissingImagePrinting(1), stubMissingImagePrinting(2)]);

    expect(screen.queryByRole("button", { name: /Show all/u })).not.toBeInTheDocument();
  });
});
