import type { SetListResponse } from "@openrift/shared/types/api/catalog";
import type { InitResponse } from "@openrift/shared/types/api/init";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { setsKeys } from "@/features/cards/lib/cards-query-keys";
// oxlint-disable-next-line import/first -- must import after vi.mock
import type { ContributeFormScope } from "@/features/contribute/components/contribute-form";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { ContributeForm } from "@/features/contribute/components/contribute-form";
// oxlint-disable-next-line import/first -- must import after vi.mock
import type { ContributeFormState } from "@/features/contribute/lib/contribute-json";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { emptyFormState } from "@/features/contribute/lib/contribute-json";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { initKeys } from "@/lib/query-keys";

const mutate = vi.fn();

vi.mock("@/features/contribute/hooks/use-card-submission", () => ({
  useSubmitCard: () => ({
    mutate,
    reset: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
  }),
}));

const INIT_RESPONSE: InitResponse = {
  enums: {
    cardTypes: [{ slug: "unit", label: "Unit", sortOrder: 0 }],
    rarities: [{ slug: "common", label: "Common", sortOrder: 0, color: "#999999" }],
    domains: [{ slug: "fury", label: "Fury", sortOrder: 0, color: "#ff4655" }],
    superTypes: [{ slug: "champion", label: "Champion", sortOrder: 0 }],
    finishes: [{ slug: "normal", label: "Normal", sortOrder: 0 }],
    artVariants: [{ slug: "normal", label: "Normal", sortOrder: 0 }],
    cardSizes: [{ slug: "standard", label: "Standard", sortOrder: 0 }],
    deckFormats: [],
    deckZones: [],
    conditions: [],
    graders: [],
    languages: [{ slug: "EN", label: "English", sortOrder: 0, color: null }],
    markers: [{ slug: "promo", label: "Promo", sortOrder: 0, description: null }],
  },
  keywords: {},
  distributionChannels: [
    {
      id: "channel-1",
      slug: "nexus-night",
      label: "Nexus Night",
      description: null,
      kind: "event",
      parentId: null,
      childrenLabel: null,
    },
  ],
  customTags: [],
  championIdentifierTags: [],
  tagCategories: [],
  tagCategoryMap: {},
};

const SET_LIST_RESPONSE: SetListResponse = {
  sets: [
    {
      id: "set-1",
      slug: "ogn",
      name: "Origins",
      releases: { EN: { releasedAt: "2025-01-01", precision: "day" } },
      setType: "main",
      cardCount: 1,
      printingCount: 1,
      coverImageId: null,
    },
  ],
};

function renderForm(
  initial: ContributeFormState,
  props: { lockedSlug?: string; scope?: ContributeFormScope } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(initKeys.all, INIT_RESPONSE);
  client.setQueryData(setsKeys.all, SET_LIST_RESPONSE);
  return render(
    <QueryClientProvider client={client}>
      <ContributeForm initial={initial} {...props} />
    </QueryClientProvider>,
  );
}

async function openPrintingDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Printing details" }));
}

function cardNameInput(): HTMLElement {
  return screen.getByLabelText("Name *");
}

function openPrintingNameInput(): HTMLElement {
  return screen.getByLabelText("Name");
}

function printingHeaderCodes(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>("span.truncate.font-normal")].map(
    (element) => element.textContent ?? "",
  );
}

function twoCodedPrintings(): ContributeFormState {
  const state = emptyFormState();
  const base = state.printings[0]!;
  state.printings = [
    { ...base, publicCode: "AAA-001/001" },
    { ...base, publicCode: "BBB-002/002" },
  ];
  return state;
}

beforeEach(() => {
  mutate.mockClear();
});

