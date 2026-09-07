import type { AdminCardResponse } from "@openrift/shared/types/api/admin";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  rename: vi.fn(),
  deleteCard: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ Link: () => null }));

vi.mock("@/features/admin/hooks/use-admin-card-mutations", () => ({
  useRenameCard: () => ({ mutate: captured.rename, isPending: false }),
  useDeleteCard: () => ({ mutate: captured.deleteCard, isPending: false }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { CardDetailHeader } from "./card-detail-header";

const card = { id: "card-uuid", name: "Yasuo", errata: null } as unknown as AdminCardResponse;

function renderHeader(
  props: Partial<React.ComponentProps<typeof CardDetailHeader>> = {},
): ReturnType<typeof render> {
  const noop = () => {};
  return render(
    <CardDetailHeader
      card={card}
      cardId="yasuo"
      expectedCardId="yasuo"
      sourceCount={2}
      hasUnchecked={false}
      prevNextCards={{ prev: "ahri", next: "zed" }}
      isCheckingAll={false}
      onCheckAllAndNext={noop}
      goToCard={noop}
      goToList={noop}
      onAddBan={noop}
      onAddErrata={noop}
      isAdmin
      {...props}
    />,
  );
}

beforeEach(() => {
  captured.rename.mockReset();
  captured.deleteCard.mockReset();
});

describe("CardDetailHeader", () => {
  it("pluralises the source count", () => {
    expect(renderHeader({ sourceCount: 2 }).getByText("(2 sources)")).toBeTruthy();
    expect(renderHeader({ sourceCount: 1 }).getByText("(1 source)")).toBeTruthy();
  });

  it("shows the run state on the check-all button", () => {
    const { getByText } = renderHeader({ isCheckingAll: true });

    expect(getByText("Checking…")).toBeTruthy();
  });

  it("offers a regenerate when the stored slug no longer matches", () => {
    const { getByText } = renderHeader({ cardId: "yasu", expectedCardId: "yasuo" });

    getByText("Regenerate").click();
    expect(captured.rename).toHaveBeenCalledWith(
      { cardId: "card-uuid", newId: "yasuo" },
      expect.anything(),
    );
  });

  it("stays quiet when the slug is current", () => {
    const { queryByText } = renderHeader();

    expect(queryByText("Regenerate")).toBeNull();
  });

  it("hides the regenerate action from non-admins but still shows the drift", () => {
    const { getByText, queryByText } = renderHeader({
      cardId: "yasu",
      expectedCardId: "yasuo",
      isAdmin: false,
    });

    expect(getByText("→ yasuo")).toBeTruthy();
    expect(queryByText("Regenerate")).toBeNull();
  });

  it("hides the admin actions from non-admins", () => {
    const { queryByText } = renderHeader({ isAdmin: false });

    expect(queryByText("Check all & next")).toBeNull();
  });

  it("navigates to the neighbouring cards", () => {
    const goToCard = vi.fn();
    const { container } = renderHeader({ goToCard });
    const [prev, next] = [...container.querySelectorAll("button")];

    prev?.click();
    next?.click();
    expect(goToCard).toHaveBeenNthCalledWith(1, "ahri");
    expect(goToCard).toHaveBeenNthCalledWith(2, "zed");
  });

  it("disables the arrows at the ends of the run", () => {
    const { container } = renderHeader({ prevNextCards: { prev: null, next: null } });
    const [prev, next] = [...container.querySelectorAll("button")];

    expect(prev?.disabled).toBe(true);
    expect(next?.disabled).toBe(true);
  });
});
