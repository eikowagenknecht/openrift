import type { ContactMethod } from "@openrift/shared/types/api/contact-method";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ContactMethodChips } from "./contact-method-chips";

function method(overrides: Partial<ContactMethod>): ContactMethod {
  return { id: "id-1", type: "discord", value: "seb#1234", ...overrides };
}

describe("ContactMethodChips", () => {
  it("renders nothing when there are no methods", () => {
    const { container } = render(<ContactMethodChips methods={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders email as a mailto link", () => {
    const { getByRole } = render(
      <ContactMethodChips methods={[method({ type: "email", value: "a@b.com" })]} />,
    );
    expect(getByRole("link")).toHaveAttribute("href", "mailto:a@b.com");
  });

  it("renders phone as a tel link with non-dial characters stripped", () => {
    const { getByRole } = render(
      <ContactMethodChips methods={[method({ type: "phone", value: "+49 (151) 23-45" })]} />,
    );
    expect(getByRole("link")).toHaveAttribute("href", "tel:+491512345");
  });

  it("renders whatsapp as a wa.me link with digits only", () => {
    const { getByRole } = render(
      <ContactMethodChips methods={[method({ type: "whatsapp", value: "+49 151 2345" })]} />,
    );
    expect(getByRole("link")).toHaveAttribute("href", "https://wa.me/491512345");
  });

  it("renders a copy button (not a link) for handle-style channels", () => {
    const { queryByRole, getByRole } = render(
      <ContactMethodChips methods={[method({ type: "discord", value: "seb#1234" })]} />,
    );
    expect(queryByRole("link")).toBeNull();
    expect(getByRole("button")).toHaveTextContent("seb#1234");
  });

  it("renders one chip per method", () => {
    const { getByText } = render(
      <ContactMethodChips
        methods={[
          method({ id: "1", type: "discord", value: "seb#1234" }),
          method({ id: "2", type: "email", value: "a@b.com" }),
        ]}
      />,
    );
    expect(getByText("seb#1234")).toBeInTheDocument();
    expect(getByText("a@b.com")).toBeInTheDocument();
  });

  it("orders chips by the canonical channel order, keeping ties stable", () => {
    const { container } = render(
      <ContactMethodChips
        methods={[
          method({ id: "1", type: "in_person", value: "at the store" }),
          method({ id: "2", type: "discord", value: "second#2" }),
          method({ id: "3", type: "discord", value: "first#1" }),
          method({ id: "4", type: "phone", value: "+49 151 2345" }),
        ]}
      />,
    );
    const texts = [...container.querySelectorAll("a, button")].map((chip) => chip.textContent);
    expect(texts).toEqual(["second#2", "first#1", "+49 151 2345", "at the store"]);
  });
});

describe("ContactMethodChips compact", () => {
  it("keeps the value out of the row until the chip is opened", () => {
    const { getByRole, queryByText } = render(
      <ContactMethodChips methods={[method({ type: "discord", value: "seb#1234" })]} compact />,
    );
    expect(queryByText("seb#1234")).toBeNull();
    expect(getByRole("button", { name: "Discord: seb#1234" })).toBeInTheDocument();
  });

  it("shows the label and the value once opened", async () => {
    const user = userEvent.setup();
    const { getByRole, findByText } = render(
      <ContactMethodChips methods={[method({ type: "discord", value: "seb#1234" })]} compact />,
    );
    await user.click(getByRole("button", { name: "Discord: seb#1234" }));
    expect(await findByText("Discord")).toBeInTheDocument();
    expect(await findByText("seb#1234")).toBeInTheDocument();
  });

  it("offers Open as an external link for a linkable channel", async () => {
    const user = userEvent.setup();
    const { getByRole, findByRole } = render(
      <ContactMethodChips methods={[method({ type: "email", value: "a@b.com" })]} compact />,
    );
    expect(document.querySelectorAll("a")).toHaveLength(0);
    await user.click(getByRole("button", { name: "Email: a@b.com" }));
    const open = await findByRole("link", { name: /Open/u });
    expect(open).toHaveAttribute("href", "mailto:a@b.com");
    expect(open).toHaveAttribute("target", "_blank");
    expect(open).toHaveAttribute("rel", "noreferrer");
  });

  it("offers only Copy for a channel that cannot be opened", async () => {
    const user = userEvent.setup();
    const { getByRole, findByRole, queryByRole } = render(
      <ContactMethodChips methods={[method({ type: "discord", value: "seb#1234" })]} compact />,
    );
    await user.click(getByRole("button", { name: "Discord: seb#1234" }));
    expect(await findByRole("button", { name: /Copy/u })).toBeInTheDocument();
    expect(queryByRole("link", { name: /Open/u })).toBeNull();
  });

  it("copies the value and confirms it", async () => {
    // userEvent.setup() installs its own navigator.clipboard stub; asserted
    // by reading the clipboard back, not by spying on writeText.
    const user = userEvent.setup();
    const { getByRole, findByRole } = render(
      <ContactMethodChips methods={[method({ type: "discord", value: "seb#1234" })]} compact />,
    );
    await user.click(getByRole("button", { name: "Discord: seb#1234" }));
    await user.click(await findByRole("button", { name: /Copy/u }));
    expect(await findByRole("button", { name: /Copied/u })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe("seb#1234");
  });

  it("renders one round chip per method", () => {
    const { getAllByRole } = render(
      <ContactMethodChips
        methods={[
          method({ id: "1", type: "discord", value: "seb#1234" }),
          method({ id: "2", type: "telegram", value: "@seb" }),
        ]}
        compact
      />,
    );
    expect(getAllByRole("button")).toHaveLength(2);
  });
});
