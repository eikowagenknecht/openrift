import type { ColumnDef, RowData, SortingState } from "@tanstack/react-table";
import {
  FlexRender,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  DownloadIcon,
  Trash2Icon,
} from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Fragment, cloneElement, useState } from "react";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { PageTopBarButton, PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogForm } from "@/components/ui/dialog-form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadJSON } from "@/lib/json-export";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Feature set
// ---------------------------------------------------------------------------

// Sorting is the only table feature these pages use; v9 leaves everything else
// (filtering, pagination, selection, pinning) out of the bundle. The row model
// is registered unconditionally even on reorder tables, where `enableSorting:
// false` keeps every column out of `createSortedRowModel`'s sort list.
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

type AdminTableFeatures = typeof features;

// ---------------------------------------------------------------------------
// Column definition (public API — consumed by all admin pages)
// ---------------------------------------------------------------------------

/** Per-row data injected into `cell` elements via cloneElement. */
export interface AdminCellSlotProps<TData> {
  row?: TData;
  index?: number;
}

/** Per-draft data injected into `editCell` / `addCell` elements via cloneElement. */
export interface AdminDraftSlotProps<TDraft> {
  draft?: TDraft;
  setDraft?: (fn: (prev: TDraft) => TDraft) => void;
}

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

  /**
   * JSX element rendered as the display-mode cell. The per-row `row` and
   * `index` are injected via cloneElement, so the component should declare
   * them as optional props.
   */
  cell: ReactElement<AdminCellSlotProps<TData>>;

  /** JSX element rendered when the row is being edited. Falls back to `cell` if omitted. */
  editCell?: ReactElement<AdminDraftSlotProps<TDraft>>;

  /** JSX element rendered in the "add" row. If omitted, renders an empty cell. */
  addCell?: ReactElement<AdminDraftSlotProps<TDraft>>;
}

// ---------------------------------------------------------------------------
// Column meta (passed through TanStack Table's meta field)
// ---------------------------------------------------------------------------

interface AdminColumnMeta<TDraft> {
  headerTitle?: string;
  width?: string;
  align?: "left" | "center" | "right";
  editCell?: ReactElement<AdminDraftSlotProps<TDraft>>;
  addCell?: ReactElement<AdminDraftSlotProps<TDraft>>;
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

  /**
   * Page title. When set, the table owns the page's sticky top bar
   * ({@link AdminPageTopBar}) and lifts the Add / Export buttons into it.
   * Omit on pages that render several tables (or their own top bar) — the
   * buttons then stay in the inline toolbar row above the table.
   */
  title?: ReactNode;

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

