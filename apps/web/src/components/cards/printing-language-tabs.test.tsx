import type { Printing } from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { stubPrinting } from "@/test/factories";

vi.mock("@/hooks/use-enums", () => ({
  useLanguageLabels: () => ({ EN: "English", JA: "Japanese", DE: "German" }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { PrintingLanguageTabs } from "./printing-language-tabs";

const renderList = (printings: Printing[]) => (
  <div>
    {printings.map((printing) => (
      <span key={printing.id}>{printing.shortCode}</span>
    ))}
  </div>
);

describe("PrintingLanguageTabs", () => {
  it("renders the header and a plain list when there is only one language", () => {
    const printings = [stubPrinting({ language: "EN" }), stubPrinting({ language: "EN" })];

    render(
      <PrintingLanguageTabs printings={printings} header={<h3>Printings</h3>}>
        {renderList}
      </PrintingLanguageTabs>,
    );

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Printings" })).toBeInTheDocument();
    for (const printing of printings) {
      expect(screen.getByText(printing.shortCode)).toBeInTheDocument();
    }
  });

  it("offers one tab per language, each with its row count", () => {
    const printings = [
      stubPrinting({ language: "DE" }),
      stubPrinting({ language: "EN" }),
      stubPrinting({ language: "EN" }),
    ];

    render(
      <PrintingLanguageTabs printings={printings} languageOrder={["EN", "JA", "DE"]}>
        {renderList}
      </PrintingLanguageTabs>,
    );

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["EN2", "DE1"]);
    expect(screen.getByRole("tab", { name: /EN/u })).toHaveAttribute("title", "English");
  });

  it("mounts only the open language's list", () => {
    const english = stubPrinting({ language: "EN" });
    const german = stubPrinting({ language: "DE" });

    render(
      <PrintingLanguageTabs printings={[english, german]} defaultLanguage="EN">
        {renderList}
      </PrintingLanguageTabs>,
    );

    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText(english.shortCode)).toBeInTheDocument();
    expect(screen.queryByText(german.shortCode)).not.toBeInTheDocument();
  });

  it("falls back to the first tab when the requested language has no rows", () => {
    const printings = [stubPrinting({ language: "EN" }), stubPrinting({ language: "DE" })];

    render(
      <PrintingLanguageTabs printings={printings} activeLanguage="JA">
        {renderList}
      </PrintingLanguageTabs>,
    );

    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("EN");
    expect(within(screen.getByRole("tabpanel")).getByText(printings[0].shortCode)).toBeVisible();
  });

  it("opens the controlled language", () => {
    const printings = [stubPrinting({ language: "EN" }), stubPrinting({ language: "DE" })];

    render(
      <PrintingLanguageTabs printings={printings} activeLanguage="DE">
        {renderList}
      </PrintingLanguageTabs>,
    );

    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("DE");
  });

  it("reports the picked language", async () => {
    const user = userEvent.setup();
    const onLanguageChange = vi.fn();
    const printings = [stubPrinting({ language: "EN" }), stubPrinting({ language: "DE" })];

    render(
      <PrintingLanguageTabs
        printings={printings}
        activeLanguage="EN"
        onLanguageChange={onLanguageChange}
      >
        {renderList}
      </PrintingLanguageTabs>,
    );

    await user.click(screen.getByRole("tab", { name: /DE/u }));

    expect(onLanguageChange).toHaveBeenCalledWith("DE");
  });

  it("switches tabs on its own when uncontrolled", async () => {
    const user = userEvent.setup();
    const english = stubPrinting({ language: "EN" });
    const german = stubPrinting({ language: "DE" });

    render(
      <PrintingLanguageTabs printings={[english, german]} defaultLanguage="EN">
        {renderList}
      </PrintingLanguageTabs>,
    );

    await user.click(screen.getByRole("tab", { name: /DE/u }));

    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("DE");
    expect(within(screen.getByRole("tabpanel")).getByText(german.shortCode)).toBeInTheDocument();
    expect(screen.queryByText(english.shortCode)).not.toBeInTheDocument();
  });
});
