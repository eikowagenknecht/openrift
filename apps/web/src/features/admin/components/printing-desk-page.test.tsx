import type { DeskPrintingRow } from "@openrift/shared/contracts/admin/printing-desk";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  mode: "" as string,
  rows: [] as unknown[],
  csv: null as string | null,
  filename: null as string | null,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    children,
  }: {
    to?: string;
    search?: Record<string, string>;
    children?: ReactNode;
  }) => {
    const query = search ? `?${new URLSearchParams(search).toString()}` : "";
    return <a href={`${to ?? "/admin/printing-desk"}${query}`}>{children}</a>;
  },
  createLink: (component: unknown) => component,
  useNavigate: () => vi.fn(),
}));

vi.mock("@/features/admin/components/admin-page-top-bar", () => ({
  AdminPageTopBar: ({ actions }: { actions?: ReactNode }) => <div>{actions}</div>,
}));

vi.mock("@/features/admin/components/printing-desk-card-search", () => ({
  PrintingDeskCardSearchDialog: () => null,
}));

vi.mock("@/features/admin/hooks/use-printing-desk", () => ({
  useDeskPrintings: (mode: string) => {
    captured.mode = mode;
    return { data: { printings: captured.rows }, isPending: false };
  },
}));

vi.mock("@/hooks/use-distribution-channels", () => ({
  useDistributionChannels: () => ({
    data: {
      distributionChannels: [
        {
          id: "root-1",
          slug: "nexus-night",
          label: "Nexus Night",
          description: null,
          kind: "event",
          sortOrder: 0,
          parentId: null,
          childrenLabel: "Month",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          printingCount: 0,
        },
        {
          id: "leaf-1",
          slug: "nexus-night-2026-10",
          label: "October 2026",
          description: null,
          kind: "event",
          sortOrder: 0,
          parentId: "root-1",
          childrenLabel: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          printingCount: 1,
        },
      ],
    },
  }),
}));

