import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleHelpIcon,
  FileUpIcon,
  XCircleIcon,
} from "lucide-react";

export default function ImportExportArticle() {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        OpenRift can import cards from other collection tools and export your collection as a CSV
        file. You&apos;ll find both under{" "}
        <strong className="text-foreground">Import / Export</strong> in the collection sidebar.
      </p>

      {/* \u2500\u2500 Import \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Importing cards</h2>
        <p className="text-muted-foreground">
          Import brings cards from an external CSV file into one of your collections. The process
          has two steps: <strong className="text-foreground">paste or upload</strong> your data,
          then <strong className="text-foreground">review matches</strong> before confirming.
        </p>
      </section>

      {/* Step 1 */}
      <section>
        <h3 className="mb-2 font-semibold">Step 1 &mdash; Provide your data</h3>
        <p className="text-muted-foreground">
          Paste a CSV into the text area, or click the upload button to pick a{" "}
          <code className="bg-muted rounded px-1.5 py-0.5 text-xs">.csv</code> file. Then click{" "}
          <strong className="text-foreground">Parse</strong>. OpenRift auto-detects the source
          format.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FormatCard
            name="Piltover Archive"
            description='Detected by the "Variant Number" column. Supports finish, art variant, and condition fields.'
            columns={["Variant Number", "Card Name", "Quantity", "Set", "Rarity", "Variant Type"]}
          />
          <FormatCard
            name="RiftCore"
            description='Detected by the "RIFTCORE COLLECTION EXPORT" header row. Separates normal and foil quantities.'
            columns={["Card ID", "Card Name", "Standard Qty", "Foil Qty", "Set", "Rarity"]}
          />
        </div>

        <p className="text-muted-foreground mt-3 text-sm">
          Using a different tool? Export it as CSV and try importing &mdash; if the format
          isn&apos;t recognized, OpenRift will tell you. You can request support for new formats on
          GitHub.
        </p>
      </section>

      {/* Step 2 */}
      <section>
        <h3 className="mb-2 font-semibold">Step 2 &mdash; Review matches</h3>
        <p className="text-muted-foreground">
          OpenRift tries to match each row to a printing in the catalog. Every entry gets a match
          status so you can see what needs attention before importing.
        </p>

        {/* Status table */}
        <div className="border-border divide-border mt-3 divide-y rounded-lg border text-sm">
          <StatusRow
            icon={<CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />}
            label="Exact"
            description="Perfect match \u2014 code, finish, and art variant all resolved. Ready to import."
          />
          <StatusRow
            icon={<AlertTriangleIcon className="size-4 text-amber-600 dark:text-amber-400" />}
            label="Ambiguous"
            description="Code matched but multiple printings fit (e.g. signed vs. unsigned, or normal vs. promo). Pick the right one from the dropdown."
          />
          <StatusRow
            icon={<CircleHelpIcon className="size-4 text-amber-600 dark:text-amber-400" />}
            label="Fuzzy"
            description="Code wasn\u2019t found, but a similar card name was. Confirm the suggestion or pick a variant."
          />
          <StatusRow
            icon={<XCircleIcon className="size-4 text-red-600 dark:text-red-400" />}
            label="Unresolved"
            description="No match found. Skip this entry \u2014 it won\u2019t be imported."
          />
        </div>

        {/* Visual mock of a match row */}
        <div className="border-border bg-muted/30 mt-4 rounded-lg border p-3">
          <p className="text-muted-foreground mb-3 text-center text-xs font-medium tracking-wider uppercase">
            Example preview
          </p>
          <div className="divide-border divide-y text-sm">
            <MockMatchRow status="exact" quantity={3} code="OGN-007" name="Fury Rune" tags={[]} />
            <MockMatchRow
              status="ambiguous"
              quantity={1}
              code="OGN-030"
              name="Fury Strike"
              tags={["Foil"]}
            />
            <MockMatchRow
              status="fuzzy"
              quantity={2}
              code="DOM-045"
              name="Zerro Drive"
              tags={["Alt Art"]}
            />
            <MockMatchRow
              status="unresolved"
              quantity={1}
              code="XXX-999"
              name="Unknown Card"
              tags={[]}
            />
          </div>
        </div>

        <p className="text-muted-foreground mt-3">
          Click any row to expand it and see the original data from your CSV. For ambiguous and
          fuzzy matches, use the dropdown to pick the correct printing. You can also{" "}
          <strong className="text-foreground">Skip</strong> entries you don&apos;t want to import
          and <strong className="text-foreground">Undo</strong> if you change your mind.
        </p>

        <p className="text-muted-foreground mt-2">
          Finally, pick a target collection (or create a new one), and click{" "}
          <strong className="text-foreground">Import</strong>. A summary at the bottom shows how
          many copies are ready and how many need attention.
        </p>
      </section>

      {/* \u2500\u2500 Export \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Exporting cards</h2>
        <p className="text-muted-foreground">
          Export downloads your collection as a CSV file. Pick a collection from the dropdown and
          click <strong className="text-foreground">Export</strong>.
        </p>

        <div className="border-border mt-3 overflow-x-auto rounded-lg border text-sm">
          <table className="w-full">
            <thead>
              <tr className="border-border border-b">
                {[
                  "Card ID",
                  "Card Name",
                  "Rarity",
                  "Type",
                  "Domain",
                  "Finish",
                  "Art Variant",
                  "Quantity",
                ].map((header) => (
                  <th
                    key={header}
                    className="bg-muted/50 px-3 py-2 text-left text-xs font-medium whitespace-nowrap"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              <ExampleExportRow
                values={["OGN-007", "Fury Rune", "Common", "Rune", "Fury", "Normal", "normal", "3"]}
              />
              <ExampleExportRow
                values={[
                  "OGN-007a",
                  "Fury Rune",
                  "Showcase",
                  "Rune",
                  "Fury",
                  "Foil",
                  "altart",
                  "1",
                ]}
              />
              <ExampleExportRow
                values={["OGN-030", "Fury Strike", "Rare", "Spell", "Fury", "Foil", "normal", "2"]}
              />
            </tbody>
          </table>
        </div>

        <p className="text-muted-foreground mt-3 text-sm">
          One row per unique printing, with the quantity summing all your copies of that printing.
          The file is named{" "}
          <code className="bg-muted rounded px-1.5 py-0.5 text-xs">
            openrift-<em>collection</em>-<em>date</em>.csv
          </code>
          .
        </p>
      </section>

      {/* How matching works */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">How matching works</h2>
        <p className="text-muted-foreground">
          When you import, OpenRift tries to identify each card in three steps:
        </p>
        <ol className="text-muted-foreground mt-2 list-inside list-decimal space-y-2">
          <li>
            <strong className="text-foreground">Code lookup</strong> &mdash; looks up the short code
            (e.g. <code className="bg-muted rounded px-1.5 py-0.5 text-xs">OGN-007</code>) directly
            in the catalog, then narrows by finish and art variant.
          </li>
          <li>
            <strong className="text-foreground">Name matching</strong> &mdash; if the code
            doesn&apos;t match, falls back to fuzzy name comparison. Cards with a name similarity
            above 70% are offered as suggestions.
          </li>
          <li>
            <strong className="text-foreground">Manual resolution</strong> &mdash; anything still
            unmatched is marked as unresolved. You can skip these entries or look them up manually.
          </li>
        </ol>
      </section>

      {/* Tips */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Tips</h2>
        <ul className="text-muted-foreground list-inside list-disc space-y-1">
          <li>If the same card appears in multiple rows, quantities are combined automatically.</li>
          <li>You can create a new collection during import &mdash; no need to leave the page.</li>
          <li>
            Importing the same file twice adds more copies &mdash; OpenRift tracks individual
            copies, not totals. Only import once per file.
          </li>
          <li>
            The exported CSV uses the same short code format as import, so you can re-import an
            OpenRift export into another account or after a reset.
          </li>
          <li>Entries are sorted by match quality so the ones that need attention appear first.</li>
        </ul>
      </section>
    </div>
  );
}

function FormatCard({
  name,
  description,
  columns,
}: {
  name: string;
  description: string;
  columns: string[];
}) {
  return (
    <div className="border-border bg-background rounded-lg border p-3">
      <div className="mb-1 flex items-center gap-2">
        <FileUpIcon className="text-primary size-4" />
        <span className="text-sm font-medium">{name}</span>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {columns.map((column) => (
          <span
            key={column}
            className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]"
          >
            {column}
          </span>
        ))}
      </div>
    </div>
  );
}

