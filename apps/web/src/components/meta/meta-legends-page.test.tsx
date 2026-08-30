import type { MetaLegendSummary } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  legends: [] as MetaLegendSummary[],
  search: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-router", () => {
  function Anchor({
    to,
    params,
    children,
    className,
  }: {
    to?: string;
    params?: Record<string, string>;
    children?: React.ReactNode;
    className?: string;
  }) {
    const href = Object.entries(params ?? {}).reduce(
      (path, [key, value]) => path.replace(`$${key}`, value),
      to ?? "#",
    );
    return (
      <a href={href} className={className}>
        {children ?? "link"}
      </a>
    );
  }
  return {
    getRouteApi: () => ({
      useSearch: () => captured.search,
      useNavigate: () => () => undefined,
    }),
    Link: Anchor,
    createLink: () => Anchor,
  };
});

vi.mock("@/hooks/use-meta", () => ({
  useMetaLegends: () => ({ data: { legends: captured.legends } }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({
    orders: { domains: ["fury", "calm"] },
    labels: { domains: { fury: "Fury", calm: "Calm" } },
  }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaLegendsPage } from "./meta-legends-page";

function legend(
  name: string,
  slug: string,
  overrides: Partial<MetaLegendSummary> = {},
): MetaLegendSummary {
  return {
    slug,
    legend: { cardId: slug, name, slug, imageId: null, domains: ["fury"], archiveSlug: slug },
    deckCount: 4,
    ...overrides,
  };
}

function renderPage(legends: MetaLegendSummary[], search: Record<string, unknown> = {}) {
  captured.legends = legends;
  captured.search = search;
  render(<MetaLegendsPage />);
}

describe("MetaLegendsPage", () => {
  it("files legends under the name a reader sees", () => {
    renderPage([
      legend("Kennen, Heart of the Tempest", "kennen-heart-of-the-tempest"),
      legend("Azir, Emperor of the Sands", "azir-emperor-of-the-sands"),
    ]);
    const names = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"))
      .filter((href) => href?.startsWith("/meta/legends/") === true);
    expect(names).toEqual([
      "/meta/legends/azir-emperor-of-the-sands",
      "/meta/legends/kennen-heart-of-the-tempest",
    ]);
  });

  it("offers no way to order the list by results", () => {
    renderPage([legend("Kennen, Heart of the Tempest", "kennen-heart-of-the-tempest")]);
    expect(screen.queryByRole("button", { name: /sort/iu })).not.toBeInTheDocument();
    expect(screen.queryByText(/win/iu)).not.toBeInTheDocument();
  });

  it("counts only the lists on file beside each legend", () => {
    renderPage([
      legend("Kennen, Heart of the Tempest", "kennen-heart-of-the-tempest", { deckCount: 38 }),
      legend("Azir, Emperor of the Sands", "azir-emperor-of-the-sands", { deckCount: 1 }),
    ]);
    expect(screen.getByText("38 decklists")).toBeInTheDocument();
    expect(screen.getByText("1 decklist")).toBeInTheDocument();
  });

  it("narrows to the legends whose name matches the query", () => {
    renderPage(
      [
        legend("Kennen, Heart of the Tempest", "kennen-heart-of-the-tempest"),
        legend("Azir, Emperor of the Sands", "azir-emperor-of-the-sands"),
      ],
      { q: "kennen" },
    );
    expect(screen.getByText("Kennen")).toBeInTheDocument();
    expect(screen.queryByText("Azir")).not.toBeInTheDocument();
    expect(screen.getByText("1 of 2 legends")).toBeInTheDocument();
  });

  it("says so when nothing matches instead of showing an empty table", () => {
    renderPage([legend("Kennen, Heart of the Tempest", "kennen-heart-of-the-tempest")], {
      q: "teemo",
    });
    expect(screen.getByText("No legend matches that name.")).toBeInTheDocument();
  });

  it("explains an archive with no standings yet", () => {
    renderPage([]);
    expect(screen.getByText("No legends on record yet")).toBeInTheDocument();
  });
});
