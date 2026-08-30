import type { DragEndEvent, DragStartEvent, SensorDescriptor, SensorOptions } from "@dnd-kit/core";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ColumnDef, RowData, SortingState, Updater } from "@tanstack/react-table";
import {
  FlexRender,
  createSortedRowModel,
  functionalUpdate,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DownloadIcon,
  GripVerticalIcon,
  Trash2Icon,
} from "lucide-react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { Fragment, cloneElement, useState } from "react";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { SortHeaderButton, ariaSort } from "@/components/admin/sortable-header";
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
import type { ReorderMoves } from "@/lib/admin-reorder";
import { errorText } from "@/lib/error-text";
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

/** One column's sort, as a server-paged table reports and receives it. */
export interface ServerSort {
  /** The active column's {@link AdminColumnDef.sortKey}. */
  key: string;
  direction: "asc" | "desc";
  /**
   * A null key is the third step of the header's cycle: the reader has taken
   * the sort off, and the list falls back to whatever order the endpoint
   * returns unasked.
   */
  onChange: (sort: { key: string | null; direction: "asc" | "desc" }) => void;
}

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
  /**
   * Identifies the column to sort state and to {@link AdminTableProps.defaultSort}.
   * Defaults to {@link header}, which is enough until two columns share a
   * label — at which point the sort silently lands on whichever comes first.
   */
  id?: string;
  /** Tooltip for header (title attribute) */
  headerTitle?: string;
  /** Tailwind width class, e.g. "w-28" */
  width?: string;
  /** Text alignment */
  align?: "left" | "center" | "right";

  /** Return a sortable value for this column. If provided, the column header becomes clickable. */
  sortValue?: (row: TData) => string | number | null;

  /**
   * Names this column to the server's own sort vocabulary. The header becomes
   * clickable and reports through {@link AdminTableProps.serverSort} instead of
   * reordering the rows in the browser, which is the only honest option on a
   * table whose page is one slice of a much larger result.
   */
  sortKey?: string;

  /**
   * Which way a first click on this column sorts, whether it orders on the
   * server ({@link sortKey}) or in the browser ({@link sortValue}). Defaults to
   * ascending.
   */
  sortFirst?: "asc" | "desc";

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

  /** Initial sort state. `column` is a column's {@link AdminColumnDef.id}, which defaults to its header. */
  defaultSort?: { column: string; direction: "asc" | "desc" };

  /**
   * Controlled sort for a server-paged table, over the columns carrying a
   * {@link AdminColumnDef.sortKey}. Switches the table to TanStack's
   * `manualSorting`, so the rows render in the order they arrived and the
   * headers only report the click.
   */
  serverSort?: ServerSort;

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
  // Rows get a drag handle plus up/down buttons, and sorting is switched off so
  // the displayed order is always the stored one.
  reorder?: {
    /** Move math over the current row order — build with `flatReorder` / `treeReorder`. */
    moves: ReorderMoves;
    /**
     * Commits the new order. Return the mutation's promise so a failed save
     * rolls the rows back to the server's order.
     */
    onReorder: (keys: string[]) => Promise<unknown> | void;
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

function alignClass(align?: "left" | "center" | "right") {
  if (align) {
    return ALIGN_CLASSES[align];
  }
}

/** What sort state and `defaultSort` name a column by. */
function columnId<TData, TDraft>(col: AdminColumnDef<TData, TDraft>): string {
  return col.id ?? col.header;
}

// Convert our public AdminColumnDef to TanStack ColumnDef.
function toTanStackColumns<TData extends RowData, TDraft>(
  adminCols: AdminColumnDef<TData, TDraft>[],
  enableSort: boolean,
  serverSorted: boolean,
): ColumnDef<AdminTableFeatures, TData>[] {
  return adminCols.map((col) => {
    const sortsOnServer = serverSorted && col.sortKey !== undefined;
    const def: ColumnDef<AdminTableFeatures, TData> = {
      id: columnId(col),
      header: col.header,
      cell: (info) => cloneElement(col.cell, { row: info.row.original, index: info.row.index }),
      enableSorting: enableSort && (Boolean(col.sortValue) || sortsOnServer),
      meta: {
        headerTitle: col.headerTitle,
        width: col.width,
        align: col.align,
        editCell: col.editCell,
        addCell: col.addCell,
      } satisfies AdminColumnMeta<TDraft>,
    };

    if (sortsOnServer) {
      // `getCanSort` refuses a column with no accessor, and under
      // `manualSorting` the value is never read, so this only unlocks the
      // header. The row order comes back with the page.
      (def as ColumnDef<AdminTableFeatures, TData> & { accessorFn: () => null }).accessorFn = () =>
        null;
    }

    // A server-sorted column always states the direction, because its accessor
    // is a constant null and table-core's own guess reads that as descending.
    if (sortsOnServer || col.sortFirst !== undefined) {
      def.sortDescFirst = col.sortFirst === "desc";
    }

    if (col.sortValue) {
      const { sortValue } = col;
      // A blank reaches the row model as undefined rather than null, because
      // `sortUndefined` is the sorted row model's only blank handling and it
      // tests for undefined. That path also returns before the descending pass
      // negates the comparison, which is what keeps blanks trailing whichever
      // way the column runs, the way the server orders a nullable column.
      (
        def as ColumnDef<AdminTableFeatures, TData> & {
          accessorFn: (row: TData) => string | number | undefined;
        }
      ).accessorFn = (row: TData) => sortValue(row) ?? undefined;
      def.sortUndefined = "last";
      // Only ever handed two present values, since sortUndefined settles the
      // rest. Kept over a built-in because those coerce through String, which
      // misorders negatives and decimals, and compare by char code, which files
      // every accented name after Z.
      def.sortFn = (rowA, rowB, id) => {
        const va = rowA.getValue<string | number>(id);
        const vb = rowB.getValue<string | number>(id);
        if (typeof va === "string" && typeof vb === "string") {
          return va.localeCompare(vb);
        }
        return (va as number) - (vb as number);
      };
    }

    return def;
  });
}

/** The sorting state a server-sorted table is showing, keyed back to column ids. */
function serverSortingState<TData, TDraft>(
  adminCols: AdminColumnDef<TData, TDraft>[],
  serverSort: ServerSort,
): SortingState {
  const column = adminCols.find((col) => col.sortKey === serverSort.key);
  if (column === undefined) {
    return [];
  }
  return [{ id: columnId(column), desc: serverSort.direction === "desc" }];
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
  serverSort,
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

  // Key order shown right after a drop, before the save's refetch lands. See
  // `showsPendingOrder` below.
  const [pendingOrder, setPendingOrder] = useState<{ keys: string[]; from: string } | null>(null);
  /** Key of the row being dragged, so the rows it can't land on stand down. */
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const sensors = useSensors(
    // A distance threshold so a click on the handle isn't read as a drag, and
    // the keyboard sensor so the handle does something when tabbed to.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const enableSort = !reorder;
  const tanStackColumns = toTanStackColumns(adminColumns, enableSort, serverSort !== undefined);

  const initialSorting: SortingState = defaultSort
    ? [{ id: defaultSort.column, desc: defaultSort.direction === "desc" }]
    : [];
  const [localSorting, setLocalSorting] = useState<SortingState>(initialSorting);
  const sorting =
    serverSort === undefined ? localSorting : serverSortingState(adminColumns, serverSort);

  function handleSortingChange(updater: Updater<SortingState>) {
    const next = functionalUpdate(updater, sorting);
    if (serverSort === undefined) {
      setLocalSorting(next);
      return;
    }
    const first = next[0];
    if (first === undefined) {
      serverSort.onChange({ key: null, direction: "asc" });
      return;
    }
    const key = adminColumns.find((col) => columnId(col) === first.id)?.sortKey ?? null;
    serverSort.onChange({ key, direction: first.desc ? "desc" : "asc" });
  }

  const table = useTable({
    features,
    data,
    columns: tanStackColumns,
    state: { sorting },
    onSortingChange: handleSortingChange,
    manualSorting: serverSort !== undefined,
    getRowId: (row) => getRowKey(row),
    enableSorting: enableSort,
  });

  const hasActions = Boolean(edit || del || actions || addChild);
  const totalCols = adminColumns.length + (reorder ? 1 : 0) + (hasActions ? 1 : 0);

  // --- Row order ---
  // Row-model order, so a sortable table keeps rendering in its sorted order (a
  // reorderable one has sorting switched off, leaving the stored order).
  const rows = table.getRowModel().rows;
  const rowKeys = rows.map((row) => row.id);
  // The reorder mutations only invalidate, so the rows would snap back to the
  // old order until the refetch lands. Keep the dropped order on screen while
  // the data still reads exactly as it did at drop time. Any change at all (the
  // confirming refetch, an added row) retires it, so a save that comes back
  // different can't strand a stale order.
  const orderSignature = rowKeys.join("\u0000");
  const showsPendingOrder = pendingOrder !== null && pendingOrder.from === orderSignature;
  const orderedKeys = showsPendingOrder ? pendingOrder.keys : rowKeys;
  // While the dropped order is still unconfirmed, `reorder.moves` describes the
  // pre-move order, so a second move would compute from the wrong list.
  const reorderLocked = Boolean(reorder?.isPending) || showsPendingOrder;

  async function commitReorder(keys: string[] | null) {
    if (!reorder || !keys) {
      return;
    }
    setPendingOrder({ keys, from: orderSignature });
    try {
      await reorder.onReorder(keys);
    } catch {
      // Back to the server's order. The global mutation error toast reports the
      // failure itself.
      setPendingOrder(null);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveKey(String(event.active.id));
  }

  function handleDragCancel() {
    setActiveKey(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveKey(null);
    if (!reorder || !over || active.id === over.id) {
      return;
    }
    void commitReorder(reorder.moves.moveTo(String(active.id), String(over.id)));
  }

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
  const rowByKey = new Map(rows.map((row) => [row.id, row]));

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
      {/* The second Export/Add pair below is not a duplicate: `title` is
          optional, and a table rendered without one has no top bar to host
          them, so they move into the toolbar row. The two branches are
          mutually exclusive, so only ever one pair renders. */}
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
        <ReorderProvider
          enabled={Boolean(reorder)}
          sensors={sensors}
          items={orderedKeys}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <Table>
            <TableHeader>
              {headerGroups.map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {reorder && <TableHead className="w-24">Order</TableHead>}
                  {headerGroup.headers.map((header) => {
                    const meta = header.column.columnDef.meta as
                      | AdminColumnMeta<TDraft>
                      | undefined;
                    const canSort = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <TableHead
                        key={header.id}
                        className={cn(meta?.width, alignClass(meta?.align))}
                        title={meta?.headerTitle}
                        aria-sort={canSort ? ariaSort(sorted) : undefined}
                      >
                        {canSort ? (
                          <SortHeaderButton
                            sorted={sorted}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <FlexRender header={header} />
                          </SortHeaderButton>
                        ) : (
                          <FlexRender header={header} />
                        )}
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

              {/* Data rows, in the displayed order (which may be a just-dropped
                order the save hasn't confirmed yet). */}
              {orderedKeys.map((key) => {
                const row = rowByKey.get(key);
                if (!row) {
                  return null;
                }
                const original = row.original;
                const index = row.index;
                const isEditing = editingKey === row.id && editDraft !== null;
                const childCfg = addChild;
                const showAddChild =
                  childCfg && (childCfg.canAddChild ? childCfg.canAddChild(original) : true);

                const cells = (
                  <>
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
                  </>
                );

                return (
                  <Fragment key={row.id}>
                    {reorder ? (
                      <ReorderableRow
                        id={row.id}
                        locked={reorderLocked}
                        // A drag in progress can only land on rows the move math
                        // accepts, which on the channels tree means siblings.
                        droppable={activeKey === null || reorder.moves.canDropOn(activeKey, key)}
                        canMoveUp={reorder.moves.canStep(key, -1)}
                        canMoveDown={reorder.moves.canStep(key, 1)}
                        onMove={(direction) => {
                          void commitReorder(reorder.moves.step(key, direction));
                        }}
                      >
                        {cells}
                      </ReorderableRow>
                    ) : (
                      <TableRow>{cells}</TableRow>
                    )}
                    {addingUnderKey === row.id && addRow}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </ReorderProvider>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal: reorder chrome
// ---------------------------------------------------------------------------

/**
 * Puts the table inside a dnd-kit sortable context, or renders it untouched on
 * the tables that don't reorder.
 *
 * @returns The table, wrapped when reordering is on.
 */
function ReorderProvider({
  enabled,
  sensors,
  items,
  onDragStart,
  onDragEnd,
  onDragCancel,
  children,
}: {
  enabled: boolean;
  sensors: SensorDescriptor<SensorOptions>[];
  items: string[];
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: () => void;
  children: ReactNode;
}) {
  if (!enabled) {
    return children;
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      // Rows only ever swap places in one column, so a drag has no business
      // leaving the vertical axis.
      modifiers={[restrictToVerticalAxis]}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/**
 * A data row on a reorderable table: draggable by its grip, with the up/down
 * buttons beside it for single steps and keyboard use.
 *
 * @returns The row, including its leading Order cell.
 */
function ReorderableRow({
  id,
  locked,
  droppable,
  canMoveUp,
  canMoveDown,
  onMove,
  children,
}: {
  id: string;
  /** True while a previous move is still being saved — everything is inert. */
  locked: boolean;
  /** Whether the row currently being dragged is allowed to land here. */
  droppable: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
  children: ReactNode;
}) {
  // Destructured into locals before the JSX: member access on the hook's return
  // object in render makes the React Compiler bail. Matches SortableSidebarRow.
  const {
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    attributes,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: locked ? true : { draggable: false, droppable: !droppable } });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      // The dragged row is lifted out of the flow visually, so it needs its own
      // background to stop the rows it passes showing through.
      className={cn(isDragging && "bg-background relative z-10 shadow-lg")}
    >
      <TableCell>
        <div className="flex items-center gap-0.5">
          {/* oxlint-disable-next-line react/forbid-elements -- dnd-kit drag activator, sized to sit with the two icon buttons */}
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            type="button"
            disabled={locked}
            aria-label="Drag to reorder"
            className={cn(
              "text-muted-foreground hover:text-foreground flex h-6 w-5 items-center justify-center rounded-md",
              // dnd-kit's PointerSensor needs the browser to keep sending
              // pointer events; the default touch-action pans the page instead
              // and the pointercancel that follows kills the drag.
              "touch-none outline-hidden",
              "focus-visible:ring-ring focus-visible:ring-2",
              locked ? "cursor-not-allowed opacity-50" : "cursor-grab active:cursor-grabbing",
            )}
          >
            <GripVerticalIcon className="h-3.5 w-3.5" />
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label="Move up"
            disabled={!canMoveUp || locked}
            onClick={() => onMove(-1)}
          >
            <ArrowUpIcon className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label="Move down"
            disabled={!canMoveDown || locked}
            onClick={() => onMove(1)}
          >
            <ArrowDownIcon className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
      {children}
    </TableRow>
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