const STATUS_ICONS: Record<string, { icon: React.ReactNode; className: string }> = {
  exact: {
    icon: <CheckCircle2Icon className="size-3.5" />,
    className: "text-emerald-600 dark:text-emerald-400",
  },
  ambiguous: {
    icon: <AlertTriangleIcon className="size-3.5" />,
    className: "text-amber-600 dark:text-amber-400",
  },
  fuzzy: {
    icon: <CircleHelpIcon className="size-3.5" />,
    className: "text-amber-600 dark:text-amber-400",
  },
  unresolved: {
    icon: <XCircleIcon className="size-3.5" />,
    className: "text-red-600 dark:text-red-400",
  },
};

function MockMatchRow({
  status,
  quantity,
  code,
  name,
  tags,
}: {
  status: string;
  quantity: number;
  code: string;
  name: string;
  tags: string[];
}) {
  const config = STATUS_ICONS[status];

  return (
    <div className="flex items-center gap-2 px-2 py-2">
      <span className={config?.className}>{config?.icon}</span>
      <span className="text-muted-foreground w-6 text-right text-xs tabular-nums">
        {quantity}&times;
      </span>
      <code className="bg-muted rounded px-1 py-0.5 text-[11px]">{code}</code>
      <span className="flex-1 truncate text-xs">{name}</span>
      {tags.map((tag) => (
        <span
          key={tag}
          className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] font-medium"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function StatusRow({
  icon,
  label,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <div className="flex gap-3 px-3 py-2.5">
      <div className="flex w-28 shrink-0 items-start gap-2">
        {icon}
        <span className="font-medium">{label}</span>
      </div>
      <span className="text-muted-foreground">{description}</span>
    </div>
  );
}

function ExampleExportRow({ values }: { values: string[] }) {
  return (
    <tr>
      {values.map((value, index) => (
        <td
          key={index}
          className={`px-3 py-1.5 whitespace-nowrap ${index === 0 ? "font-mono text-xs" : "text-muted-foreground"}`}
        >
          {value}
        </td>
      ))}
    </tr>
  );
}
