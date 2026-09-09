import type * as ReactRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { stubCard, stubPrinting } from "@/test/factories";

const { isAdminMock } = vi.hoisted(() => ({ isAdminMock: vi.fn(() => false) }));

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof ReactRouter>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({
      to,
      params,
      children,
    }: {
      to: string;
      params?: { cardSlug: string; printingId?: string };
      children: ReactNode;
    }) => (
      <a
        href={(params
          ? to.replace("$cardSlug", params.cardSlug).replace("$printingId", params.printingId ?? "")
          : to
        ).replaceAll(/\/\{-\$[^}]+\}/gu, "")}
      >
        {children}
      </a>
    ),
  };
});

vi.mock("@/features/admin/hooks/use-admin", () => ({
  useIsAdmin: () => ({ data: isAdminMock() }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { CardDetailLinks } from "./card-detail-links";

describe("CardDetailLinks", () => {
  it("links to the card page and the correction form", () => {
    render(<CardDetailLinks card={stubCard({ slug: "yasuo" })} />);

    expect(screen.getByRole("link", { name: "Open card page" })).toHaveAttribute(
      "href",
      "/cards/yasuo",
    );
    expect(screen.getByRole("link", { name: "Suggest a correction" })).toHaveAttribute(
      "href",
      "/contribute/card/yasuo",
    );
  });

  it("links to the printing correction form only when given a printing", () => {
    render(<CardDetailLinks card={stubCard({ slug: "yasuo" })} />);
    expect(screen.queryByRole("link", { name: "Fix this printing" })).not.toBeInTheDocument();

    render(
      <CardDetailLinks
        card={stubCard({ slug: "yasuo" })}
        printing={stubPrinting({ id: "p1", card: { slug: "yasuo" } })}
      />,
    );
    expect(screen.getByRole("link", { name: "Fix this printing" })).toHaveAttribute(
      "href",
      "/contribute/card/yasuo/printing/p1",
    );
  });

  it("hides the admin view from non-admins", () => {
    isAdminMock.mockReturnValue(false);
    render(<CardDetailLinks card={stubCard()} />);

    expect(screen.queryByRole("link", { name: "Admin view" })).not.toBeInTheDocument();
  });

  it("shows the admin view to admins", () => {
    isAdminMock.mockReturnValue(true);
    render(<CardDetailLinks card={stubCard({ slug: "yasuo" })} />);

    expect(screen.getByRole("link", { name: "Admin view" })).toHaveAttribute(
      "href",
      "/admin/cards/yasuo",
    );
  });
});
