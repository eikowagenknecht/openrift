import { formatDayTime, slugifyName } from "@openrift/shared";
import type { ProductSummary } from "@openrift/shared/contracts/products";
import { RESERVED_PRODUCT_SLUGS, productSlugRegex } from "@openrift/shared/contracts/products";
import { Link } from "@tanstack/react-router";
import { RefreshCwIcon } from "lucide-react";
import { useState } from "react";

import { SlugCell } from "@/components/admin/admin-crud-shared";
import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { PageDescription, PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLists } from "@/hooks/use-lists";
import {
  useCreateProduct,
  useDeleteProduct,
  useProductsList,
  useResyncProduct,
  useUpdateProduct,
} from "@/hooks/use-products";
import { useSets } from "@/hooks/use-sets";
import { suggestListIdForProduct } from "@/lib/suggest-product-list";

import type { AdminCellSlotProps, AdminColumnDef, AdminDraftSlotProps } from "./admin-table";
import { AdminTable } from "./admin-table";

interface ProductDraft {
  id: string;
  name: string;
  slug: string;
  description: string;
  /** Set UUID, or "" for no set. */
  setId: string;
}

/** @returns A client-side validation error for the metadata fields, or null. */
function validateDraft(draft: { name: string; slug: string }): string | null {
  if (!draft.name.trim()) {
    return "Name is required";
  }
  if (!productSlugRegex.test(draft.slug)) {
    return "Slug must be 3-80 chars of lowercase letters, digits, and dashes";
  }
  if ((RESERVED_PRODUCT_SLUGS as readonly string[]).includes(draft.slug)) {
    return "This slug is reserved";
  }
  return null;
}

// ── Display cells ────────────────────────────────────────────────────────────

function NameCell({ row }: AdminCellSlotProps<ProductSummary>) {
  if (!row) {
    return null;
  }
  return (
    <Link to="/products/$slug" params={{ slug: row.slug }} className="font-medium hover:underline">
      {row.name}
    </Link>
  );
}

function DescriptionCell({ row }: AdminCellSlotProps<ProductSummary>) {
  return <span className="text-muted-foreground line-clamp-1 max-w-64">{row?.description}</span>;
}

function SetCell({ row }: AdminCellSlotProps<ProductSummary>) {
  return <span className="text-muted-foreground">{row?.set?.name}</span>;
}

function CardTotalCell({ row }: AdminCellSlotProps<ProductSummary>) {
  return <span>{row?.cardTotal}</span>;
}

function PrintingCountCell({ row }: AdminCellSlotProps<ProductSummary>) {
  return <span>{row?.printingCount}</span>;
}

function UpdatedCell({ row }: AdminCellSlotProps<ProductSummary>) {
  if (!row) {
    return null;
  }
  return <span className="text-muted-foreground text-xs">{formatDayTime(row.updatedAt)}</span>;
}

// ── Edit draft cells ─────────────────────────────────────────────────────────

function NameInput({ draft, setDraft }: AdminDraftSlotProps<ProductDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.name}
      onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
      className="h-8"
    />
  );
}

function SlugInput({ draft, setDraft }: AdminDraftSlotProps<ProductDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.slug}
      onChange={(e) => setDraft((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))}
      className="h-8 w-56 font-mono"
    />
  );
}

function DescriptionInput({ draft, setDraft }: AdminDraftSlotProps<ProductDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.description}
      onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
      placeholder="Optional markdown description"
      className="h-8"
    />
  );
}

/** Sentinel select value for "no set" (BaseUI selects don't take ""). */
const NO_SET = "none";

