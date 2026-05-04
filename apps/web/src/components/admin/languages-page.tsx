import type { LanguageResponse } from "@openrift/shared";

import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
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

  const columns: AdminColumnDef<LanguageResponse, LanguageDraft>[] = [
    {
      header: "Code",
      sortValue: (lang) => lang.code,
      cell: (lang) => <span className="font-mono text-sm">{lang.code}</span>,
      addCell: (draft, set) => (
        <Input
          value={draft.code}
          onChange={(event) => set((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))}
          placeholder="EN"
          className="h-8 w-24 font-mono"
        />
      ),
    },
    {
      header: "Name",
      sortValue: (lang) => lang.name,
      cell: (lang) => <span className="text-sm">{lang.name}</span>,
      editCell: (draft, set) => (
        <Input
          value={draft.name}
          onChange={(event) => set((prev) => ({ ...prev, name: event.target.value }))}
          className="h-8"
        />
      ),
      addCell: (draft, set) => (
        <Input
          value={draft.name}
          onChange={(event) => set((prev) => ({ ...prev, name: event.target.value }))}
          placeholder="English"
          className="h-8"
        />
      ),
    },
  ];

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
      export={{ filename: "languages.json" }}
      delete={{
        onDelete: (lang) => deleteMutation.mutateAsync(lang.code),
      }}
    />
  );
}
