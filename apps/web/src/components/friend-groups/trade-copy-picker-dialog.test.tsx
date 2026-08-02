import type { CardTradeCopyOption, CardTradeCopyOptionsResponse } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const acceptMutate = vi.fn((_variables: unknown, options?: { onSettled?: () => void }) => {
  options?.onSettled?.();
});

// Mutated per test before rendering; read lazily inside the mocked queryFn.
let currentOptions: CardTradeCopyOptionsResponse;
let optionsFail = false;

vi.mock("@/hooks/use-card-trades", () => ({
  useAcceptTrade: () => ({ mutate: acceptMutate, isPending: false }),
  tradeCopyOptionsQueryOptions: (userId: string, tradeId: string) => ({
    queryKey: ["trades", userId, "copy-options", tradeId],
    queryFn: async () => {
      if (optionsFail) {
        throw new Error("copy options unavailable");
      }
      return currentOptions;
    },
  }),
}));

vi.mock("@/lib/auth-session", () => ({
  useRequiredUserId: () => "user-1",
}));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({
    labels: {
      conditions: { "near-mint": "Near Mint", played: "Played" },
      graders: { psa: "PSA" },
    },
  }),
}));

const { TradeCopyPickerDialog, useTradeAcceptFlow } = await import("./trade-copy-picker-dialog");

function makeCopy(id: string, overrides: Partial<CardTradeCopyOption> = {}): CardTradeCopyOption {
  return {
    id,
    collectionId: `col-${id}`,
    collectionName: `Binder ${id}`,
    condition: null,
    grader: null,
    grade: null,
    notesPublic: null,
    notesPrivate: null,
    isAltered: false,
    links: [],
    hasRecordedDetails: false,
    ...overrides,
  };
}

// Two interchangeable copies plus one the giver would rather keep. The server
// puts the plain ones first, so they are what an unchosen accept would pin.
const PLAIN_A = makeCopy("copy-a", { collectionName: "Spare Foils" });
const PLAIN_B = makeCopy("copy-b", { collectionName: "Bulk Box" });
const GRADED = makeCopy("copy-graded", {
  collectionName: "Vault",
  grader: "psa",
  grade: 9,
  hasRecordedDetails: true,
});

const settled = vi.fn();

function Harness(props: { role?: "giver" | "receiver" }) {
  const flow = useTradeAcceptFlow({ onSettled: settled });
  return (
    <>
      <button
        type="button"
        onClick={() =>
          flow.start({
            tradeId: "trade-1",
            groupSlug: "bothfeld",
            role: props.role ?? "giver",
            cardName: "Fury Rune",
          })
        }
      >
        Accept trade
      </button>
      <TradeCopyPickerDialog flow={flow} />
    </>
  );
}

function renderFlow(props: { role?: "giver" | "receiver" } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness {...props} />
    </QueryClientProvider>,
  );
}

async function startAccept() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Accept trade" }));
  return user;
}

beforeEach(() => {
  acceptMutate.mockClear();
  settled.mockClear();
  optionsFail = false;
  currentOptions = {
    tradeId: "trade-1",
    quantity: 2,
    choiceMatters: true,
    copies: [PLAIN_A, PLAIN_B, GRADED],
  };
});

describe("TradeCopyPickerDialog", () => {
  it("preselects exactly the copies the server would have pinned", async () => {
    renderFlow();
    await startAccept();

    await screen.findByRole("dialog");
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    // The server's order is plainest first, so `copies.slice(0, quantity)` is
    // byte-for-byte what an accept without copyIds would promise.
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[2]).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
  });

  it("blocks confirm until exactly the trade's quantity is picked", async () => {
    renderFlow();
    const user = await startAccept();

    await screen.findByRole("dialog");
    const checkboxes = screen.getAllByRole("checkbox");

    await user.click(checkboxes[0]);
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(screen.getByText("Pick 1 more copy.")).toBeInTheDocument();

    // Back to two, then one too many.
    await user.click(checkboxes[0]);
    await user.click(checkboxes[2]);
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(screen.getByText("Unpick 1 copy.")).toBeInTheDocument();
    expect(acceptMutate).not.toHaveBeenCalled();
  });

  it("sends the copies the giver picked, in the server's order", async () => {
    renderFlow();
    const user = await startAccept();

    await screen.findByRole("dialog");
    const checkboxes = screen.getAllByRole("checkbox");
    // Swap the second plain copy out for the graded one.
    await user.click(checkboxes[1]);
    await user.click(checkboxes[2]);
    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(acceptMutate).toHaveBeenCalledTimes(1);
    expect(acceptMutate.mock.calls[0][0]).toEqual({
      tradeId: "trade-1",
      groupSlug: "bothfeld",
      copyIds: ["copy-a", "copy-graded"],
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(settled).toHaveBeenCalled();
  });

  it("shows what distinguishes each copy", async () => {
    renderFlow();
    await startAccept();

    await screen.findByRole("dialog");
    expect(screen.getByRole("checkbox", { name: /PSA 9/u })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Vault/u })).toBeInTheDocument();
    expect(screen.getAllByText("Nothing recorded")).toHaveLength(2);
  });
});

describe("useTradeAcceptFlow", () => {
  it("accepts with no prompt at all when there is nothing to choose", async () => {
    currentOptions = {
      tradeId: "trade-1",
      quantity: 2,
      choiceMatters: false,
      copies: [PLAIN_A, PLAIN_B],
    };
    renderFlow();
    await startAccept();

    await waitFor(() => expect(acceptMutate).toHaveBeenCalledTimes(1));
    // No copyIds: the server pins the plainest copies itself.
    expect(acceptMutate.mock.calls[0][0]).toEqual({
      tradeId: "trade-1",
      groupSlug: "bothfeld",
      copyIds: undefined,
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("never asks the receiver, whose side owns no copies to promise", async () => {
    renderFlow({ role: "receiver" });
    await startAccept();

    await waitFor(() => expect(acceptMutate).toHaveBeenCalledTimes(1));
    expect(acceptMutate.mock.calls[0][0]).toEqual({
      tradeId: "trade-1",
      groupSlug: "bothfeld",
      copyIds: undefined,
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("falls back to a plain accept when the copy options cannot be read", async () => {
    optionsFail = true;
    renderFlow();
    await startAccept();

    await waitFor(() => expect(acceptMutate).toHaveBeenCalledTimes(1));
    expect(acceptMutate.mock.calls[0][0]).toEqual({
      tradeId: "trade-1",
      groupSlug: "bothfeld",
      copyIds: undefined,
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("settles the row without accepting when the picker is dismissed", async () => {
    renderFlow();
    const user = await startAccept();

    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(acceptMutate).not.toHaveBeenCalled();
    expect(settled).toHaveBeenCalled();
  });
});
