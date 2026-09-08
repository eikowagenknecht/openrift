import type {
  ColumnDef,
  RowData,
  Row as TanStackRow,
  Table as TanStackTable,
} from "@tanstack/react-table";
import {
  FlexRender,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { DownloadIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Fragment, cloneElement, useState } from "react";

import { PageTopBarButton, PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminPageTopBar } from "@/features/admin/components/admin-page-top-bar";
import type { AdminDeleteConfig } from "@/features/admin/components/admin-table-delete-button";
import { DeleteButton } from "@/features/admin/components/admin-table-delete-button";
import {
  ReorderProvider,
  ReorderableRow,
} from "@/features/admin/components/admin-table-reorder-row";
import { SortHeaderButton, ariaSort } from "@/features/admin/components/sortable-header";
import type { AdminReorderConfig } from "@/features/admin/hooks/use-admin-reorder";
import { useAdminReorder } from "@/features/admin/hooks/use-admin-reorder";
import { useAdminSorting } from "@/features/admin/hooks/use-admin-sorting";
import { useAdminTableEditing } from "@/features/admin/hooks/use-admin-table-editing";
import { columnId } from "@/features/admin/lib/admin-table-columns";
import type { ServerSort } from "@/features/admin/lib/admin-table-types";
import { downloadJSON } from "@/features/collections/lib/json-export";
import { cn } from "@/lib/utils";

// The row model is registered unconditionally even on reorder tables, where
// `enableSorting: false` keeps every column out of its sort list.
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

type AdminTableFeatures = typeof features;

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
  header: string;
  id?: string;
  headerTitle?: string;
  width?: string;
  align?: "left" | "center" | "right";

  sortValue?: (row: TData) => string | number | null;
  sortKey?: string;
  sortFirst?: "asc" | "desc";

  cell: ReactElement<AdminCellSlotProps<TData>>;
  editCell?: ReactElement<AdminDraftSlotProps<TDraft>>;
  addCell?: ReactElement<AdminDraftSlotProps<TDraft>>;
}

interface AdminHeaderMeta {
  headerTitle?: string;
  width?: string;
  align?: "left" | "center" | "right";
}

interface AdminColumnMeta<TDraft> extends AdminHeaderMeta {
  editCell?: ReactElement<AdminDraftSlotProps<TDraft>>;
  addCell?: ReactElement<AdminDraftSlotProps<TDraft>>;
}

interface AdminTableProps<TData, TDraft = TData> {
  columns: AdminColumnDef<TData, TDraft>[];
  data: TData[];
  getRowKey: (row: TData) => string;
  emptyText?: string;

  defaultSort?: { column: string; direction: "asc" | "desc" };
  serverSort?: ServerSort;

  title?: ReactNode;
  toolbar?: ReactNode;

  add?: {
    emptyDraft: TDraft;
    onSave: (draft: TDraft) => Promise<unknown>;
    validate?: (draft: TDraft) => string | null;
    label?: string;
  };

  addChild?: {
    toDraft: (row: TData) => TDraft;
    canAddChild?: (row: TData) => boolean;
  };

  edit?: {
    toDraft: (row: TData) => TDraft;
    onSave: (draft: TDraft) => Promise<unknown>;
    validate?: (draft: TDraft) => string | null;
  };

  delete?: AdminDeleteConfig<TData>;

  reorder?: AdminReorderConfig;

  export?: {
    filename: string;
    transform?: (data: TData[]) => unknown;
  };

  actions?: ReactElement<AdminCellSlotProps<TData>>;
}

const ALIGN_CLASSES: Record<string, string> = { right: "text-right", center: "text-center" };

