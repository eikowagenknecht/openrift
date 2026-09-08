import type { SetListResponse } from "@openrift/shared/types/api/catalog";
import type { InitResponse } from "@openrift/shared/types/api/init";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setsKeys } from "@/features/cards/lib/cards-query-keys";
import { ContributeForm } from "@/features/contribute/components/contribute-form";
import type { ContributeFormState } from "@/features/contribute/lib/contribute-json";
import { emptyFormState } from "@/features/contribute/lib/contribute-json";
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

function renderForm(initial: ContributeFormState, lockedSlug?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(initKeys.all, INIT_RESPONSE);
  client.setQueryData(setsKeys.all, SET_LIST_RESPONSE);
  return render(
    <QueryClientProvider client={client}>
      <ContributeForm initial={initial} lockedSlug={lockedSlug} />
    </QueryClientProvider>,
  );
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
    expect(openPrintingNameInput()).toHaveValue("Ahri");

    await user.click(screen.getAllByRole("button", { name: "New printing" })[1]!);
    expect(openPrintingNameInput()).toHaveValue("Different Name");
  });

  it("shows validation errors on an empty submit and does not call the submit mutation", async () => {
    const user = userEvent.setup();
    renderForm(emptyFormState());

    await user.click(screen.getByRole("button", { name: /Submit your contribution/u }));

    expect(screen.getByText("card.name")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
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
