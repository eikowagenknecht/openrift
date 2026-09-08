import type { DeskImage, DeskPrintingRow } from "@openrift/shared/contracts/admin/printing-desk";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  canEdit: false,
  images: [] as DeskImage[],
  cardPrintings: [] as { id: string }[],
}));
const activate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to?: string; children?: ReactNode }) => (
    <a href={to ?? "/admin/printing-desk"}>{children}</a>
  ),
  createLink: (component: unknown) => component,
  useNavigate: () => vi.fn(),
}));

vi.mock("@/features/admin/components/admin-page-top-bar", () => ({
  AdminPageTopBar: ({ actions }: { actions?: ReactNode }) => <div>{actions}</div>,
}));

vi.mock("@/features/admin/components/printing-desk-form-page", () => ({
  PrintingDeskEditFields: () => <div>Edit fields</div>,
}));

vi.mock("@/features/admin/hooks/use-printing-desk", () => ({
  useDeskPrinting: () => ({ data: { printing: row(), images: state.images } }),
  useSetDeskImageFace: () => ({ mutate: vi.fn() }),
  useUpdateDeskImage: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/features/admin/hooks/use-admin-image-mutations", () => ({
  useActivatePrintingImage: () => ({ mutate: activate }),
  useDeletePrintingImage: () => ({ mutate: vi.fn() }),
  useRotatePrintingImage: () => ({ mutate: vi.fn() }),
  useUploadPrintingImage: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/features/admin/hooks/use-admin-printing-citations", () => ({
  useAdminPrintingCitations: () => ({ data: { citations: [] } }),
  useCreatePrintingCitation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeletePrintingCitation: () => ({ mutate: vi.fn() }),
  useUpdatePrintingCitation: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/use-distribution-channels", () => ({
  useDistributionChannels: () => ({ data: { distributionChannels: [] } }),
}));

vi.mock("@/hooks/use-markers", () => ({
  useMarkers: () => ({ data: { markers: [{ id: "m-1", slug: "stamped", label: "Stamped" }] } }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({
    labels: { finishes: { foil: "Foil" }, cardSizes: { standard: "Standard" } },
  }),
  useLanguageLabels: () => ({ en: "English" }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  // oxlint-disable-next-line typescript/consistent-type-imports -- vitest dynamic import pattern
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useSuspenseQuery: () => ({ data: { printings: state.cardPrintings } }),
}));

vi.mock("@/features/cards/hooks/use-card-detail", () => ({
  freshCardDetailQueryOptions: () => ({ queryKey: ["card-detail"] }),
}));

vi.mock("@/lib/auth-session", () => ({
  useSession: () => ({ data: { user: { name: "Nexus Scout" } } }),
}));

const { PrintingDeskPrintingPage } = await import("./printing-desk-printing-page");

function row(): DeskPrintingRow {
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
    distributionChannelSlugs: [],
    announcedAt: null,
    releasedAt: null,
    releasePrecision: null,
    comment: null,
    imageCount: 0,
    activeImageFileId: null,
    activeImageUrl: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-02T11:00:00.000Z",
    canEdit: state.canEdit,
  };
}

function image(over: Partial<DeskImage> = {}): DeskImage {
  return {
    printingImageId: "pi-1",
    imageFileId: "if-1",
    url: "/media/cards/g1/if-1-full.webp",
    isActive: true,
    rotation: 0,
    face: "front",
    credit: null,
    canDelete: true,
    ...over,
  };
}

beforeEach(() => {
  state.images = [];
  state.cardPrintings = [];
  activate.mockClear();
});

describe("PrintingDeskPrintingPage card page preview", () => {
  it("says so while the catalog has no row for the printing", () => {
    state.canEdit = true;
    render(<PrintingDeskPrintingPage printingId="p-1" />);

    expect(screen.getByText(/Not on the card page yet/u)).toBeInTheDocument();
  });
});

describe("PrintingDeskPrintingPage images", () => {
  it("clears the active side through the Clear button", async () => {
    state.canEdit = true;
    state.images = [image()];
    render(<PrintingDeskPrintingPage printingId="p-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(activate).toHaveBeenCalledWith({ imageId: "pi-1", active: false });
  });

  it("offers no Clear button while no image is active", () => {
    state.canEdit = true;
    state.images = [image({ isActive: false })];
    render(<PrintingDeskPrintingPage printingId="p-1" />);

    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });
});

describe("PrintingDeskPrintingPage details", () => {
  it("hides the edit button when the server says the printing is out of reach", () => {
    state.canEdit = false;
    render(<PrintingDeskPrintingPage printingId="p-1" />);

    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.getByText(/Not a promo/u)).toBeInTheDocument();
  });

  it("offers the edit button when the server says the printing is editable", () => {
    state.canEdit = true;
    render(<PrintingDeskPrintingPage printingId="p-1" />);

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.queryByText(/Not a promo/u)).not.toBeInTheDocument();
  });
});
