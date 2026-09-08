import type {
  CardTradeLiveAnnotation,
  CardTradeLivePhase,
  CardTradeResponse,
  CardTradeRole,
} from "@openrift/shared/types/api/card-trade";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  SharedTradeStatusChip,
  TradeStatusChip,
} from "@/features/groups/components/trade-status-chip";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string;
    params?: Record<string, string>;
    children?: ReactNode;
  } & ComponentProps<"a">) => {
    let path = to;
    for (const [key, value] of Object.entries(params ?? {})) {
      path = path.replace(`$${key}`, value);
    }
    return (
      <a href={path} {...props}>
        {children}
      </a>
    );
  },
}));

function annotation(overrides: Partial<CardTradeLiveAnnotation> = {}): CardTradeLiveAnnotation {
  return {
    printingId: "printing-1",
    role: "giver",
    phase: "asked",
    tradeCount: 1,
    quantity: 1,
    ...overrides,
  };
}

function stubTrade(overrides: Partial<CardTradeResponse> = {}): CardTradeResponse {
  return {
    id: "trade-1",
    groupId: "group-1",
    groupSlug: "summoner-skirmish",
    groupName: "Summoner Skirmish",
    role: "receiver",
    initiator: "receiver",
    counterparty: {
      userId: "user-2",
      name: "Robin",
      image: null,
      gravatarHash: "hash",
      contactMethods: [],
    },
    printingId: "printing-1",
    cardId: "card-1",
    quantity: 1,
    status: "reserved",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    acceptedAt: "2026-08-01T10:00:00.000Z",
    completedAt: null,
    closedAt: null,
    expiresAt: null,
    viewerSyncAppliedAt: null,
    counterpartySyncAppliedAt: null,
    actionNeeded: null,
    ...overrides,
  };
}

function withPerson(userId: string | null, name: string): Partial<CardTradeResponse> {
  return {
    counterparty: { userId, name, image: null, gravatarHash: "h", contactMethods: [] },
  };
}

