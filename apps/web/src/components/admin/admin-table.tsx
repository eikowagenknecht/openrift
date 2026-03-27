import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Column definition (public API — consumed by all admin pages)
// ---------------------------------------------------------------------------

export interface AdminColumnDef<TData, TDraft = TData> {
  /** Header label */
  header: string;
  /** Tooltip for header (title attribute) */
  headerTitle?: string;
  /** Tailwind width class, e.g. "w-28" */
  width?: string;
  /** Text alignment */
  align?: "left" | "center" | "right";

  /** Return a sortable value for this column. If provided, the column header becomes clickable. */
  sortValue?: (row: TData) => string | number | null;

  /** Render a cell in display mode */
  cell: (row: TData, index: number) => ReactNode;

  /** Render a cell when the row is being edited. Falls back to `cell` if omitted. */
  editCell?: (draft: TDraft, setDraft: (fn: (prev: TDraft) => TDraft) => void) => ReactNode;

  /** Render a cell in the "add" row. If omitted, renders an empty cell. */
  addCell?: (draft: TDraft, setDraft: (fn: (prev: TDraft) => TDraft) => void) => ReactNode;
}

// ---------------------------------------------------------------------------
// Column meta (passed through TanStack Table's meta field)
// ---------------------------------------------------------------------------

