import type { AdminSetResponse, ReleasePrecision, SetRelease, SetReleases } from "@openrift/shared";
import {
  formatReleasePeriod,
  isReleased,
  normalizeToPeriodStart,
  WellKnown,
} from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { AdminTable } from "@/components/admin/admin-table";
import type {
  AdminCellSlotProps,
  AdminColumnDef,
  AdminDraftSlotProps,
} from "@/components/admin/admin-table";
import { CountBadge } from "@/components/admin/count-badge";
import { PageDescription } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLanguageList } from "@/hooks/use-enums";
import {
  useCreateSet,
  useDeleteSet,
  useReorderSets,
  useSets,
  useUpdateSet,
} from "@/hooks/use-sets";
import { swapForReorder } from "@/lib/admin-reorder";

interface SetDraft {
  id: string;
  name: string;
  printedTotal: string;
  setType: "main" | "supplemental";
}

const PRECISIONS: ReleasePrecision[] = ["day", "month", "quarter", "year"];

function IdCell({ row }: AdminCellSlotProps<AdminSetResponse>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono">{row.slug}</span>;
}

function NameCell({ row }: AdminCellSlotProps<AdminSetResponse>) {
  if (!row) {
    return null;
  }
  return row.name;
}

function PrintedTotalCell({ row }: AdminCellSlotProps<AdminSetResponse>) {
  if (!row) {
    return null;
  }
  return row.printedTotal;
}

function ReleasesCell({ row }: AdminCellSlotProps<AdminSetResponse>) {
  if (!row) {
    return null;
  }
  const languages = Object.keys(row.releases).toSorted();
  if (languages.length === 0) {
    return <span className="text-muted-foreground">not announced</span>;
  }
  // Released state is derived from the date, so it is shown, never edited.
  return (
    <div className="flex flex-wrap gap-1">
      {languages.map((language) => (
        <Badge
          key={language}
          variant={isReleased(row.releases[language]) ? "default" : "secondary"}
        >
          {language} {formatReleasePeriod(row.releases[language])}
        </Badge>
      ))}
    </div>
  );
}

function SetTypeCell({ row }: AdminCellSlotProps<AdminSetResponse>) {
  if (!row) {
    return null;
  }
  return (
    <Badge variant={row.setType === WellKnown.setType.MAIN ? "default" : "secondary"}>
      {row.setType}
    </Badge>
  );
}

function CardsCell({ row }: AdminCellSlotProps<AdminSetResponse>) {
  if (!row) {
    return null;
  }
  if (row.cardCount === 0) {
    return <CountBadge count={0} />;
  }
  return (
    <Link to="/admin/cards" search={{ set: row.slug }} className="hover:opacity-70">
      <CountBadge count={row.cardCount} />
    </Link>
  );
}

function PrintingsCell({ row }: AdminCellSlotProps<AdminSetResponse>) {
  if (!row) {
    return null;
  }
  if (row.printingCount === 0) {
    return <CountBadge count={0} />;
  }
  return (
    <Link to="/admin/cards" search={{ set: row.slug }} className="hover:opacity-70">
      <CountBadge count={row.printingCount} />
    </Link>
  );
}

function IdInput({ draft, setDraft }: AdminDraftSlotProps<SetDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.id}
      onChange={(e) => setDraft((prev) => ({ ...prev, id: e.target.value }))}
      placeholder="ID"
      className="font-mono"
    />
  );
}

function NameInput({ draft, setDraft }: AdminDraftSlotProps<SetDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.name}
      onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
    />
  );
}

function NameAddInput({ draft, setDraft }: AdminDraftSlotProps<SetDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.name}
      onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
      placeholder="Name"
    />
  );
}

function PrintedTotalInput({ draft, setDraft }: AdminDraftSlotProps<SetDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      inputMode="numeric"
      value={draft.printedTotal}
      onChange={(e) => setDraft((prev) => ({ ...prev, printedTotal: e.target.value }))}
      className="ml-auto text-right"
    />
  );
}

