import type { CardTradeCopyOption, CardTradeCopyOptionsResponse } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TradeSettleChoice, TradeSettleChoiceControl } from "./trade-copy-picker-dialog";

const acceptMutate = vi.fn((_variables: unknown, options?: { onSettled?: () => void }) => {
  options?.onSettled?.();
});
const syncMutate = vi.fn((_variables: unknown, options?: { onSettled?: () => void }) => {
  options?.onSettled?.();
});

let currentOptions: CardTradeCopyOptionsResponse;
let optionsFail = false;

vi.mock("@/hooks/use-card-trades", () => ({
  useAcceptTrade: () => ({ mutate: acceptMutate, isPending: false }),
  useApplyTradeSync: () => ({ mutate: syncMutate, isPending: false }),
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

const { TradeCopyPickerDialog, TradeSettleCopyPickerDialog, useTradeAcceptFlow } =
  await import("./trade-copy-picker-dialog");

function makeCopy(id: string, overrides: Partial<CardTradeCopyOption> = {}): CardTradeCopyOption {
  return {
    id,
    collectionId: `col-${id}`,
    collectionName: `Binder ${id}`,
    pinned: false,
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

const PLAIN_A = makeCopy("copy-a", { collectionName: "Spare Foils" });
const PLAIN_B = makeCopy("copy-b", { collectionName: "Bulk Box" });
const GRADED = makeCopy("copy-graded", {
  collectionName: "Vault",
  grader: "psa",
  grade: 9,
  hasRecordedDetails: true,
});

const settled = vi.fn();
const confirmed = vi.fn();
const cancelled = vi.fn();

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
  syncMutate.mockClear();
  settled.mockClear();
  confirmed.mockClear();
  cancelled.mockClear();
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

    await user.click(checkboxes[0]!);
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(screen.getByText("Pick 1 more copy.")).toBeInTheDocument();

    await user.click(checkboxes[0]!);
    await user.click(checkboxes[2]!);
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(screen.getByText("Unpick 1 copy.")).toBeInTheDocument();
    expect(acceptMutate).not.toHaveBeenCalled();
  });

  it("sends the copies the giver picked, in the server's order", async () => {
    renderFlow();
    const user = await startAccept();

    await screen.findByRole("dialog");
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[1]!);
    await user.click(checkboxes[2]!);
    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(acceptMutate).toHaveBeenCalledTimes(1);
    expect(acceptMutate.mock.calls[0]![0]).toEqual({
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
    expect(
      screen.getByRole("checkbox", { name: /^Spare Foils\s*No details$/u }),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /^Bulk Box\s*No details$/u })).toBeInTheDocument();
  });

  it("names the collection before the copy's badges", async () => {
    renderFlow();
    await startAccept();

    await screen.findByRole("dialog");
    expect(screen.getByRole("checkbox", { name: /^Vault\s*PSA 9$/u })).toBeInTheDocument();
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
    expect(acceptMutate.mock.calls[0]![0]).toEqual({
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
    expect(acceptMutate.mock.calls[0]![0]).toEqual({
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
    expect(acceptMutate.mock.calls[0]![0]).toEqual({
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

function SettleHarness() {
  const [choice, setChoice] = useState<TradeSettleChoice | null>(null);
  const flow: TradeSettleChoiceControl = {
    choice,
    settling: false,
    confirm: (copyIds) => {
      confirmed(copyIds);
      setChoice(null);
    },
    cancel: () => {
      cancelled();
      setChoice(null);
    },
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setChoice({ options: currentOptions, quantity: currentOptions.quantity })}
      >
        Open picker
      </button>
      <TradeSettleCopyPickerDialog flow={flow} cardName="Fury Rune" />
    </>
  );
}

function SettleQueueHarness({ choices }: { choices: TradeSettleChoice[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const choice = index === null ? null : (choices[index] ?? null);
  const flow: TradeSettleChoiceControl = {
    choice,
    settling: false,
    confirm: (copyIds) => {
      confirmed(copyIds);
      setIndex((prev) => (prev === null ? null : prev + 1));
    },
    cancel: () => {
      cancelled();
      setIndex((prev) => (prev === null ? null : prev + 1));
    },
  };
  return (
    <>
      <button type="button" onClick={() => setIndex(0)}>
        Start settling
      </button>
      <TradeSettleCopyPickerDialog flow={flow} cardName="Fury Rune" />
    </>
  );
}

function renderSettleFlow() {
  return render(<SettleHarness />);
}

async function openSettlePicker() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open picker" }));
  return user;
}

describe("TradeSettleCopyPickerDialog", () => {
  beforeEach(() => {
    currentOptions = {
      tradeId: "trade-1",
      quantity: 1,
      choiceMatters: true,
      copies: [{ ...GRADED, pinned: true }, PLAIN_A, PLAIN_B],
    };
  });

  it("opens on the copies the trade has pinned, not the plainest ones", async () => {
    renderSettleFlow();
    await openSettlePicker();

    await screen.findByRole("dialog");
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
    expect(checkboxes[2]).not.toBeChecked();
  });

  it("hands back the copies the giver says actually changed hands", async () => {
    renderSettleFlow();
    const user = await openSettlePicker();

    await screen.findByRole("dialog");
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]!);
    await user.click(checkboxes[2]!);
    await user.click(screen.getByRole("button", { name: "Remove copy" }));

    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(confirmed).toHaveBeenCalledWith(["copy-b"]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("blocks confirm until the pick matches the trade's quantity", async () => {
    renderSettleFlow();
    const user = await openSettlePicker();

    await screen.findByRole("dialog");
    await user.click(screen.getAllByRole("checkbox")[0]!);

    expect(screen.getByRole("button", { name: "Remove copy" })).toBeDisabled();
    expect(screen.getByText("Pick 1 more copy.")).toBeInTheDocument();
    expect(confirmed).not.toHaveBeenCalled();
  });

  it("starts the next queued row on its own copies, not the last row's picks", async () => {
    const user = userEvent.setup();
    render(
      <SettleQueueHarness
        choices={[
          {
            options: {
              tradeId: "trade-1",
              quantity: 1,
              choiceMatters: true,
              copies: [{ ...GRADED, pinned: true }, PLAIN_A],
            },
            quantity: 1,
          },
          {
            options: {
              tradeId: "trade-2",
              quantity: 1,
              choiceMatters: true,
              copies: [{ ...PLAIN_B, pinned: true }, makeCopy("copy-c")],
            },
            quantity: 1,
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Start settling" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Remove copy" }));

    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(2));
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
    expect(screen.getByText("1 copy picked.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove copy" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Remove copy" }));
    expect(confirmed).toHaveBeenNthCalledWith(2, ["copy-b"]);
  });

  it("drops the choice without confirming when the picker is dismissed", async () => {
    renderSettleFlow();
    const user = await openSettlePicker();

    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(confirmed).not.toHaveBeenCalled();
    expect(cancelled).toHaveBeenCalled();
  });
});