interface AdminColumnMeta<TDraft> {
  headerTitle?: string;
  width?: string;
  align?: "left" | "center" | "right";
  editCell?: (draft: TDraft, setDraft: (fn: (prev: TDraft) => TDraft) => void) => ReactNode;
  addCell?: (draft: TDraft, setDraft: (fn: (prev: TDraft) => TDraft) => void) => ReactNode;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AdminTableProps<TData, TDraft = TData> {
  columns: AdminColumnDef<TData, TDraft>[];
  data: TData[];
  /** Unique key for each row */
  getRowKey: (row: TData) => string;
  /** Text shown when data is empty */
  emptyText?: string;

  /** Initial sort state. `column` must match a column's `header` that has `sortValue`. */
  defaultSort?: { column: string; direction: "asc" | "desc" };

  /** Optional toolbar content rendered above the table (description, filters, etc.) */
  toolbar?: ReactNode;

  // --- Inline add ---
  add?: {
    /** Initial draft for the add row */
    emptyDraft: TDraft;
    /** Called when Save is clicked. Should return a promise (closes on resolve). */
    onSave: (draft: TDraft) => Promise<unknown>;
    /** Client-side validation. Return an error string to block save, or null. */
    validate?: (draft: TDraft) => string | null;
    /** Button label. Defaults to "Add". */
    label?: string;
  };

  // --- Inline edit ---
  edit?: {
    /** Convert a data row to an editable draft */
    toDraft: (row: TData) => TDraft;
    /** Called when Save is clicked. Should return a promise (closes on resolve). */
    onSave: (draft: TDraft) => Promise<unknown>;
    /** Client-side validation. Return an error string to block save, or null. */
    validate?: (draft: TDraft) => string | null;
  };

  // --- Delete ---
  delete?: {
    onDelete: (row: TData) => Promise<unknown>;
    /** If provided, shows a confirmation dialog. */
    confirm?: (row: TData) => { title: string; description: ReactNode };
  };

  // --- Reorder ---
  reorder?: {
    onMove: (index: number, direction: -1 | 1) => void;
    isPending?: boolean;
  };

  /** Extra content in each row's action cell (rendered before Edit/Delete). */
  actions?: (row: TData, index: number) => ReactNode;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALIGN_CLASSES: Record<string, string> = { right: "text-right", center: "text-center" };

function alignClass(align?: "left" | "center" | "right") {
  if (align) {
    return ALIGN_CLASSES[align];
  }
}

// Convert our public AdminColumnDef to TanStack ColumnDef.
function toTanStackColumns<TData, TDraft>(
  adminCols: AdminColumnDef<TData, TDraft>[],
  enableSort: boolean,
): ColumnDef<TData>[] {
  return adminCols.map((col) => {
    const def: ColumnDef<TData> = {
      id: col.header,
      header: col.header,
      cell: (info) => col.cell(info.row.original, info.row.index),
      enableSorting: enableSort && Boolean(col.sortValue),
      meta: {
        headerTitle: col.headerTitle,
        width: col.width,
        align: col.align,
        editCell: col.editCell,
        addCell: col.addCell,
      } satisfies AdminColumnMeta<TDraft>,
    };

    if (col.sortValue) {
      const { sortValue } = col;
      (
        def as ColumnDef<TData> & { accessorFn: (row: TData) => string | number | null }
      ).accessorFn = sortValue;
      def.sortingFn = (rowA, rowB, columnId) => {
        const va = rowA.getValue<string | number | null>(columnId);
        const vb = rowB.getValue<string | number | null>(columnId);
        if (va === null && vb === null) {
          return 0;
        }
        if (va === null) {
          return 1;
        }
        if (vb === null) {
          return -1;
        }
        if (typeof va === "string" && typeof vb === "string") {
          return va.localeCompare(vb);
        }
        return (va as number) - (vb as number);
      };
      def.sortUndefined = "last";
    }

    return def;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminTable<TData, TDraft = TData>({
  columns: adminColumns,
  data,
  getRowKey,
  emptyText = "No data.",
  defaultSort,
  toolbar,
  add,
  edit,
  delete: del,
  reorder,
  actions,
}: AdminTableProps<TData, TDraft>) {
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<TDraft | null>(null);
  const [addError, setAddError] = useState("");
  const [addPending, setAddPending] = useState(false);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TDraft | null>(null);
  const [editError, setEditError] = useState("");
  const [editPending, setEditPending] = useState(false);

  const [deleteError, setDeleteError] = useState("");

  const enableSort = !reorder;
  const tanStackColumns = toTanStackColumns(adminColumns, enableSort);

  const initialSorting: SortingState = defaultSort
    ? [{ id: defaultSort.column, desc: defaultSort.direction === "desc" }]
    : [];
  const [sorting, setSorting] = useState<SortingState>(initialSorting);

  const table = useReactTable({
    data,
    columns: tanStackColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSort ? getSortedRowModel() : undefined,
    getRowId: (row) => getRowKey(row),
    enableSorting: enableSort,
  });

  const hasActions = Boolean(edit || del || actions);
  const totalCols = adminColumns.length + (reorder ? 1 : 0) + (hasActions ? 1 : 0);

  // --- Add handlers ---
  function startAdding() {
    if (!add) {
      return;
    }
    setAddDraft(structuredClone(add.emptyDraft));
    setAddError("");
    setAdding(true);
  }

  function cancelAdding() {
    setAdding(false);
    setAddDraft(null);
    setAddError("");
  }

  async function saveAdd() {
    if (!add || !addDraft) {
      return;
    }
    if (add.validate) {
      const err = add.validate(addDraft);
      if (err) {
        setAddError(err);
        return;
      }
    }
    setAddPending(true);
    try {
      await add.onSave(addDraft);
      cancelAdding();
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "Save failed");
    } finally {
      setAddPending(false);
    }
  }

  // --- Edit handlers ---
  function startEditing(row: TData) {
    if (!edit) {
      return;
    }
    setEditDraft(edit.toDraft(row));
    setEditingKey(getRowKey(row));
    setEditError("");
  }

  function cancelEditing() {
    setEditingKey(null);
    setEditDraft(null);
    setEditError("");
  }

  async function saveEdit() {
    if (!edit || !editDraft) {
      return;
    }
    if (edit.validate) {
      const err = edit.validate(editDraft);
      if (err) {
        setEditError(err);
        return;
      }
    }
    setEditPending(true);
    try {
      await edit.onSave(editDraft);
      cancelEditing();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Save failed");
    } finally {
      setEditPending(false);
    }
  }

  // --- Render ---
  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;

  return (
    <div className="space-y-4">
      {(toolbar || add) && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">{toolbar}</div>
          {add && !adding && (
            <Button variant="outline" size="sm" onClick={startAdding}>
              {add.label ?? "Add"}
            </Button>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {headerGroups.map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {reorder && <TableHead className="w-16">Order</TableHead>}
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as AdminColumnMeta<TDraft> | undefined;
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        meta?.width,
                        alignClass(meta?.align),
                        canSort && "cursor-pointer select-none",
                      )}
                      title={meta?.headerTitle}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <span className={cn(canSort && "inline-flex items-center gap-1")}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort &&
                          (sorted ? (
                            sorted === "asc" ? (
                              <ArrowUpIcon className="text-foreground inline h-3.5 w-3.5" />
                            ) : (
                              <ArrowDownIcon className="text-foreground inline h-3.5 w-3.5" />
                            )
                          ) : (
                            <ChevronsUpDownIcon className="text-muted-foreground/50 inline h-3.5 w-3.5" />
                          ))}
                      </span>
                    </TableHead>
                  );
                })}
                {hasActions && <TableHead className="w-32 text-right">Actions</TableHead>}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {/* Add row */}
            {adding && addDraft && (
              <TableRow>
                {reorder && <TableCell />}
                {adminColumns.map((col) => (
                  <TableCell key={col.header} className={alignClass(col.align)}>
                    {col.addCell
                      ? col.addCell(addDraft, (fn) =>
                          setAddDraft((prev) => (prev === null ? prev : fn(prev))),
                        )
                      : null}
                  </TableCell>
                ))}
                {hasActions && (
                  <TableCell className="text-right">
                    <SaveCancelButtons
                      onSave={saveAdd}
                      onCancel={cancelAdding}
                      isPending={addPending}
                      error={addError}
                    />
                  </TableCell>
                )}
              </TableRow>
            )}

            {/* Empty state */}
            {rows.length === 0 && !adding && (
              <TableRow>
                <TableCell colSpan={totalCols} className="text-muted-foreground h-24 text-center">
                  {emptyText}
                </TableCell>
              </TableRow>
            )}

            {/* Data rows */}
            {rows.map((row) => {
              const original = row.original;
              const index = row.index;
              const isEditing = editingKey === row.id && editDraft !== null;

              return (
                <TableRow key={row.id}>
                  {reorder && (
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={index === 0 || reorder.isPending}
                          onClick={() => reorder.onMove(index, -1)}
                        >
                          <ArrowUpIcon className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={index === rows.length - 1 || reorder.isPending}
                          onClick={() => reorder.onMove(index, 1)}
                        >
                          <ArrowDownIcon className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}

                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as AdminColumnMeta<TDraft> | undefined;
                    return (
                      <TableCell key={cell.id} className={alignClass(meta?.align)}>
                        {isEditing && meta?.editCell
                          ? meta.editCell(editDraft, (fn) =>
                              setEditDraft((prev) => (prev === null ? prev : fn(prev))),
                            )
                          : flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}

                  {hasActions && (
                    <TableCell className="text-right">
                      {isEditing ? (
                        <SaveCancelButtons
                          onSave={saveEdit}
                          onCancel={cancelEditing}
                          isPending={editPending}
                          error={editError}
                        />
                      ) : (
                        <div className="flex justify-end gap-1">
                          {actions?.(original, index)}
                          {edit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEditing(original)}
                            >
                              Edit
                            </Button>
                          )}
                          {del && (
                            <DeleteButton
                              row={original}
                              config={del}
                              deleteError={deleteError}
                              setDeleteError={setDeleteError}
                            />
                          )}
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal: Save / Cancel button pair
// ---------------------------------------------------------------------------

function SaveCancelButtons({
  onSave,
  onCancel,
  isPending,
  error,
}: {
  onSave: () => void;
  onCancel: () => void;
  isPending: boolean;
  error: string;
}) {
  return (
    <>
      <div className="flex justify-end gap-1">
        <Button variant="outline" size="sm" onClick={onSave} disabled={isPending}>
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
    </>
  );
}

// ---------------------------------------------------------------------------
// Internal: Delete button (with optional confirmation dialog)
// ---------------------------------------------------------------------------

function DeleteButton<TData>({
  row,
  config,
  deleteError,
  setDeleteError,
}: {
  row: TData;
  config: NonNullable<AdminTableProps<TData>["delete"]>;
  deleteError: string;
  setDeleteError: (err: string) => void;
}) {
  if (config.confirm) {
    const { title, description } = config.confirm(row);
    return (
      <AlertDialog>
        <AlertDialogTrigger
          render={<Button variant="ghost" size="icon" className="text-destructive h-8 w-8" />}
        >
          <Trash2Icon className="h-4 w-4" />
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-destructive text-sm">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteError("")}>Cancel</AlertDialogCancel>
            <AlertDialogPrimitive.Close
              render={<Button variant="destructive" />}
              onClick={async () => {
                setDeleteError("");
                try {
                  await config.onDelete(row);
                } catch (error) {
                  setDeleteError(error instanceof Error ? error.message : "Delete failed");
                }
              }}
            >
              Delete
            </AlertDialogPrimitive.Close>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      onClick={async () => {
        try {
          await config.onDelete(row);
        } catch (error) {
          setDeleteError(error instanceof Error ? error.message : "Delete failed");
        }
      }}
    >
      Delete
    </Button>
  );
}
