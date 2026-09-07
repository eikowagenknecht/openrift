import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  FileUpIcon,
  SearchIcon,
  XCircleIcon,
} from "lucide-react";

import { Heading } from "@/components/heading";
import { DefinitionList, DefinitionRow } from "@/components/help/definition-list";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Code } from "@/components/ui/code";
import { SOCIAL_LINKS } from "@/lib/social-links";
import { cn } from "@/lib/utils";

export default function ImportExportArticle() {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        OpenRift can import cards from other collection tools and export your collection as a CSV
        file. You&apos;ll find both under{" "}
        <strong className="text-foreground">Import / Export</strong> in the{" "}
        <a href="/collections" className="text-primary hover:underline">
          collection
        </a>{" "}
        sidebar.
      </p>

      <section>
        <Heading className="mb-2">Importing cards</Heading>
        <p className="text-muted-foreground">
          Import brings cards from an external CSV file into one of your collections.{" "}
          <strong className="text-foreground">Paste or upload</strong> your data, then{" "}
          <strong className="text-foreground">review matches</strong> before confirming.
        </p>
      </section>

      <section>
        <h3 className="mb-2 font-semibold">Step 1: Provide your data</h3>
        <p className="text-muted-foreground">
          Paste a CSV into the text area, or click the upload button to pick a <Code>.csv</Code>{" "}
          file. Then click <strong className="text-foreground">Parse</strong>. OpenRift auto-detects
          the source format for the supported tools listed below.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FormatCard
            name="OpenRift"
            description='Detected by the "Art Variant" column. Re-import files exported by OpenRift itself, for example to transfer cards between accounts or restore after a reset.'
            columns={[
              "Card ID",
              "Card Name",
              "Rarity",
              "Type",
              "Domain",
              "Finish",
              "Art Variant",
              "Promo",
              "Quantity",
            ]}
          />
          <FormatCard
            name="Piltover Archive"
            description='Detected by the "Variant Number" column. Supports finish, art variant, and condition fields.'
            columns={[
              "Variant Number",
              "Card Name",
              "Set",
              "Set Prefix",
              "Rarity",
              "Variant Type",
              "Variant Label",
              "Quantity",
              "Language",
              "Condition",
            ]}
          />
          <FormatCard
            name="RiftCore"
            description='Detected by the "RIFTCORE COLLECTION EXPORT" header row. Separates normal and foil quantities.'
            columns={[
              "Card ID",
              "Card Name",
              "Set",
              "Card Number",
              "Type",
              "Rarity",
              "Domain",
              "Standard Qty",
              "Foil Qty",
            ]}
          />
          <FormatCard
            name="RiftMana"
            description='Detected by the "Normal Qty" column. Separates normal and foil quantities and tracks per-condition counts and language.'
            columns={[
              "Card ID",
              "Card Name",
              "Set",
              "Color",
              "Rarity",
              "Normal Qty",
              "Foil Qty",
              "Normal Condition",
              "Foil Condition",
              "Language",
            ]}
          />
        </div>

        <p className="text-muted-foreground mt-3">
          Using a different tool? Export it as CSV and try importing. If the format isn&apos;t
          recognized, OpenRift will tell you. Let me know on{" "}
          <a
            href={SOCIAL_LINKS.discordInvite}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            Discord
          </a>{" "}
          or{" "}
          <a
            href={SOCIAL_LINKS.githubIssues}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            GitHub
          </a>{" "}
          if you&apos;d like support for another tool and I&apos;ll do my best to add it.
        </p>
      </section>

      <section>
        <h3 className="mb-2 font-semibold">Step 2: Review matches</h3>
        <p className="text-muted-foreground">
          OpenRift tries to match each row to a printing in the catalog. Every entry gets a match
          status so you can see what needs attention before importing.
        </p>

        <DefinitionList className="mt-3">
          <DefinitionRow icon={<CheckCircle2Icon className="text-success size-4" />} label="Exact">
            Perfect match: code, finish, and art variant all resolved. Ready to import.
          </DefinitionRow>
          <DefinitionRow
            icon={<AlertTriangleIcon className="text-warning size-4" />}
            label="Needs review"
          >
            OpenRift found a likely match but isn&apos;t sure (e.g. multiple printings fit, or only
            a similar name was found). Use the dropdown to confirm or pick the right one.
          </DefinitionRow>
          <DefinitionRow
            icon={<XCircleIcon className="text-destructive size-4" />}
            label="Unresolved"
          >
            No match found. This row won&apos;t be imported.
          </DefinitionRow>
        </DefinitionList>

        <Callout className="mt-4 p-3">
          <p className="text-muted-foreground mb-3 text-center text-xs font-medium tracking-wide uppercase">
            Example preview
          </p>
          <div className="divide-border divide-y text-sm">
            <MockMatchRow status="exact" quantity={3} code="OGN-007" name="Fury Rune" tags={[]} />
            <MockMatchRow
              status="needs-review"
              quantity={1}
              code="OGN-001"
              name="Blazing Scorcher"
              tags={["Foil"]}
              dropdown="OGN-001 · Foil · Nexus Night"
            />
            <MockMatchRow
              status="unresolved"
              quantity={1}
              code="XXX-999"
              name="Unknown Card"
              tags={[]}
            />
          </div>
        </Callout>

        <p className="text-muted-foreground mt-3">
          Exact matches appear first, followed by entries that need review and unresolved ones.
          Click any row to expand it and see the original data from your CSV. For entries that need
          review, use the dropdown to pick the correct printing, or click the search icon to look up
          any printing in the catalog. You can also{" "}
          <strong className="text-foreground">Skip</strong> entries you don&apos;t want to import
          and <strong className="text-foreground">Unskip</strong> if you change your mind. If the
          same card appears in multiple rows, quantities are combined automatically.
        </p>

        <p className="text-muted-foreground mt-2">
          Finally, pick a target collection (or create a new one), and click{" "}
          <strong className="text-foreground">Import</strong>. A summary at the bottom shows how
          many copies are ready and how many need attention. Don&apos;t import the same file twice:
          OpenRift tracks individual copies, so a second import adds duplicates rather than updating
          totals.
        </p>
      </section>

      <section>
        <Heading className="mb-2">Exporting cards</Heading>
        <p className="text-muted-foreground">
          Export downloads your collection as a CSV file. Pick a collection and a format from the
          dropdowns, then click <strong className="text-foreground">Export</strong>. Choose{" "}
          <strong className="text-foreground">OpenRift CSV</strong> for the columns shown below, or
          one of <strong className="text-foreground">Piltover Archive</strong>,{" "}
          <strong className="text-foreground">RiftMana</strong>, or{" "}
          <strong className="text-foreground">RiftCore</strong> to produce a file in that
          tool&apos;s own layout. Every format re-imports cleanly into OpenRift, though the other
          tools&apos; formats can&apos;t carry everything (RiftMana keeps conditions but not which
          promo a card is, RiftCore has no languages or conditions at all).
        </p>

        <div className="mt-3 overflow-x-auto rounded-lg border text-sm">
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
                  "Promo",
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
                values={[
                  "OGN-001",
                  "Blazing Scorcher",
                  "common",
                  "unit",
                  "fury",
                  "Foil",
                  "normal",
                  "nexus",
                  "1",
                ]}
              />
              <ExampleExportRow
                values={[
                  "OGN-007",
                  "Fury Rune",
                  "common",
                  "rune",
                  "fury",
                  "Normal",
                  "normal",
                  "",
                  "3",
                ]}
              />
              <ExampleExportRow
                values={[
                  "OGN-007a",
                  "Fury Rune",
                  "showcase",
                  "rune",
                  "fury",
                  "Foil",
                  "altart",
                  "",
                  "1",
                ]}
              />
            </tbody>
          </table>
        </div>

        <p className="text-muted-foreground mt-3">
          One row per unique printing, with the quantity summing all your copies of that printing.
          The file is named{" "}
          <Code>
            openrift-<em>collection</em>-<em>date</em>.csv
          </Code>{" "}
          (or <Code>piltover-…</Code>, <Code>riftmana-…</Code>, <Code>riftcore-…</Code> for the
          other formats). The exported CSV uses the same short code format as import, so you can
          re-import an OpenRift export into another account or after a reset.
        </p>
      </section>

      <section>
        <Heading className="mb-2">How matching works</Heading>
        <p className="text-muted-foreground">
          When you import, OpenRift tries to identify each card automatically:
        </p>
        <ol className="text-muted-foreground mt-2 list-inside list-decimal space-y-2">
          <li>
            <strong className="text-foreground">Code lookup:</strong> looks up the short code (e.g.{" "}
            <Code>OGN-007</Code>) in the{" "}
            <a href="/cards" className="text-primary hover:underline">
              catalog
            </a>
            , then narrows by finish, art variant, and promo type. If multiple printings still
            match, the entry is flagged for review.
          </li>
          <li>
            <strong className="text-foreground">Name matching:</strong> if the code isn&apos;t
            found, falls back to fuzzy name comparison. Cards with a similar name are offered as
            suggestions.
          </li>
          <li>
            <strong className="text-foreground">Unresolved:</strong> nothing matched. You can skip
            these or use the search icon to find the right printing manually.
          </li>
        </ol>
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileUpIcon className="text-primary size-4" />
          {name}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-1">
        {columns.map((column) => (
          <span
            key={column}
            className="bg-muted text-muted-foreground text-2xs rounded-md px-1.5 py-0.5 font-mono"
          >
            {column}
          </span>
        ))}
      </CardContent>
    </Card>
  );
}

