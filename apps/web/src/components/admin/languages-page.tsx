import type { LanguageResponse } from "@openrift/shared";

import { AdminTable } from "@/components/admin/admin-table";
import type {
  AdminCellSlotProps,
  AdminColumnDef,
  AdminDraftSlotProps,
} from "@/components/admin/admin-table";
import { Input } from "@/components/ui/input";
import {
  useCreateLanguage,
  useDeleteLanguage,
  useLanguages,
  useReorderLanguages,
  useUpdateLanguage,
} from "@/hooks/use-languages";

interface LanguageDraft {
  code: string;
  name: string;
}

function CodeCell({ row }: AdminCellSlotProps<LanguageResponse>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.code}</span>;
}

function NameCell({ row }: AdminCellSlotProps<LanguageResponse>) {
  if (!row) {
    return null;
  }
  return <span className="text-sm">{row.name}</span>;
}

function CodeAddInput({ draft, setDraft }: AdminDraftSlotProps<LanguageDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.code}
      onChange={(event) =>
        setDraft((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))
      }
      placeholder="EN"
      className="h-8 w-24 font-mono"
    />
  );
}

function NameInput({ draft, setDraft }: AdminDraftSlotProps<LanguageDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.name}
      onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
      className="h-8"
    />
  );
}

function NameAddInput({ draft, setDraft }: AdminDraftSlotProps<LanguageDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.name}
      onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
      placeholder="English"
      className="h-8"
    />
  );
}

const columns: AdminColumnDef<LanguageResponse, LanguageDraft>[] = [
  {
    header: "Code",
    sortValue: (lang) => lang.code,
    cell: <CodeCell />,
    addCell: <CodeAddInput />,
  },
  {
    header: "Name",
    sortValue: (lang) => lang.name,
    cell: <NameCell />,
    editCell: <NameInput />,
    addCell: <NameAddInput />,
  },
];

export function LanguagesPage() {
  const { data } = useLanguages();
  const createMutation = useCreateLanguage();
  const updateMutation = useUpdateLanguage();
  const deleteMutation = useDeleteLanguage();
  const reorderMutation = useReorderLanguages();
  const { languages } = data;

  function moveLanguage(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= languages.length) {
      return;
    }
    const reordered = languages.map((lang) => lang.code);
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    reorderMutation.mutate(reordered);
  }

  return (
    <AdminTable
      columns={columns}
      data={languages}
      getRowKey={(lang) => lang.code}
      emptyText="No languages yet."
      toolbar={
        <p className="text-muted-foreground text-sm">
          Languages classify the printing language of each card (e.g. English, Japanese).
        </p>
      }
      add={{
        emptyDraft: { code: "", name: "" },
        onSave: (draft) =>
          createMutation.mutateAsync({
            code: draft.code.trim(),
            name: draft.name.trim(),
          }),
        validate: (draft) => {
          const code = draft.code.trim();
          const name = draft.name.trim();
          if (!code || !name) {
            return "Code and name are required";
          }
          if (code.length > 5) {
            return "Code must be 5 characters or fewer";
          }
          return null;
        },
        label: "Add Language",
      }}
      edit={{
        toDraft: (lang) => ({
          code: lang.code,
          name: lang.name,
        }),
        onSave: (draft) =>
          updateMutation.mutateAsync({
            code: draft.code,
            name: draft.name.trim() || undefined,
          }),
      }}
      reorder={{
        onMove: moveLanguage,
        isPending: reorderMutation.isPending,
      }}
      export={{
        filename: "languages.json",
        transform: (rows) =>
          rows.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...rest }) => rest),
      }}
      delete={{
        onDelete: (lang) => deleteMutation.mutateAsync(lang.code),
      }}
    />
  );
}