describe("ContributeForm", () => {
  it("renders the empty form state with one printing section", () => {
    renderForm(emptyFormState());

    expect(cardNameInput()).toHaveValue("");
    expect(screen.getAllByRole("button", { name: "New printing" })).toHaveLength(1);
  });

  it("adds a printing and expands it", async () => {
    const user = userEvent.setup();
    renderForm(emptyFormState());

    await user.click(screen.getByRole("button", { name: "Add printing" }));

    const toggles = screen.getAllByRole("button", { name: "New printing" });
    expect(toggles).toHaveLength(2);
    expect(toggles[0]).toHaveAttribute("aria-expanded", "false");
    expect(toggles[1]).toHaveAttribute("aria-expanded", "true");
  });

  it("duplicates a printing right after it, carrying its fields over", async () => {
    const user = userEvent.setup();
    const { container } = renderForm(twoCodedPrintings());

    await user.click(screen.getAllByRole("button", { name: "Copy" })[0]!);

    expect(printingHeaderCodes(container)).toEqual(["AAA-001/001", "AAA-001/001", "BBB-002/002"]);
  });

  it("removes the last printing, leaving the remaining one", async () => {
    const user = userEvent.setup();
    const { container } = renderForm(twoCodedPrintings());

    await user.click(screen.getAllByRole("button", { name: "Remove" })[1]!);

    expect(printingHeaderCodes(container)).toEqual(["AAA-001/001"]);
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("renames a printing that tracked the card name, leaving a diverged one alone", async () => {
    const user = userEvent.setup();
    const state = emptyFormState();
    const base = state.printings[0]!;
    state.printings = [
      { ...base, printedName: "" },
      { ...base, printedName: "Different Name" },
    ];
    renderForm(state);

    await user.type(cardNameInput(), "Ahri");
    await openPrintingDetails(user);
    expect(openPrintingNameInput()).toHaveValue("Ahri");

    await user.click(screen.getAllByRole("button", { name: "New printing" })[1]!);
    await openPrintingDetails(user);
    expect(openPrintingNameInput()).toHaveValue("Different Name");
  });

  it("shows validation errors on an empty submit and does not call the submit mutation", async () => {
    const user = userEvent.setup();
    renderForm(emptyFormState());

    await user.click(screen.getByRole("button", { name: /Submit your contribution/u }));

    expect(screen.getByRole("button", { name: "Card name" })).toBeInTheDocument();
    expect(screen.queryByText("card.name")).not.toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("keeps the card details collapsed until asked for on a blank form", () => {
    renderForm(emptyFormState());

    expect(screen.getByRole("button", { name: "Card details" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByLabelText("Tags")).not.toBeInTheDocument();
  });

  it("opens the card details when the form arrives with some filled in", () => {
    const state = emptyFormState();
    state.card.tags = ["Poro"];
    renderForm(state);

    expect(screen.getByRole("button", { name: "Card details" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("names the set the printed code belongs to", async () => {
    const user = userEvent.setup();
    renderForm(emptyFormState());

    await user.type(screen.getByLabelText("Code *"), "OGN-066/298");

    expect(screen.getByText("Set: Origins")).toBeInTheDocument();
    expect(screen.queryByLabelText("Set")).not.toBeInTheDocument();
  });

  it("offers the set picker when the code names a set we don't have", async () => {
    const user = userEvent.setup();
    renderForm(emptyFormState());

    await user.type(screen.getByLabelText("Code *"), "ZZZ-001/100");

    expect(screen.queryByText(/^Set: /u)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Set")).toBeInTheDocument();
  });

  it("drops the printing list and the card fields when scoped to one printing", () => {
    const state = emptyFormState();
    state.card.name = "Ahri, Alluring";
    renderForm(state, { lockedSlug: "ahri-alluring", scope: "printing" });

    expect(screen.queryByRole("button", { name: "Add printing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Name *")).not.toBeInTheDocument();
    expect(screen.getByText("Ahri, Alluring")).toBeInTheDocument();
  });

  it("offers a jump for every region of the preview card", () => {
    renderForm(emptyFormState());

    expect(screen.getByRole("button", { name: "Add Card name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Flavor text" })).toBeInTheDocument();
  });

  it("opens the card details and focuses the field a preview region stands for", async () => {
    const user = userEvent.setup();
    renderForm(emptyFormState());

    await user.click(screen.getByRole("button", { name: "Add Tags" }));

    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: "Card details" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    });
    await vi.waitFor(() => {
      expect(screen.getByLabelText("Tags")).toHaveFocus();
    });
  });

  it("opens the printing details for a region the printing owns", async () => {
    const user = userEvent.setup();
    renderForm(emptyFormState());

    await user.click(screen.getByRole("button", { name: "Add Flavor text" }));

    await vi.waitFor(() => {
      expect(screen.getByLabelText("Flavor text")).toHaveFocus();
    });
  });

  it("jumps from a validation error to the field that caused it", async () => {
    const user = userEvent.setup();
    const state = emptyFormState();
    state.card.name = "Ahri, Alluring";
    state.slug = "ahri-alluring";
    renderForm(state);

    await user.click(screen.getByRole("button", { name: /Submit your contribution/u }));
    await user.click(screen.getByRole("button", { name: "Printing 1: Code" }));

    await vi.waitFor(() => {
      expect(screen.getByLabelText("Code *")).toHaveFocus();
    });
  });

  it("submits a valid minimal form", async () => {
    const user = userEvent.setup();
    const state = emptyFormState();
    state.slug = "ahri-alluring";
    state.card.name = "Ahri, Alluring";
    state.printings[0]!.publicCode = "OGN-066/298";
    renderForm(state);

    await user.click(screen.getByRole("button", { name: /Submit your contribution/u }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0].card.name).toBe("Ahri, Alluring");
  });
});