  // --- Inline add-child ---
  // Renders an "Add child" button per row that opens the inline add row directly
  // beneath that row, prefilled by `toDraft(row)`. Requires `add` to be set.
  addChild?: {
    toDraft: (row: TData) => TDraft;
    canAddChild?: (row: TData) => boolean;
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

  // --- Export ---
  export?: {
    /** Filename for the downloaded JSON file (e.g. "sets.json"). */
    filename: string;
    /** Optional transform applied to the data before serializing. Defaults to identity. */
    transform?: (data: TData[]) => unknown;
  };

  /**
   * Extra JSX element rendered in each row's action cell (before Edit/Delete).
   * Per-row `row` and `index` are injected via cloneElement.
   */
  actions?: ReactElement<AdminCellSlotProps<TData>>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALIGN_CLASSES: Record<string, string> = { right: "text-right", center: "text-center" };

/**
 * Lives outside the handlers below because React Compiler cannot lower a
 * conditional (ternary, `??`, `?.`) that sits inside a try/catch.
 * @returns The thrown value's message, or `fallback` when it isn't an Error.
 */
function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function alignClass(align?: "left" | "center" | "right") {
  if (align) {
    return ALIGN_CLASSES[align];
  }
}

// Convert our public AdminColumnDef to TanStack ColumnDef.
function toTanStackColumns<TData extends RowData, TDraft>(
  adminCols: AdminColumnDef<TData, TDraft>[],
  enableSort: boolean,
): ColumnDef<AdminTableFeatures, TData>[] {
  return adminCols.map((col) => {
    const def: ColumnDef<AdminTableFeatures, TData> = {
      id: col.header,
      header: col.header,
      cell: (info) => cloneElement(col.cell, { row: info.row.original, index: info.row.index }),
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
        def as ColumnDef<AdminTableFeatures, TData> & {
          accessorFn: (row: TData) => string | number | null;
        }
      ).accessorFn = sortValue;
      def.sortFn = (rowA, rowB, columnId) => {
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

export function AdminTable<TData extends RowData, TDraft = TData>({
  columns: adminColumns,
  data,
  getRowKey,
  emptyText = "No data.",
  defaultSort,
  title,
  toolbar,
  add,
  addChild,
  edit,
  delete: del,
  reorder,
  export: exportConfig,
  actions,
}: AdminTableProps<TData, TDraft>) {
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<TDraft | null>(null);
  const [addError, setAddError] = useState("");
  const [addPending, setAddPending] = useState(false);
  const [addingUnderKey, setAddingUnderKey] = useState<string | null>(null);

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

  const table = useTable({
    features,
    data,
    columns: tanStackColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => getRowKey(row),
    enableSorting: enableSort,
  });

  const hasActions = Boolean(edit || del || actions || addChild);
  const totalCols = adminColumns.length + (reorder ? 1 : 0) + (hasActions ? 1 : 0);

  // --- Add handlers ---
  function startAdding(draft?: TDraft, underKey: string | null = null) {
    if (!add) {
      return;
    }
    setAddDraft(structuredClone(draft ?? add.emptyDraft));
    setAddError("");
    setAdding(true);
    setAddingUnderKey(underKey);
  }

  function cancelAdding() {
    setAdding(false);
    setAddDraft(null);
    setAddError("");
    setAddingUnderKey(null);
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
      setAddPending(false);
    } catch (error) {
      setAddError(errorText(error, "Save failed"));
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
      setEditPending(false);
    } catch (error) {
      setEditError(errorText(error, "Save failed"));
      setEditPending(false);
    }
  }

  // --- Render ---
  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;

  const addRow =
    adding && addDraft ? (
      <TableRow>
        {reorder && <TableCell />}
        {adminColumns.map((col) => (
          <TableCell key={col.header} className={alignClass(col.align)}>
            {col.addCell
              ? cloneElement(col.addCell, {
                  draft: addDraft,
                  setDraft: (fn) => setAddDraft((prev) => (prev === null ? prev : fn(prev))),
                })
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
    ) : null;

  const handleExport = exportConfig
    ? () => {
        const payload = exportConfig.transform ? exportConfig.transform(data) : data;
        downloadJSON(payload, exportConfig.filename);
      }
    : undefined;

  return (
    <div className="space-y-4">
      {title !== undefined && (
        <AdminPageTopBar
          title={title}
          actions={
            (exportConfig || add) && (
              <>
                {handleExport && (
                  <PageTopBarButton onClick={handleExport}>
                    <DownloadIcon />
                    Export JSON
                  </PageTopBarButton>
                )}
                {add && (
                  <PageTopBarPrimaryButton onClick={() => startAdding()} disabled={adding}>
                    {add.label ?? "Add"}
                  </PageTopBarPrimaryButton>
                )}
              </>
            )
          }
        />
      )}
      {title === undefined
        ? (toolbar || add || exportConfig) && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">{toolbar}</div>
              <div className="flex items-center gap-2">
                {handleExport && (
                  <Button variant="outline" onClick={handleExport}>
                    <DownloadIcon className="h-4 w-4" />
                    Export JSON
                  </Button>
                )}
                {add && !adding && (
                  <Button variant="outline" onClick={() => startAdding()}>
                    {add.label ?? "Add"}
                  </Button>
                )}
              </div>
            </div>
          )
        : toolbar}

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
                        <FlexRender header={header} />
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
            {/* Top-of-table add row (only when not adding under a parent) */}
            {addingUnderKey === null && addRow}

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
              const childCfg = addChild;
              const showAddChild =
                childCfg && (childCfg.canAddChild ? childCfg.canAddChild(original) : true);

              return (
                <Fragment key={row.id}>
                  <TableRow>
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

                    {/* getAllCells, not getVisibleCells: see the same call in
                        admin-card-table-shared.tsx. Equivalent while no column
                        can hide; re-pair them if columnVisibilityFeature is
                        ever registered. */}
                    {row.getAllCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as
                        | AdminColumnMeta<TDraft>
                        | undefined;
                      return (
                        <TableCell key={cell.id} className={alignClass(meta?.align)}>
                          {isEditing && meta?.editCell ? (
                            cloneElement(meta.editCell, {
                              draft: editDraft,
                              setDraft: (fn) =>
                                setEditDraft((prev) => (prev === null ? prev : fn(prev))),
                            })
                          ) : (
                            <FlexRender cell={cell} />
                          )}
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
                          <div className="flex items-center justify-end gap-1">
                            {actions ? cloneElement(actions, { row: original, index }) : null}
                            {showAddChild && childCfg && (
                              <Button
                                variant="ghost"
                                onClick={() =>
                                  startAdding(childCfg.toDraft(original), getRowKey(original))
                                }
                              >
                                Add child
                              </Button>
                            )}
                            {edit && (
                              <Button variant="ghost" onClick={() => startEditing(original)}>
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
                  {addingUnderKey === row.id && addRow}
                </Fragment>
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
        <Button variant="outline" onClick={onSave} disabled={isPending}>
          Save
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-destructive mt-1">{error}</p>}
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
  const [open, setOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  if (config.confirm) {
    const { title, description } = config.confirm(row);
    return (
      <AlertDialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setDeleteError("");
          }
        }}
      >
        <AlertDialogTrigger
          render={<Button variant="ghost" size="icon" className="text-destructive" />}
        >
          <Trash2Icon className="h-4 w-4" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <DialogForm
            onSubmit={async () => {
              // Guard against double-submission while a delete is in flight.
              if (deletePending) {
                return;
              }
              setDeleteError("");
              setDeletePending(true);
              // React Compiler can lower neither a `finally` clause nor a
              // conditional inside a try/catch, so the reset runs on both
              // paths and the message comes from a plain helper.
              try {
                await config.onDelete(row);
                setOpen(false);
              } catch (error) {
                setDeleteError(errorText(error, "Delete failed"));
              }
              setDeletePending(false);
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription>{description}</AlertDialogDescription>
            </AlertDialogHeader>
            {deleteError && <p className="text-destructive text-sm">{deleteError}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction type="submit" variant="destructive" disabled={deletePending}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </DialogForm>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Button
      variant="ghost"
      className="text-destructive hover:text-destructive"
      onClick={async () => {
        try {
          await config.onDelete(row);
        } catch (error) {
          setDeleteError(errorText(error, "Delete failed"));
        }
      }}
    >
      Delete
    </Button>
  );
}
