import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
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

// ---------------------------------------------------------------------------
// Column definition
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
// Props
// ---------------------------------------------------------------------------

interface AdminTableProps<TData, TDraft = TData> {
  columns: AdminColumnDef<TData, TDraft>[];
  data: TData[];
  /** Unique key for each row */
  getRowKey: (row: TData) => string;
  /** Text shown when data is empty */
  emptyText?: string;

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
// Component
// ---------------------------------------------------------------------------

export function AdminTable<TData, TDraft = TData>({
  columns,
  data,
  getRowKey,
  emptyText = "No data.",
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

  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const hasActions = Boolean(edit || del || actions);
  const totalCols = columns.length + (reorder ? 1 : 0) + (hasActions ? 1 : 0);

  // --- Sort ---
  function toggleSort(header: string) {
    if (sortCol === header) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        setSortCol(null);
        setSortDir("asc");
      }
    } else {
      setSortCol(header);
      setSortDir("asc");
    }
  }

  function getSortedData(): TData[] {
    if (!sortCol || reorder) {
      return data;
    }
    const col = columns.find((c) => c.header === sortCol);
    if (!col?.sortValue) {
      return data;
    }
    const { sortValue } = col;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      const va = sortValue(a);
      const vb = sortValue(b);
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
        return va.localeCompare(vb) * dir;
      }
      return ((va as number) - (vb as number)) * dir;
    });
  }

  const sortedData = getSortedData();

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

  // --- Alignment helper ---
  const alignClasses: Record<string, string> = { right: "text-right", center: "text-center" };

  function alignClass(align?: "left" | "center" | "right") {
    if (align) {
      return alignClasses[align];
    }
  }

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
            <TableRow>
              {reorder && <TableHead className="w-16">Order</TableHead>}
              {columns.map((col) => {
                const isSortable = !reorder && col.sortValue;
                const isActive = sortCol === col.header;
                return (
                  <TableHead
                    key={col.header}
                    className={cn(
                      col.width,
                      alignClass(col.align),
                      isSortable && "cursor-pointer select-none",
                    )}
                    title={col.headerTitle}
                    onClick={isSortable ? () => toggleSort(col.header) : undefined}
                  >
                    <span className={cn(isSortable && "inline-flex items-center gap-1")}>
                      {col.header}
                      {isSortable &&
                        (isActive ? (
                          sortDir === "asc" ? (
                            <ArrowUpIcon className="inline h-3.5 w-3.5 text-foreground" />
                          ) : (
                            <ArrowDownIcon className="inline h-3.5 w-3.5 text-foreground" />
                          )
                        ) : (
                          <ChevronsUpDownIcon className="inline h-3.5 w-3.5 text-muted-foreground/50" />
                        ))}
                    </span>
                  </TableHead>
                );
              })}
              {hasActions && <TableHead className="w-32 text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Add row */}
            {adding && addDraft && (
              <TableRow>
                {reorder && <TableCell />}
                {columns.map((col) => (
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
            {data.length === 0 && !adding && (
              <TableRow>
                <TableCell colSpan={totalCols} className="text-muted-foreground h-24 text-center">
                  {emptyText}
                </TableCell>
              </TableRow>
            )}

            {/* Data rows */}
            {sortedData.map((row, index) => {
              const key = getRowKey(row);
              const isEditing = editingKey === key && editDraft !== null;

              return (
                <TableRow key={key}>
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
                          disabled={index === sortedData.length - 1 || reorder.isPending}
                          onClick={() => reorder.onMove(index, 1)}
                        >
                          <ArrowDownIcon className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}

                  {columns.map((col) => (
                    <TableCell key={col.header} className={alignClass(col.align)}>
                      {isEditing && col.editCell
                        ? col.editCell(editDraft, (fn) =>
                            setEditDraft((prev) => (prev === null ? prev : fn(prev))),
                          )
                        : col.cell(row, index)}
                    </TableCell>
                  ))}

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
                          {actions?.(row, index)}
                          {edit && (
                            <Button variant="ghost" size="sm" onClick={() => startEditing(row)}>
                              Edit
                            </Button>
                          )}
                          {del && (
                            <DeleteButton
                              row={row}
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
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
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
          render={<Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" />}
        >
          <Trash2Icon className="h-4 w-4" />
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
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

// ---------------------------------------------------------------------------
// Minimal cn helper (avoids importing from @/lib/utils for optional classes)
// ---------------------------------------------------------------------------

function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}
