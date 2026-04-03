import {
  FileDownIcon,
  ImageIcon,
  PrinterIcon,
  RulerIcon,
  ScissorsIcon,
  ShieldCheckIcon,
  TypeIcon,
} from "lucide-react";

export default function ProxyPrintingArticle() {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        Proxy printing lets you generate a printable PDF of cards from any deck &mdash; perfect for
        playtesting before you buy. Cards are laid out at standard size (63&times;88&nbsp;mm), nine
        per page, ready to cut and sleeve.
      </p>

      {/* Page layout diagram */}
      <div className="border-border bg-muted/30 rounded-lg border p-4">
        <p className="text-muted-foreground mb-3 text-center text-xs font-medium tracking-wider uppercase">
          PDF page layout
        </p>
        <div className="mx-auto grid max-w-xs grid-cols-3 gap-1.5">
          {Array.from({ length: 9 }, (_, index) => (
            <div
              key={index}
              className="bg-muted/60 border-border flex aspect-[63/88] items-center justify-center rounded border"
            >
              <span className="text-muted-foreground/40 text-[10px] tabular-nums">{index + 1}</span>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground mt-2 text-center text-xs">
          3&times;3 grid &mdash; 9 cards per page, centered on A4 or US Letter
        </p>
      </div>

      {/* Getting started */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Getting started</h2>
        <p className="text-muted-foreground">There are two ways to open the proxy export dialog:</p>
        <div className="mt-3 space-y-2">
          <StepRow
            step={1}
            title="From the deck editor"
            description="Open a deck in the editor and click the Proxies button in the toolbar at the top."
          />
          <StepRow
            step={2}
            title="From the deck list"
            description="On the Decks page, open the three-dot menu on any deck tile and choose Export as proxies."
          />
        </div>
      </section>

      {/* Options */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Export options</h2>
        <p className="text-muted-foreground">
          The dialog lets you customize the PDF before generating it.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <OptionCard
            icon={<ImageIcon className="size-4" />}
            title="Render mode"
            description="Card images uses the actual card art. Text placeholders renders a simplified card with name, stats, and rules text — useful when images aren't available or you want to save ink."
          />
          <OptionCard
            icon={<RulerIcon className="size-4" />}
            title="Page size"
            description="Choose A4 (210 × 297 mm) or US Letter (8.5 × 11 in). Cards are centered on the page regardless of size."
          />
          <OptionCard
            icon={<ScissorsIcon className="size-4" />}
            title="Cut lines"
            description="Adds light gray lines along the edges of each card to guide you when cutting. Helpful if you're not using a paper cutter."
          />
          <OptionCard
            icon={<ShieldCheckIcon className="size-4" />}
            title="Proxy watermark"
            description="Stamps each card with a small 'PROXY' badge so they can't be mistaken for real cards. Enabled by default."
          />
        </div>
      </section>

      {/* Render modes detail */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Render modes</h2>
        <div className="border-border divide-border divide-y rounded-lg border text-sm">
          <RenderModeRow
            icon={<ImageIcon className="size-3.5 text-blue-600 dark:text-blue-400" />}
            mode="Card images"
            description="Full card art at print resolution. Landscape images are automatically rotated to fit. If an image can't be loaded, it falls back to a text placeholder for that card."
          />
          <RenderModeRow
            icon={<TypeIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />}
            mode="Text placeholders"
            description="A styled card showing the name, energy cost, power, type, rules text, and rarity. Uses the same layout as the placeholder cards in the card browser. Great for saving ink or when card art isn't available."
          />
        </div>
      </section>

      {/* Generating */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Generating the PDF</h2>
        <p className="text-muted-foreground">
          Click <strong className="text-foreground">Generate PDF</strong> to start. The dialog shows
          a progress indicator as each unique card is rendered. Once all cards are ready,
          they&apos;re assembled into a multi-page PDF and downloaded as{" "}
          <code className="bg-muted rounded px-1.5 py-0.5 text-xs">proxies.pdf</code>.
        </p>
        <p className="text-muted-foreground mt-2">
          Cards with multiple copies in your deck appear the correct number of times in the PDF
          &mdash; a 3&times; card takes up three slots. Each unique card is only rendered once and
          then reused, so even large decks generate quickly.
        </p>
      </section>

      {/* Printing tips */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Printing tips</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <TipCard
            icon={<PrinterIcon className="size-4" />}
            title="Print at actual size"
            description='In your print dialog, make sure scaling is set to 100% or "Actual size." Shrink-to-fit will make the cards smaller than standard.'
          />
          <TipCard
            icon={<ScissorsIcon className="size-4" />}
            title="Cut carefully"
            description="Enable cut lines in the export options for visual guides. A paper cutter gives cleaner edges than scissors."
          />
          <TipCard
            icon={<FileDownIcon className="size-4" />}
            title="Sleeve over a real card"
            description="Slip each proxy in front of a basic card inside an opaque sleeve. This gives the proxy the right weight and feel for shuffling."
          />
          <TipCard
            icon={<ImageIcon className="size-4" />}
            title="Save ink with text mode"
            description="Text placeholders use far less ink than full card images. Great for quick playtesting where art doesn't matter."
          />
        </div>
      </section>
    </div>
  );
}

function StepRow({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className="border-border bg-background flex gap-3 rounded-lg border p-3">
      <span className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
        {step}
      </span>
      <div>
        <span className="text-sm font-medium">{title}</span>
        <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function OptionCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="border-border bg-background rounded-lg border p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
    </div>
  );
}

function RenderModeRow({
  icon,
  mode,
  description,
}: {
  icon: React.ReactNode;
  mode: string;
  description: string;
}) {
  return (
    <div className="flex gap-3 px-3 py-2.5">
      <div className="flex w-32 shrink-0 items-start gap-2">
        {icon}
        <span className="font-medium">{mode}</span>
      </div>
      <span className="text-muted-foreground">{description}</span>
    </div>
  );
}

function TipCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="border-border bg-background rounded-lg border p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
    </div>
  );
}