function PrintedTotalAddInput({ draft, setDraft }: AdminDraftSlotProps<SetDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      inputMode="numeric"
      value={draft.printedTotal}
      onChange={(e) => setDraft((prev) => ({ ...prev, printedTotal: e.target.value }))}
      placeholder="0"
      className="ml-auto text-right"
    />
  );
}

function SetTypeSelect({ draft, setDraft }: AdminDraftSlotProps<SetDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Select
      value={draft.setType}
      onValueChange={(value) => {
        if (value) {
          setDraft((prev) => ({ ...prev, setType: value as "main" | "supplemental" }));
        }
      }}
    >
      <SelectTrigger className="h-8 w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="main">main</SelectItem>
        <SelectItem value="supplemental">supplemental</SelectItem>
      </SelectContent>
    </Select>
  );
}

function DeleteSetDescription({ name }: { name: string }) {
  return (
    <>
      This will permanently delete the set <strong>{name}</strong>. Sets with printings cannot be
      deleted. Remove their printings first.
    </>
  );
}

const columns: AdminColumnDef<AdminSetResponse, SetDraft>[] = [
  {
    header: "ID",
    width: "w-28",
    cell: <IdCell />,
    addCell: <IdInput />,
  },
  {
    header: "Name",
    cell: <NameCell />,
    editCell: <NameInput />,
    addCell: <NameAddInput />,
  },
  {
    header: "Printed Total",
    width: "w-32",
    align: "right",
    cell: <PrintedTotalCell />,
    editCell: <PrintedTotalInput />,
    addCell: <PrintedTotalAddInput />,
  },
  {
    header: "Releases",
    width: "w-72",
    headerTitle: "Release period per language — edit them in the table below",
    cell: <ReleasesCell />,
  },
  {
    header: "Type",
    width: "w-36",
    cell: <SetTypeCell />,
    editCell: <SetTypeSelect />,
    addCell: <SetTypeSelect />,
  },
  {
    header: "Cards",
    width: "w-24",
    align: "right",
    headerTitle: "Cards in this set",
    cell: <CardsCell />,
  },
  {
    header: "Printings",
    width: "w-24",
    align: "right",
    headerTitle: "Printings in this set",
    cell: <PrintingsCell />,
  },
];

/** One editable release row, flattened out of every set's release map. */
interface ReleaseRow {
  setId: string;
  setSlug: string;
  language: string;
  release: SetRelease;
}

/**
 * Flattens the sets into one row per (set, language), the shape the release
 * table edits.
 * @returns Release rows in set order, languages alphabetical within a set.
 */
function toReleaseRows(sets: AdminSetResponse[]): ReleaseRow[] {
  return sets.flatMap((set) =>
    Object.keys(set.releases)
      .toSorted()
      .map((language) => ({
        setId: set.id,
        setSlug: set.slug,
        language,
        // Non-null: the key came from this map.
        release: set.releases[language] as SetRelease,
      })),
  );
}

function ReleasePrecisionSelect({
  value,
  disabled,
  onChange,
}: {
  value: ReleasePrecision;
  disabled?: boolean;
  onChange: (precision: ReleasePrecision) => void;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next) {
          onChange(next as ReleasePrecision);
        }
      }}
    >
      <SelectTrigger className="h-8 w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRECISIONS.map((precision) => (
          <SelectItem key={precision} value={precision}>
            {precision}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Per-language release dates, one row per (set, language). Kept out of the sets
 * table because a set has as many dates as it has languages.
 *
 * There is no released toggle anywhere: a set counts as out once its period has
 * finished, so the only editable facts are the date and how precisely it is
 * known. Clearing the date leaves the language announced but undated (TBA),
 * removing the row means not announced there at all.
 * @returns The release editor card.
 */