function SetPicker({
  value,
  onChange,
  className,
}: {
  /** Set UUID, or "" for no set. */
  value: string;
  onChange: (setId: string) => void;
  className?: string;
}) {
  const { data } = useSets();
  const items = [
    { value: NO_SET, label: "No set" },
    ...data.sets.map((set) => ({ value: set.id, label: set.name })),
  ];
  return (
    <Select
      items={items}
      value={value || NO_SET}
      onValueChange={(next) => onChange(next === NO_SET || next === null ? "" : next)}
    >
      <SelectTrigger aria-label="Set" className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SetInput({ draft, setDraft }: AdminDraftSlotProps<ProductDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <SetPicker
      value={draft.setId}
      onChange={(setId) => setDraft((prev) => ({ ...prev, setId }))}
      className="h-8"
    />
  );
}

const productColumns: AdminColumnDef<ProductSummary, ProductDraft>[] = [
  { header: "Name", sortValue: (p) => p.name, cell: <NameCell />, editCell: <NameInput /> },
  {
    header: "Slug",
    sortValue: (p) => p.slug,
    cell: <SlugCell<ProductSummary> />,
    editCell: <SlugInput />,
  },
  { header: "Set", sortValue: (p) => p.set?.name ?? "", cell: <SetCell />, editCell: <SetInput /> },
  { header: "Description", cell: <DescriptionCell />, editCell: <DescriptionInput /> },
  { header: "Cards", align: "right", sortValue: (p) => p.cardTotal, cell: <CardTotalCell /> },
  {
    header: "Unique",
    align: "right",
    sortValue: (p) => p.printingCount,
    cell: <PrintingCountCell />,
  },
  { header: "Updated", sortValue: (p) => p.updatedAt, cell: <UpdatedCell /> },
];

// ── List picker (shared by create + re-sync dialogs) ─────────────────────────

interface ListPickerItem {
  value: string;
  label: string;
  name: string;
}

function ListPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (listId: string, listName: string) => void;
}) {
  const { data: lists } = useLists();
  const items: ListPickerItem[] = lists
    .filter((list) => list.kind === "printing")
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map((list) => ({
      value: list.id,
      label: `${list.name} (${list.entryCount} entries)`,
      name: list.name,
    }));

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        You have no printing lists yet. Build the product in an organize list with printing
        granularity first, then snapshot it here.
      </p>
    );
  }
  const selected = items.find((item) => item.value === value) ?? null;
  return (
    <Combobox<ListPickerItem>
      items={items}
      value={selected}
      onValueChange={(item) => onChange(item?.value ?? "", item?.name ?? "")}
      itemToStringLabel={(item) => item.label}
    >
      <ComboboxInput
        aria-label="Source list"
        placeholder="Pick one of your printing lists"
        className="w-full"
      />
      <ComboboxContent>
        <ComboboxEmpty>No matching lists</ComboboxEmpty>
        <ComboboxList>
          {(item: ListPickerItem) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

// ── Create dialog ────────────────────────────────────────────────────────────

const EMPTY_CREATE_DRAFT = { name: "", slug: "", description: "", setId: "", listId: "" };

function CreateProductDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState(EMPTY_CREATE_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const createProduct = useCreateProduct();

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setDraft(EMPTY_CREATE_DRAFT);
      setError(null);
    }
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    let validationError = validateDraft(draft);
    if (!validationError && !draft.listId) {
      validationError = "Pick the list to snapshot";
    }
    if (validationError) {
      setError(validationError);
      return;
    }
    // Built outside try/catch: the React Compiler can't yet handle value
    // blocks (||, ?:) inside try statements and would skip the component.
    const payload = {
      name: draft.name.trim(),
      slug: draft.slug,
      description: draft.description.trim() || null,
      setId: draft.setId || null,
      listId: draft.listId,
    };
    try {
      await createProduct.mutateAsync(payload);
      handleOpenChange(false);
    } catch (submitError) {
      if (submitError instanceof Error) {
        setError(submitError.message);
      } else {
        setError("Creating the product failed");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogForm onSubmit={() => void handleSubmit()}>
          <DialogHeader>
            <DialogTitle>Create product from list</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Source list</Label>
              <ListPicker
                value={draft.listId}
                onChange={(listId, listName) =>
                  // Picking a list pre-fills name and slug from the list name;
                  // both stay editable afterwards.
                  setDraft((prev) => ({
                    ...prev,
                    listId,
                    name: listName || prev.name,
                    slug: listName ? slugifyName(listName) : prev.slug,
                  }))
                }
              />
              <p className="text-muted-foreground text-xs">
                The list&apos;s cards and quantities become the product&apos;s contents. The product
                is a snapshot: later list edits don&apos;t apply until you re-sync.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="product-name">Name</Label>
              <Input
                id="product-name"
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Origins Starter Set"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="product-slug">Slug</Label>
              <Input
                id="product-slug"
                value={draft.slug}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))
                }
                placeholder="origins-starter-set"
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Set</Label>
              <SetPicker
                value={draft.setId}
                onChange={(setId) => setDraft((prev) => ({ ...prev, setId }))}
              />
              <p className="text-muted-foreground text-xs">
                The wave the product released with. The public products page groups by it.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="product-description">Description</Label>
              <Textarea
                id="product-description"
                value={draft.description}
                onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Optional markdown blurb shown on the product page."
                rows={3}
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createProduct.isPending}>
              Create product
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

