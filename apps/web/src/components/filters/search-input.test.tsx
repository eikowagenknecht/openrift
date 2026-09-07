import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SearchInput } from "./search-input";

/**
 * The component listens for the native `beforeinput` (React's synthetic one
 * never fires for deletions), so the test dispatches the real event.
 */
function beforeInputEvent(inputType: string) {
  return new InputEvent("beforeinput", { inputType, bubbles: true, cancelable: true });
}

describe("SearchInput", () => {
  it("reports each keystroke through onValueChange", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SearchInput value="" onValueChange={onValueChange} placeholder="Search decks..." />);

    await user.type(screen.getByRole("textbox", { name: "Search decks..." }), "ab");

    expect(onValueChange).toHaveBeenCalledTimes(2);
    expect(onValueChange).toHaveBeenNthCalledWith(1, "a");
    expect(onValueChange).toHaveBeenNthCalledWith(2, "b");
  });

  it("renders the trailing count and hides the clear button when empty", () => {
    render(<SearchInput value="" onValueChange={() => {}} trailing="40 decks" />);

    expect(screen.getByText("40 decks")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
  });

  it("clears via onValueChange by default once there's a value", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SearchInput value="dragon" onValueChange={onValueChange} />);

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(onValueChange).toHaveBeenCalledWith("");
  });

  it("uses a custom onClear handler when provided", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<SearchInput value="dragon" onValueChange={() => {}} onClear={onClear} />);

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("delivers clicks to a button inside leading instead of focusing the input", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <SearchInput
        value=""
        onValueChange={() => {}}
        placeholder="Search cards..."
        leading={
          <button type="button" onClick={onRemove}>
            Remove scope
          </button>
        }
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove scope" }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Search cards..." })).not.toHaveFocus();
  });

  it("focuses the input when non-interactive leading content is clicked", async () => {
    const user = userEvent.setup();
    render(
      <SearchInput
        value=""
        onValueChange={() => {}}
        placeholder="Search cards..."
        leading={<span>in: name</span>}
      />,
    );

    await user.click(screen.getByText("in: name"));

    expect(screen.getByRole("textbox", { name: "Search cards..." })).toHaveFocus();
  });

  it("reports Backspace on an empty field", async () => {
    const user = userEvent.setup();
    const onBackspaceEmpty = vi.fn();
    render(<SearchInput value="" onValueChange={() => {}} onBackspaceEmpty={onBackspaceEmpty} />);

    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{Backspace}");

    expect(onBackspaceEmpty).toHaveBeenCalled();
  });

  it("stays quiet when Backspace deletes a character", async () => {
    const user = userEvent.setup();
    const onBackspaceEmpty = vi.fn();
    render(
      <SearchInput value="dragon" onValueChange={() => {}} onBackspaceEmpty={onBackspaceEmpty} />,
    );

    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{Backspace}");

    expect(onBackspaceEmpty).not.toHaveBeenCalled();
  });

  it("reports a soft keyboard's delete, which arrives without a key event", () => {
    const onBackspaceEmpty = vi.fn();
    render(<SearchInput value="" onValueChange={() => {}} onBackspaceEmpty={onBackspaceEmpty} />);

    fireEvent(screen.getByRole("textbox"), beforeInputEvent("deleteContentBackward"));

    expect(onBackspaceEmpty).toHaveBeenCalledTimes(1);
  });

  it("ignores other input types on an empty field", () => {
    const onBackspaceEmpty = vi.fn();
    render(<SearchInput value="" onValueChange={() => {}} onBackspaceEmpty={onBackspaceEmpty} />);

    fireEvent(screen.getByRole("textbox"), beforeInputEvent("insertText"));

    expect(onBackspaceEmpty).not.toHaveBeenCalled();
  });
});