vi.mock("@/hooks/use-markers", () => ({
  useMarkers: () => ({
    data: { markers: [{ id: "m-1", slug: "stamped", label: "Stamped" }] },
  }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({ labels: { finishes: { foil: "Foil", standard: "Standard" } } }),
  useLanguageColors: () => ({ en: "#336699" }),
  useLanguageLabels: () => ({ en: "English" }),
}));

const access = { isAdmin: false };

vi.mock("@/features/admin/hooks/use-admin", () => ({
  useIsAdmin: () => ({ data: access.isAdmin }),
}));

vi.mock("@/features/collections/lib/csv-export", async (importOriginal) => {
  // oxlint-disable-next-line typescript/consistent-type-imports -- vitest dynamic import pattern
  const original = await importOriginal<typeof import("@/features/collections/lib/csv-export")>();
  return {
    ...original,
    downloadCSV: (csv: string, filename: string) => {
      captured.csv = csv;
      captured.filename = filename;
    },
  };
});

const { PrintingDeskPage } = await import("./printing-desk-page");

function row(overrides: Partial<DeskPrintingRow> = {}): DeskPrintingRow {
  return {
    printingId: "p-1",
    slug: "en-ogn-101-foil-standard",
    cardId: "c-1",
    cardSlug: "annie-dark-child",
    cardName: "Annie, Dark Child",
    cardType: "Champion Unit",
    setId: "s-1",
    setName: "Origins",
    setSlug: "origins",
    shortCode: "OGN-101",
    publicCode: "OGN-101",
    rarity: "epic",
    finish: "foil",
    language: "en",
    size: "standard",
    artist: "Kudos Productions",
    markerSlugs: ["stamped"],
    distributionChannelSlugs: ["nexus-night-2026-10"],
    announcedAt: null,
    releasedAt: null,
    releasePrecision: null,
    comment: null,
    imageCount: 0,
    activeImageFileId: null,
    activeImageUrl: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-02T11:00:00.000Z",
    canEdit: true,
    ...overrides,
  };
}

const released = row({
  printingId: "p-2",
  cardName: "Yasuo, Windchaser",
  cardSlug: "yasuo-windchaser",
  publicCode: "OGN-202",
  releasedAt: "2020-01-01",
  releasePrecision: "day",
  imageCount: 2,
});

beforeEach(() => {
  captured.mode = "";
  captured.rows = [];
  captured.csv = null;
  captured.filename = null;
});

describe("PrintingDeskPage", () => {
  it("starts a grant holder on the printings they added", () => {
    access.isAdmin = false;
    render(<PrintingDeskPage />);

    expect(captured.mode).toBe("mine");
  });

  it("starts a full admin on all promos", () => {
    access.isAdmin = true;
    render(<PrintingDeskPage />);

    expect(captured.mode).toBe("all");
    access.isAdmin = false;
  });

  it("shows a row per printing with its code, channel and image count", () => {
    captured.rows = [row(), released];
    render(<PrintingDeskPage />);

    expect(screen.getByText("Annie, Dark Child")).toBeInTheDocument();
    expect(screen.getByText("OGN-101")).toBeInTheDocument();
    expect(screen.getAllByText("Nexus Night › October 2026")).toHaveLength(2);
    expect(screen.getByText("no images")).toBeInTheDocument();
    expect(screen.getByText("2 images")).toBeInTheDocument();
  });

  it("renders an unannounced code as Code TBA", () => {
    captured.rows = [row({ publicCode: "TBA" })];
    render(<PrintingDeskPage />);

    expect(screen.getByText("Code TBA")).toBeInTheDocument();
  });

  it("marks a dated printing released and an undated one announced", () => {
    captured.rows = [row(), released];
    render(<PrintingDeskPage />);

    expect(screen.getByText("Announced")).toBeInTheDocument();
    expect(screen.getByText("Released")).toBeInTheDocument();
  });

  it("filters the list by card name", async () => {
    const user = userEvent.setup();
    captured.rows = [row(), released];
    render(<PrintingDeskPage />);

    await user.type(screen.getByLabelText("Filter by card name or code"), "yasuo");

    expect(screen.queryByText("Annie, Dark Child")).not.toBeInTheDocument();
    expect(screen.getByText("Yasuo, Windchaser")).toBeInTheDocument();
  });

  it("counts the rows the filter left", async () => {
    const user = userEvent.setup();
    captured.rows = [row(), released];
    render(<PrintingDeskPage />);

    expect(screen.getByText("2 printings")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Filter by card name or code"), "yasuo");
    expect(screen.getByText("1 printing")).toBeInTheDocument();
  });

  it("asks for all promos when the toggle is switched", async () => {
    const user = userEvent.setup();
    captured.rows = [row()];
    render(<PrintingDeskPage />);

    await user.click(screen.getByRole("button", { name: "All promos" }));

    expect(captured.mode).toBe("all");
  });

  it("explains an empty filter result differently from an empty desk", async () => {
    const user = userEvent.setup();
    captured.rows = [row()];
    render(<PrintingDeskPage />);

    await user.type(screen.getByLabelText("Filter by card name or code"), "zaun");

    expect(screen.getByText(/No printing matches the filter/u)).toBeInTheDocument();
  });

  it("points a first-time user at the New printing action", () => {
    render(<PrintingDeskPage />);

    expect(screen.getByText(/Start with/u)).toBeInTheDocument();
  });

  it("exports the rows the filter left, with the channel path resolved", async () => {
    const user = userEvent.setup();
    captured.rows = [row(), released];
    render(<PrintingDeskPage />);

    await user.type(screen.getByLabelText("Filter by card name or code"), "annie");
    await user.click(screen.getByRole("button", { name: /Export CSV/u }));

    expect(captured.csv).toContain("Nexus Night › October 2026");
    expect(captured.csv).not.toContain("Yasuo");
    expect(captured.filename).toMatch(/^printing-desk-mine-\d{4}-\d{2}-\d{2}\.csv$/u);
  });

  it("cannot export an empty list", () => {
    render(<PrintingDeskPage />);

    expect(screen.getByRole("button", { name: /Export CSV/u })).toBeDisabled();
  });
});

const withImage = row({
  printingId: "p-3",
  cardName: "Jinx, Loose Cannon",
  cardSlug: "jinx-loose-cannon",
  publicCode: "OGN-303",
  imageCount: 1,
  activeImageFileId: "img-3",
  activeImageUrl: "/media/cards/img-3",
});

const alsoWithImage = row({
  printingId: "p-4",
  cardName: "Vi, Piltover Enforcer",
  cardSlug: "vi-piltover-enforcer",
  publicCode: "OGN-404",
  imageCount: 1,
  activeImageFileId: "img-4",
  activeImageUrl: "/media/cards/img-4",
});

describe("PrintingDeskPage selection", () => {
  it("offers no post action until a row is ticked", () => {
    captured.rows = [withImage];
    render(<PrintingDeskPage />);

    expect(screen.queryByText(/Make a post/u)).not.toBeInTheDocument();
  });

  it("links the post composer with the ticked printings encoded as slides", async () => {
    const user = userEvent.setup();
    captured.rows = [withImage, alsoWithImage];
    render(<PrintingDeskPage />);

    await user.click(screen.getByRole("checkbox", { name: "Select Jinx, Loose Cannon" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Vi, Piltover Enforcer" }));

    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Make a post/u })).toHaveAttribute(
      "href",
      "/admin/printing-desk/post?slides=p-3%3Aimg-3%2Cp-4%3Aimg-4",
    );
  });

  it("leaves a ticked printing without an image out and says so", async () => {
    const user = userEvent.setup();
    captured.rows = [withImage, row()];
    render(<PrintingDeskPage />);

    await user.click(screen.getByRole("checkbox", { name: "Select Jinx, Loose Cannon" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Annie, Dark Child" }));

    expect(screen.getByText("1 without an image was left out")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Make a post/u })).toHaveAttribute(
      "href",
      "/admin/printing-desk/post?slides=p-3%3Aimg-3",
    );
  });

  it("cannot post when every ticked printing lacks an image", async () => {
    const user = userEvent.setup();
    captured.rows = [row()];
    render(<PrintingDeskPage />);

    await user.click(screen.getByRole("checkbox", { name: "Select Annie, Dark Child" }));

    expect(screen.getByRole("button", { name: /Make a post/u })).toBeDisabled();
  });

  it("keeps a ticked printing selected when the filter hides it", async () => {
    const user = userEvent.setup();
    captured.rows = [withImage, alsoWithImage];
    render(<PrintingDeskPage />);

    await user.click(screen.getByRole("checkbox", { name: "Select Jinx, Loose Cannon" }));
    await user.type(screen.getByLabelText("Filter by card name or code"), "vi,");

    expect(screen.queryByText("Jinx, Loose Cannon")).not.toBeInTheDocument();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });
});
