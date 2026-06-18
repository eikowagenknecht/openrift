import type { ContactMethod } from "@openrift/shared";
import { render } from "@testing-library/react";
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
});