function alignClass(align?: "left" | "center" | "right") {
  if (align) {
    return ALIGN_CLASSES[align];
  }
}

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
      // `getCanSort` refuses a column with no accessor; under `manualSorting`
      // the value is never read, so this only unlocks the header.
      (def as ColumnDef<AdminTableFeatures, TData> & { accessorFn: () => null }).accessorFn = () =>
        null;
    }

    // A server-sorted column always states the direction: its accessor is a
    // constant null and table-core's own guess reads that as descending.
    if (sortsOnServer || col.sortFirst !== undefined) {
      def.sortDescFirst = col.sortFirst === "desc";
    }

    if (col.sortValue) {
      const { sortValue } = col;
      // `sortUndefined` is the sorted row model's only blank handling, and it
      // tests for undefined, so a blank must reach it as undefined, not null.
      (
        def as ColumnDef<AdminTableFeatures, TData> & {
          accessorFn: (row: TData) => string | number | undefined;
        }
      ).accessorFn = (row: TData) => sortValue(row) ?? undefined;
      def.sortUndefined = "last";
      // Built-in comparators coerce through String, misordering negatives and
      // decimals and filing accented names after Z.
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
  const [deleteError, setDeleteError] = useState("");

  const {
    adding,
    addDraft,
    addingUnderKey,
    editingKey,
    editDraft,
    error: draftError,
    pending: draftPending,
    startAdding,
    startEditing,
    updateDraft,
    cancel: cancelDraft,
    save: saveDraft,
  } = useAdminTableEditing({ add, edit });

  const enableSort = !reorder;
  const { sorting, handleSortingChange } = useAdminSorting({
    columns: adminColumns,
    defaultSort,
    serverSort,
  });

  const table = useTable({
    features,
    data,
    columns: toTanStackColumns(adminColumns, enableSort, serverSort !== undefined),
    state: { sorting },
    onSortingChange: handleSortingChange,
    manualSorting: serverSort !== undefined,
    getRowId: (row) => getRowKey(row),
    enableSorting: enableSort,
  });

  const rows = table.getRowModel().rows;
  const rowByKey = new Map(rows.map((row) => [row.id, row]));
  const {
    sensors,
    activeKey,
    orderedKeys,
    locked: reorderLocked,
    commitReorder,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  } = useAdminReorder({ reorder, rowKeys: rows.map((row) => row.id) });

  const hasActions = Boolean(edit || del || actions || addChild);
  const totalCols = adminColumns.length + (reorder ? 1 : 0) + (hasActions ? 1 : 0);

  const addRow =
    adding && addDraft !== null ? (
      <TableRow>
        {reorder && <TableCell />}
        {adminColumns.map((col) => (
          <TableCell key={col.header} className={alignClass(col.align)}>
            {col.addCell
              ? cloneElement(col.addCell, { draft: addDraft, setDraft: updateDraft })
              : null}
          </TableCell>
        ))}
        {hasActions && (
          <TableCell className="text-right">
            <SaveCancelButtons
              onSave={() => void saveDraft()}
              onCancel={cancelDraft}
              isPending={draftPending}
              error={draftError}
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
      <AdminTableChrome
        title={title}
        toolbar={toolbar}
        adding={adding}
        addLabel={add?.label ?? "Add"}
        onAdd={add ? () => startAdding() : undefined}
        onExport={handleExport}
      />

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
            <AdminTableHead
              table={table}
              showOrderColumn={Boolean(reorder)}
              hasActions={hasActions}
            />
            <TableBody>
              {addingUnderKey === null && addRow}

              {rows.length === 0 && !adding && (
                <TableRow>
                  <TableCell colSpan={totalCols} className="text-muted-foreground h-24 text-center">
                    {emptyText}
                  </TableCell>
                </TableRow>
              )}

              {orderedKeys.map((key) => {
                const row = rowByKey.get(key);
                if (!row) {
                  return null;
                }
                const original = row.original;
                const childCfg = addChild;
                const showAddChild =
                  childCfg && (childCfg.canAddChild ? childCfg.canAddChild(original) : true);

                const cells = (
                  <AdminRowCells
                    row={row}
                    hasActions={hasActions}
                    editDraft={editingKey === row.id ? editDraft : null}
                    updateDraft={updateDraft}
                    onSave={() => void saveDraft()}
                    onCancel={cancelDraft}
                    pending={draftPending}
                    error={draftError}
                    actions={actions}
                    onAddChild={
                      showAddChild && childCfg
                        ? () => startAdding(childCfg.toDraft(original), getRowKey(original))
                        : undefined
                    }
                    onEdit={
                      edit
                        ? () => startEditing(getRowKey(original), edit.toDraft(original))
                        : undefined
                    }
                    del={del}
                    deleteError={deleteError}
                    setDeleteError={setDeleteError}
                  />
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

function AdminRowCells<TData extends RowData, TDraft>({
  row,
  hasActions,
  editDraft,
  updateDraft,
  onSave,
  onCancel,
  pending,
  error,
  actions,
  onAddChild,
  onEdit,
  del,
  deleteError,
  setDeleteError,
}: {
  row: TanStackRow<AdminTableFeatures, TData>;
  hasActions: boolean;
  editDraft: TDraft | null;
  updateDraft: (fn: (prev: TDraft) => TDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
  error: string;
  actions?: ReactElement<AdminCellSlotProps<TData>>;
  onAddChild?: () => void;
  onEdit?: () => void;
  del?: AdminDeleteConfig<TData>;
  deleteError: string;
  setDeleteError: (err: string) => void;
}) {
  const isEditing = editDraft !== null;
  return (
    <>
      {/* getAllCells, not getVisibleCells: pair with the same call in
          admin-card-table-shared.tsx if that ever registers
          columnVisibilityFeature. */}
      {row.getAllCells().map((cell) => {
        const meta = cell.column.columnDef.meta as AdminColumnMeta<TDraft> | undefined;
        return (
          <TableCell key={cell.id} className={alignClass(meta?.align)}>
            {isEditing && meta?.editCell ? (
              cloneElement(meta.editCell, { draft: editDraft, setDraft: updateDraft })
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
              onSave={onSave}
              onCancel={onCancel}
              isPending={pending}
              error={error}
            />
          ) : (
            <div className="flex items-center justify-end gap-1">
              {actions ? cloneElement(actions, { row: row.original, index: row.index }) : null}
              {onAddChild && (
                <Button variant="ghost" onClick={onAddChild}>
                  Add child
                </Button>
              )}
              {onEdit && (
                <Button variant="ghost" onClick={onEdit}>
                  Edit
                </Button>
              )}
              {del && (
                <DeleteButton
                  row={row.original}
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
}

function AdminTableChrome({
  title,
  toolbar,
  adding,
  addLabel,
  onAdd,
  onExport,
}: {
  title?: ReactNode;
  toolbar?: ReactNode;
  adding: boolean;
  addLabel: string;
  onAdd?: () => void;
  onExport?: () => void;
}) {
  if (title !== undefined) {
    return (
      <>
        <AdminPageTopBar
          title={title}
          actions={
            (onExport || onAdd) && (
              <>
                {onExport && (
                  <PageTopBarButton onClick={onExport}>
                    <DownloadIcon />
                    Export JSON
                  </PageTopBarButton>
                )}
                {onAdd && (
                  <PageTopBarPrimaryButton onClick={onAdd} disabled={adding}>
                    {addLabel}
                  </PageTopBarPrimaryButton>
                )}
              </>
            )
          }
        />
        {toolbar}
      </>
    );
  }

  if (!toolbar && !onAdd && !onExport) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">{toolbar}</div>
      <div className="flex items-center gap-2">
        {onExport && (
          <Button variant="outline" onClick={onExport}>
            <DownloadIcon className="h-4 w-4" />
            Export JSON
          </Button>
        )}
        {onAdd && !adding && (
          <Button variant="outline" onClick={onAdd}>
            {addLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

function AdminTableHead<TData extends RowData>({
  table,
  showOrderColumn,
  hasActions,
}: {
  table: TanStackTable<AdminTableFeatures, TData>;
  showOrderColumn: boolean;
  hasActions: boolean;
}) {
  return (
    <TableHeader>
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id}>
          {showOrderColumn && <TableHead className="w-24">Order</TableHead>}
          {headerGroup.headers.map((header) => {
            const meta = header.column.columnDef.meta as AdminHeaderMeta | undefined;
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
  );
}

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