// ── Re-sync dialog ───────────────────────────────────────────────────────────

function ResyncDialog({
  product,
  onOpenChange,
}: {
  product: ProductSummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: lists } = useLists();
  const [listId, setListId] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Tracks which product the picker was pre-filled for, so opening the dialog
  // for a product suggests the list named like it exactly once.
  const [suggestedFor, setSuggestedFor] = useState<string | null>(null);
  const resyncProduct = useResyncProduct();

  // Adjust state during render (React's alternative to an effect): when the
  // dialog opens for a new product, pre-select the printing list that looks
  // like it so the admin usually just confirms.
  if (product && product.id !== suggestedFor) {
    setSuggestedFor(product.id);
    setListId(suggestListIdForProduct(lists, product) ?? "");
    setError(null);
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setListId("");
      setError(null);
      setSuggestedFor(null);
    }
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!product) {
      return;
    }
    if (!listId) {
      setError("Pick the list to snapshot");
      return;
    }
    const payload = { id: product.id, listId };
    try {
      await resyncProduct.mutateAsync(payload);
      handleOpenChange(false);
    } catch (submitError) {
      if (submitError instanceof Error) {
        setError(submitError.message);
      } else {
        setError("Re-syncing failed");
      }
    }
  };

  return (
    <Dialog open={product !== null} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogForm onSubmit={() => void handleSubmit()}>
          <DialogHeader>
            <DialogTitle>Re-sync contents{product ? `: ${product.name}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              Replaces the product&apos;s entire contents with a fresh snapshot of the picked list.
            </p>
            <ListPicker value={listId} onChange={setListId} />
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={resyncProduct.isPending}>
              Replace contents
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

function ResyncAction({
  row,
  onResync,
}: AdminCellSlotProps<ProductSummary> & { onResync: (product: ProductSummary) => void }) {
  if (!row) {
    return null;
  }
  return (
    <Button variant="ghost" size="sm" onClick={() => onResync(row)}>
      <RefreshCwIcon />
      Re-sync
    </Button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function AdminProductsPage() {
  const { data } = useProductsList();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const [createOpen, setCreateOpen] = useState(false);
  const [resyncTarget, setResyncTarget] = useState<ProductSummary | null>(null);

  return (
    <div className="space-y-4">
      <AdminPageTopBar
        title="Products"
        actions={
          <PageTopBarPrimaryButton onClick={() => setCreateOpen(true)}>
            Create product
          </PageTopBarPrimaryButton>
        }
      />
      <AdminTable
        columns={productColumns}
        data={data.products}
        getRowKey={(product) => product.id}
        emptyText="No products yet — create one from a printing list."
        defaultSort={{ column: "Name", direction: "asc" }}
        toolbar={
          <PageDescription>
            Products are public the moment they exist. Contents change only by re-syncing from a
            list.
          </PageDescription>
        }
        edit={{
          toDraft: (product) => ({
            id: product.id,
            name: product.name,
            slug: product.slug,
            description: product.description ?? "",
            setId: product.set?.id ?? "",
          }),
          onSave: (draft) =>
            updateProduct.mutateAsync({
              id: draft.id,
              name: draft.name.trim(),
              slug: draft.slug,
              description: draft.description.trim() || null,
              setId: draft.setId || null,
            }),
          validate: validateDraft,
        }}
        delete={{
          onDelete: (product) => deleteProduct.mutateAsync({ id: product.id }),
          confirm: (product) => ({
            title: `Delete "${product.name}"?`,
            description:
              "The product and its contents are removed immediately. Collections, decks, and lists are not affected.",
          }),
        }}
        actions={<ResyncAction onResync={setResyncTarget} />}
      />
      <CreateProductDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ResyncDialog product={resyncTarget} onOpenChange={() => setResyncTarget(null)} />
    </div>
  );
}
