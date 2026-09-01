import type {
  MetaSourceFormat,
  MetaSourceTemplate,
} from "@openrift/shared/contracts/admin/meta-catalog";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  templates: null as unknown,
  formats: null as unknown,
  updateTemplate: vi.fn(),
  updateFormat: vi.fn(),
}));

vi.mock("@/hooks/use-admin-meta-catalog", () => ({
  useMetaSourceTemplates: () => ({ data: captured.templates }),
  useMetaSourceFormats: () => ({ data: captured.formats }),
  useUpdateMetaSourceTemplate: () => ({ mutate: captured.updateTemplate, isPending: false }),
  useUpdateMetaSourceFormat: () => ({ mutate: captured.updateFormat, isPending: false }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useDeckFormatList: () => ({
    formats: [
      { slug: "standard", label: "Standard" },
      { slug: "legacy", label: "Legacy" },
    ],
    labels: { standard: "Standard", legacy: "Legacy" },
  }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaSourceVocabularyDialog } from "./meta-source-vocabulary-dialog";

function template(overrides: Partial<MetaSourceTemplate> = {}): MetaSourceTemplate {
  return {
    templateId: "tpl-1",
    sourceName: "Riftbound Regional Qualifier",
    watched: false,
    tier: null,
    suggestedTier: "premier",
    eventCount: 42,
    avgPlayers: 24.5,
    ranEventCount: 40,
    sampleEventName: "Summoner Skirmish Regional Qualifier",
    lastStartAt: "2026-08-15T18:00:00.000Z",
    ...overrides,
  };
}

function sourceFormat(overrides: Partial<MetaSourceFormat> = {}): MetaSourceFormat {
  return {
    sourceFormat: "Standard Constructed",
    eventCount: 1200,
    mappedFormat: "standard",
    ...overrides,
  };
}

function templateRow(name: string) {
  return within(screen.getByRole("row", { name: new RegExp(name, "u") }));
}

function open() {
  render(<MetaSourceVocabularyDialog onClose={vi.fn()} />);
}

describe("MetaSourceVocabularyDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.templates = { templates: [template()] };
    captured.formats = { formats: [sourceFormat()] };
  });

  it("shows the source's own name for a template", () => {
    open();
    expect(screen.getByText("Riftbound Regional Qualifier")).toBeInTheDocument();
    expect(screen.getByText("Summoner Skirmish Regional Qualifier")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("shows the average attendance over the events that have run", () => {
    open();
    expect(screen.getByText("24.5")).toHaveAttribute("title", "Over 40 events that have run");
  });

  it("shows no average for a template whose events are all still ahead", () => {
    captured.templates = {
      templates: [template({ avgPlayers: null, ranEventCount: 0 })],
    };
    open();
    expect(screen.queryByText("24.5")).not.toBeInTheDocument();
  });

  it("falls back to the raw id for a template the source no longer publishes", () => {
    captured.templates = { templates: [template({ sourceName: null })] };
    open();
    expect(screen.getByText("tpl-1")).toBeInTheDocument();
  });

  it("maps a template's tier from the one-click suggestion", async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "Suggest: Premier" }));

    expect(captured.updateTemplate).toHaveBeenCalledWith({ templateId: "tpl-1", tier: "premier" });
  });

  it("maps a template's tier from the dropdown", async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByLabelText("Tier for Riftbound Regional Qualifier"));
    await user.click(await screen.findByRole("option", { name: "Competitive" }));

    expect(captured.updateTemplate).toHaveBeenCalledWith({
      templateId: "tpl-1",
      tier: "competitive",
    });
  });

  it("unmaps a tier with a null rather than a slug meaning nothing", async () => {
    const user = userEvent.setup();
    captured.templates = { templates: [template({ tier: "premier" })] };
    open();

    await user.click(screen.getByLabelText("Tier for Riftbound Regional Qualifier"));
    await user.click(await screen.findByRole("option", { name: "Unmapped" }));

    expect(captured.updateTemplate).toHaveBeenCalledWith({ templateId: "tpl-1", tier: null });
  });

  it("offers no suggestion once a tier is mapped", () => {
    captured.templates = { templates: [template({ tier: "premier" })] };
    open();
    expect(screen.queryByRole("button", { name: /Suggest:/u })).not.toBeInTheDocument();
  });

  it("watches a template on one click, with no name to supply first", async () => {
    const user = userEvent.setup();
    open();

    await user.click(templateRow("Riftbound Regional Qualifier").getByRole("switch"));

    expect(captured.updateTemplate).toHaveBeenCalledWith({ templateId: "tpl-1", watched: true });
  });

  it("switches a watched template back off", async () => {
    const user = userEvent.setup();
    captured.templates = { templates: [template({ watched: true })] };
    open();

    await user.click(templateRow("Riftbound Regional Qualifier").getByRole("switch"));

    expect(captured.updateTemplate).toHaveBeenCalledWith({ templateId: "tpl-1", watched: false });
  });

  it("shows what the source calls a format beside what it maps to", () => {
    open();
    expect(screen.getByText("Standard Constructed")).toBeInTheDocument();
    expect(screen.getByLabelText("Format for Standard Constructed")).toHaveTextContent("Standard");
  });

  it("maps a format onto one of ours", async () => {
    const user = userEvent.setup();
    captured.formats = { formats: [sourceFormat({ mappedFormat: null })] };
    open();

    await user.click(screen.getByLabelText("Format for Standard Constructed"));
    await user.click(await screen.findByRole("option", { name: "Legacy" }));

    expect(captured.updateFormat).toHaveBeenCalledWith({
      sourceFormat: "Standard Constructed",
      mappedFormat: "legacy",
    });
  });

  it("unmaps a format with a null rather than a slug meaning nothing", async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByLabelText("Format for Standard Constructed"));
    await user.click(await screen.findByRole("option", { name: "Unmapped" }));

    expect(captured.updateFormat).toHaveBeenCalledWith({
      sourceFormat: "Standard Constructed",
      mappedFormat: null,
    });
  });

  it("says what it is loading before either list lands", () => {
    captured.templates = undefined;
    captured.formats = undefined;
    open();
    expect(screen.getByText("Loading the templates…")).toBeInTheDocument();
    expect(screen.getByText("Loading the formats…")).toBeInTheDocument();
  });

  it("points at the sync when a landed list is empty, rather than looking stuck", () => {
    captured.templates = { templates: [] };
    captured.formats = { formats: [] };
    open();
    expect(
      screen.getByText("No templates yet. Run a catalogue sync to fetch them."),
    ).toBeInTheDocument();
    expect(screen.getByText("No crawled event carries a format yet.")).toBeInTheDocument();
  });
});