const STATUS_ICONS: Record<string, { icon: React.ReactNode; className: string }> = {
  exact: {
    icon: <CheckCircle2Icon className="size-3.5" />,
    className: "text-success",
  },
  "needs-review": {
    icon: <AlertTriangleIcon className="size-3.5" />,
    className: "text-warning",
  },
  unresolved: {
    icon: <XCircleIcon className="size-3.5" />,
    className: "text-destructive",
  },
};

function MockMatchRow({
  status,
  quantity,
  code,
  name,
  tags,
  dropdown,
}: {
  status: string;
  quantity: number;
  code: string;
  name: string;
  tags: string[];
  dropdown?: string;
}) {
  const config = STATUS_ICONS[status];

  return (
    <div className="flex items-center gap-2 px-2 py-2">
      <span className={config?.className}>{config?.icon}</span>
      <span className="text-muted-foreground w-6 text-right text-xs tabular-nums">
        {quantity}&times;
      </span>
      <code className="bg-muted text-2xs rounded-md px-1 py-0.5">{code}</code>
      <span className="min-w-0 flex-1 truncate text-xs">{name}</span>
      {tags.map((tag) => (
        <span
          key={tag}
          className="bg-primary/10 text-primary text-2xs rounded-md px-1.5 py-0.5 font-medium"
        >
          {tag}
        </span>
      ))}
      {dropdown && (
        <span className="bg-background text-2xs flex items-center gap-1 rounded-md border px-1.5 py-0.5">
          {dropdown}
          <ChevronDownIcon className="text-muted-foreground size-2.5" />
        </span>
      )}
      <SearchIcon className="text-muted-foreground size-3" />
      <span className="text-muted-foreground text-2xs">Skip</span>
    </div>
  );
}

function ExampleExportRow({ values }: { values: string[] }) {
  return (
    <tr>
      {values.map((value, index) => (
        <td
          key={index}
          className={cn(
            "px-3 py-1.5 whitespace-nowrap",
            index === 0 ? "font-mono text-xs" : "text-muted-foreground",
          )}
        >
          {value}
        </td>
      ))}
    </tr>
  );
}