describe("TradeStatusChip", () => {
  it.each([
    ["giver", "asked", "Requested", "outgoing"],
    ["giver", "offered", "Offered", "outgoing"],
    ["giver", "reserved", "Reserved", "outgoing"],
    ["receiver", "asked", "Requested", "incoming"],
    ["receiver", "offered", "Offered", "incoming"],
    ["receiver", "reserved", "Reserved", "incoming"],
  ] as [CardTradeRole, CardTradeLivePhase, string, string][])(
    "spells out %s/%s as %s (%s)",
    (role, phase, label, direction) => {
      render(<TradeStatusChip detail="label" annotation={annotation({ role, phase })} />);
      expect(screen.getByTitle(`${label} (${direction}) · 1 copy`)).toHaveTextContent(`${label}1`);
    },
  );

  it("draws the two sides with opposite arrows", () => {
    const { container: out } = render(
      <TradeStatusChip
        detail="label"
        annotation={annotation({ role: "giver", phase: "reserved" })}
      />,
    );
    const { container: incoming } = render(
      <TradeStatusChip
        detail="label"
        annotation={annotation({ role: "receiver", phase: "reserved" })}
      />,
    );
    const arrow = (root: HTMLElement) => root.querySelector("svg")?.getAttribute("class");
    expect(arrow(out)).toBeTruthy();
    expect(arrow(incoming)).toBeTruthy();
    expect(out.querySelector("svg")?.innerHTML).not.toBe(incoming.querySelector("svg")?.innerHTML);
  });

  it("keeps the wording in the tooltip in the strip default", () => {
    render(<TradeStatusChip annotation={annotation({ phase: "reserved", quantity: 2 })} />);
    const chip = screen.getByTitle("Reserved (outgoing) · 2 copies");
    expect(chip).toHaveTextContent("2");
    expect(chip).not.toHaveTextContent("Reserved");
  });

  it("drops the number in icon detail", () => {
    render(<TradeStatusChip detail="icon" annotation={annotation({ phase: "reserved" })} />);
    const chip = screen.getByTitle("Reserved (outgoing)");
    expect(chip).not.toHaveTextContent("1");
  });

  it("keeps the word but drops the number in word detail", () => {
    render(
      <TradeStatusChip detail="word" annotation={annotation({ phase: "reserved", quantity: 2 })} />,
    );
    const chip = screen.getByTitle("Reserved (outgoing)");
    expect(chip).toHaveTextContent("Reserved");
    expect(chip).not.toHaveTextContent("2");
  });

  it("shows the cross-printing total when it diverges", () => {
    render(
      <TradeStatusChip
        annotation={annotation({ role: "receiver", phase: "reserved", quantity: 1 })}
        totalCount={3}
      />,
    );
    const chip = screen.getByTitle(
      "Reserved (incoming) · 1 of this printing (3 across all printings)",
    );
    expect(chip).toHaveTextContent("1(3)");
  });

  it("hides a matching total", () => {
    render(
      <TradeStatusChip annotation={annotation({ phase: "offered", quantity: 2 })} totalCount={2} />,
    );
    const chip = screen.getByTitle("Offered (outgoing) · 2 copies");
    expect(chip).not.toHaveTextContent("(2)");
  });

  it("still renders when the displayed printing has none but siblings do", () => {
    render(
      <TradeStatusChip annotation={annotation({ phase: "offered", quantity: 0 })} totalCount={4} />,
    );
    expect(
      screen.getByTitle("Offered (outgoing) · 0 of this printing (4 across all printings)"),
    ).toBeInTheDocument();
  });

  it("renders nothing when the annotation covers no copies", () => {
    const { container } = render(<TradeStatusChip annotation={annotation({ quantity: 0 })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["offered", "Offered (outgoing) · 1 copy"],
    ["reserved", "Reserved (outgoing) · 1 copy"],
  ] as [CardTradeLivePhase, string][])("weights the committed %s state", (phase, title) => {
    render(<TradeStatusChip detail="label" annotation={annotation({ phase })} />);
    expect(screen.getByTitle(title)).toHaveClass("text-foreground", "font-semibold");
  });

  it("leaves a bid muted", () => {
    render(<TradeStatusChip detail="label" annotation={annotation({ phase: "asked" })} />);
    const chip = screen.getByTitle("Requested (outgoing) · 1 copy");
    expect(chip).not.toHaveClass("text-foreground");
    expect(chip).toHaveClass("text-muted-foreground");
  });

  it("stays a plain pill when no trade is passed", () => {
    render(<TradeStatusChip detail="label" annotation={annotation({ phase: "reserved" })} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("links a single counterparty's trades to their trade sheet", () => {
    render(
      <TradeStatusChip
        detail="label"
        annotation={annotation({ role: "receiver", phase: "reserved" })}
        trades={[stubTrade()]}
      />,
    );
    const chip = screen.getByRole("link", { name: "Reserved (incoming) · 1 copy · with Robin" });
    expect(chip).toHaveAttribute("href", "/trades/user-2");
    expect(chip).toHaveTextContent("Reserved1");
  });

  it("keeps a counterparty whose account is gone out of the link", () => {
    render(
      <TradeStatusChip
        annotation={annotation({ role: "receiver", phase: "reserved" })}
        trades={[stubTrade(withPerson(null, "Robin"))]}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByTitle("Reserved (incoming) · 1 copy")).toBeInTheDocument();
  });

  it("opens a picker when several people hold the same printing", async () => {
    const user = userEvent.setup();
    render(
      <TradeStatusChip
        annotation={annotation({ role: "receiver", phase: "reserved", quantity: 3 })}
        trades={[
          stubTrade({ id: "trade-robin", quantity: 2 }),
          stubTrade({ id: "trade-vi", ...withPerson("user-3", "Vi") }),
        ]}
      />,
    );
    await user.click(screen.getByTitle("Reserved (incoming) · 3 copies"));
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/trades/user-2",
      "/trades/user-3",
    ]);
    expect(links[0]).toHaveTextContent("Robin×2");
  });

  it("sums one person's trades on the printing into a single row", async () => {
    const user = userEvent.setup();
    render(
      <TradeStatusChip
        annotation={annotation({ role: "receiver", phase: "reserved", quantity: 4 })}
        trades={[
          stubTrade({ id: "trade-a", quantity: 3 }),
          stubTrade({ id: "trade-b", groupId: "group-2", groupName: "Piltover Pod" }),
          stubTrade({ id: "trade-vi", ...withPerson("user-3", "Vi") }),
        ]}
      />,
    );
    await user.click(screen.getByTitle("Reserved (incoming) · 4 copies"));
    expect(screen.getAllByRole("link")[0]).toHaveTextContent("Robin×4");
  });

  it("keeps the card click from firing when the chip is used", async () => {
    const user = userEvent.setup();
    const onCellClick = vi.fn();
    render(
      // oxlint-disable-next-line eslint/jsx-a11y/click-events-have-key-events, eslint/jsx-a11y/no-static-element-interactions -- stands in for the card cell around the strip
      <div onClick={onCellClick}>
        <TradeStatusChip
          annotation={annotation({ role: "receiver", phase: "reserved" })}
          trades={[stubTrade()]}
        />
      </div>,
    );
    await user.click(screen.getByRole("link"));
    expect(onCellClick).not.toHaveBeenCalled();
  });
});

describe("SharedTradeStatusChip", () => {
  it("says only that the copies are reserved", () => {
    render(<SharedTradeStatusChip />);
    expect(screen.getByTitle("Reserved")).toHaveTextContent("Reserved");
  });

  it("leaves the direction out of the tooltip", () => {
    render(<SharedTradeStatusChip count={2} />);
    expect(screen.queryByTitle(/outgoing/u)).toBeNull();
  });

  it("counts copies without naming anyone", () => {
    render(<SharedTradeStatusChip count={2} />);
    expect(screen.getByTitle("Reserved · 2 copies")).toHaveTextContent("Reserved2");
  });

  it("drops the number in icon detail", () => {
    render(<SharedTradeStatusChip detail="icon" count={2} />);
    expect(screen.getByTitle("Reserved")).not.toHaveTextContent("2");
  });

  it("takes no prop that could carry a name or a phase", () => {
    render(
      <>
        {/* @ts-expect-error -- a shared surface may never name a counterparty */}
        <SharedTradeStatusChip counterpartyName="Robin" />
        {/* @ts-expect-error -- a shared surface may never show a live negotiation */}
        <SharedTradeStatusChip phase="asked" />
        {/* @ts-expect-error -- no free text of any kind */}
        <SharedTradeStatusChip title="Reserved for Robin" />
        {/* @ts-expect-error -- no children to render text through */}
        <SharedTradeStatusChip>Robin</SharedTradeStatusChip>
      </>,
    );
    expect(screen.getAllByTitle("Reserved")).toHaveLength(4);
  });
});