function SetReleasesTable({ sets }: { sets: AdminSetResponse[] }) {
  const updateMutation = useUpdateSet();
  const languages = useLanguageList();
  const [addSetId, setAddSetId] = useState("");
  const [addLanguage, setAddLanguage] = useState("");

  const rows = toReleaseRows(sets);
  const setsById = new Map(sets.map((set) => [set.id, set]));

  function saveReleases(setId: string, releases: SetReleases) {
    const set = setsById.get(setId);
    if (!set) {
      return;
    }
    updateMutation.mutate({
      id: set.id,
      name: set.name,
      printedTotal: set.printedTotal ?? 0,
      releases,
      setType: set.setType,
    });
  }

  function writeRelease(setId: string, language: string, release: SetRelease) {
    const set = setsById.get(setId);
    if (!set) {
      return;
    }
    saveReleases(setId, { ...set.releases, [language]: normalizeToPeriodStart(release) });
  }

  function removeRelease(setId: string, language: string) {
    const set = setsById.get(setId);
    if (!set) {
      return;
    }
    // Filtered rather than destructured: a computed key in an object pattern
    // bails the React Compiler out of the whole file.
    saveReleases(
      setId,
      Object.fromEntries(Object.entries(set.releases).filter(([code]) => code !== language)),
    );
  }

  const takenLanguages = new Set(
    rows.filter((row) => row.setId === addSetId).map((row) => row.language),
  );
  const addableLanguages = languages.filter((language) => !takenLanguages.has(language.code));
  const canAdd = addSetId !== "" && addLanguage !== "";

  return (
    <Card>
      <CardContent className="pt-5">
        <p className="mb-1 text-sm font-medium">Release dates per language</p>
        <p className="text-muted-foreground mb-3 text-sm">
          A set counts as released in a language once its release period has passed, so there is no
          separate released switch. Use a coarser precision when only the month, quarter or year is
          known, and clear the date for a language that is announced without one.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Set</TableHead>
              <TableHead className="w-24">Language</TableHead>
              <TableHead className="w-44">Date</TableHead>
              <TableHead className="w-32">Precision</TableHead>
              <TableHead className="w-32">Shown as</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground text-center">
                  No release dates yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={`${row.setId}-${row.language}`}>
                <TableCell className="font-mono">{row.setSlug}</TableCell>
                <TableCell>{row.language}</TableCell>
                <TableCell>
                  <DatePicker
                    value={row.release.releasedAt}
                    onChange={(iso) =>
                      writeRelease(row.setId, row.language, {
                        releasedAt: iso,
                        precision: row.release.precision ?? "day",
                      })
                    }
                    onClear={() =>
                      writeRelease(row.setId, row.language, { releasedAt: null, precision: null })
                    }
                    className="font-mono"
                  />
                </TableCell>
                <TableCell>
                  <ReleasePrecisionSelect
                    value={row.release.precision ?? "day"}
                    disabled={row.release.releasedAt === null}
                    onChange={(precision) =>
                      writeRelease(row.setId, row.language, {
                        releasedAt: row.release.releasedAt,
                        precision,
                      })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Badge variant={isReleased(row.release) ? "default" : "secondary"}>
                    {formatReleasePeriod(row.release)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRelease(row.setId, row.language)}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell>
                <Select value={addSetId} onValueChange={(value) => setAddSetId(value ?? "")}>
                  <SelectTrigger className="h-8 w-24">
                    <SelectValue placeholder="Set" />
                  </SelectTrigger>
                  <SelectContent>
                    {sets.map((set) => (
                      <SelectItem key={set.id} value={set.id}>
                        {set.slug}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Select value={addLanguage} onValueChange={(value) => setAddLanguage(value ?? "")}>
                  <SelectTrigger className="h-8 w-24">
                    <SelectValue placeholder="Lang" />
                  </SelectTrigger>
                  <SelectContent>
                    {addableLanguages.map((language) => (
                      <SelectItem key={language.code} value={language.code}>
                        {language.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell colSpan={3} className="text-muted-foreground text-sm">
                Added as undated. Set the date on the new row.
              </TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canAdd}
                  onClick={() => {
                    writeRelease(addSetId, addLanguage, { releasedAt: null, precision: null });
                    setAddLanguage("");
                  }}
                >
                  Add
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function SetsPage() {
  const { data } = useSets();
  const updateMutation = useUpdateSet();
  const createMutation = useCreateSet();
  const reorderMutation = useReorderSets();
  const deleteMutation = useDeleteSet();
  const { sets } = data;

  function moveSet(index: number, direction: -1 | 1) {
    const reordered = swapForReorder(sets, index, direction, (s) => s.id);
    if (reordered) {
      reorderMutation.mutate(reordered);
    }
  }

  // Release rows are edited in their own table below, so a set edit re-sends
  // the map it already had rather than dropping every language.
  const releasesById = new Map(sets.map((set) => [set.id, set.releases]));

  return (
    <div className="space-y-6">
      <AdminTable
        columns={columns}
        data={sets}
        getRowKey={(s) => s.id}
        emptyText="No sets yet."
        title="Sets"
        toolbar={
          <PageDescription>
            Set order controls which printing a card defaults to wherever no specific printing is
            pinned (general display, and name-based deck imports). The default is the first printing
            by language, then by set order, so moving a set higher makes its printings win.
          </PageDescription>
        }
        reorder={{
          onMove: moveSet,
          isPending: reorderMutation.isPending,
        }}
        export={{
          filename: "sets.json",
          transform: (rows) =>
            rows.map(
              ({ id: _id, cardCount: _cardCount, printingCount: _printingCount, ...rest }) => rest,
            ),
        }}
        add={{
          emptyDraft: {
            id: "",
            name: "",
            printedTotal: "",
            setType: WellKnown.setType.MAIN,
          },
          onSave: (d) => {
            // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of a form field; Number() would yield NaN on trailing text
            const printedTotal = parseInt(d.printedTotal, 10);
            return createMutation.mutateAsync({
              id: d.id.trim(),
              name: d.name.trim(),
              printedTotal: isNaN(printedTotal) ? 0 : printedTotal,
              setType: d.setType,
            });
          },
          validate: (d) => {
            if (!d.id.trim() || !d.name.trim()) {
              return "ID and name are required";
            }
            // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of a form field; Number() would yield NaN on trailing text
            const pt = parseInt(d.printedTotal, 10);
            if (d.printedTotal && (isNaN(pt) || pt < 0)) {
              return "Printed total must be a non-negative number";
            }
            return null;
          },
          label: "Add Set",
        }}
        edit={{
          toDraft: (s) => ({
            id: s.id,
            name: s.name,
            printedTotal: s.printedTotal === null ? "" : String(s.printedTotal),
            setType: s.setType,
          }),
          onSave: (d) => {
            // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of a form field; Number() would yield NaN on trailing text
            const printedTotal = parseInt(d.printedTotal, 10);
            return updateMutation.mutateAsync({
              id: d.id,
              name: d.name,
              printedTotal: isNaN(printedTotal) ? 0 : printedTotal,
              releases: releasesById.get(d.id) ?? {},
              setType: d.setType,
            });
          },
          validate: (d) => {
            // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of a form field; Number() would yield NaN on trailing text
            const pt = parseInt(d.printedTotal, 10);
            if (isNaN(pt) || pt < 0) {
              return "Printed total must be a non-negative number";
            }
            return null;
          },
        }}
        delete={{
          onDelete: (s) => deleteMutation.mutateAsync(s.id),
          // oxlint-disable-next-line react/no-unstable-nested-components -- callback returns a {title, description} record; JSX in description is via a hoisted DeleteSetDescription, not an inline component
          confirm: (s) => ({
            title: `Delete set “${s.slug}”?`,
            description: <DeleteSetDescription name={s.name} />,
          }),
        }}
      />
      <SetReleasesTable sets={sets} />
    </div>
  );
}
