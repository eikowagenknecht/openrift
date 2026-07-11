import type { OrganizationSummaryResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { Heading } from "@/components/heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { useAdminUsers } from "@/hooks/use-admin-users";
import {
  useAdminCreateOrganization,
  useAdminDeleteOrganization,
  useAdminOrganizations,
  useAdminUpdateOrganization,
} from "@/hooks/use-organizations";

function EditOrgDialog({ org }: { org: OrganizationSummaryResponse }) {
  const updateOrg = useAdminUpdateOrganization();
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(org.slug);
  const [name, setName] = useState(org.name);
  const [description, setDescription] = useState(org.description ?? "");

  function handleOpenChange(next: boolean) {
    if (next) {
      setSlug(org.slug);
      setName(org.name);
      setDescription(org.description ?? "");
    }
    setOpen(next);
  }

  async function handleSave() {
    if (!slug.trim() || !name.trim()) {
      return;
    }
    const trimmedDescription = description.trim() || null;
    try {
      await updateOrg.mutateAsync({
        id: org.id,
        slug: slug.trim(),
        name: name.trim(),
        description: trimmedDescription,
      });
      setOpen(false);
      toast.success("Organization updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="ghost" />}>Edit</DialogTrigger>
      <DialogContent>
        <DialogForm onSubmit={handleSave}>
          <DialogHeader>
            <DialogTitle>Edit organization</DialogTitle>
            <DialogDescription>
              Owner {org.ownerName ?? org.ownerUserId}. The owner can only be changed by
              transferring membership.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-org-slug-${org.id}`}>Slug</Label>
              <Input
                id={`edit-org-slug-${org.id}`}
                value={slug}
                onChange={(event) => setSlug(event.target.value.toLowerCase())}
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-org-name-${org.id}`}>Name</Label>
              <Input
                id={`edit-org-name-${org.id}`}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor={`edit-org-desc-${org.id}`}>Description</Label>
              <Input
                id={`edit-org-desc-${org.id}`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={!slug.trim() || !name.trim() || updateOrg.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

function OrgRow({ org }: { org: OrganizationSummaryResponse }) {
  const deleteOrg = useAdminDeleteOrganization();
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 p-3">
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-2">
          <span className="font-medium">{org.name}</span>
          <Badge variant="outline" className="font-mono">
            {org.slug}
          </Badge>
        </span>
        <span className="text-muted-foreground text-sm">
          Owner {org.ownerName ?? org.ownerUserId} · {org.memberCount} member
          {org.memberCount === 1 ? "" : "s"}
        </span>
      </span>
      <span className="flex items-center gap-1">
        <EditOrgDialog org={org} />
        <Button
          size="sm"
          variant="ghost"
          render={<Link to="/organizations/$id" params={{ id: org.id }} />}
        >
          Members
        </Button>
        {confirming ? (
          <>
            <Button
              size="sm"
              variant="destructive"
              disabled={deleteOrg.isPending}
              onClick={async () => {
                try {
                  await deleteOrg.mutateAsync(org.id);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Delete failed");
                }
              }}
            >
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => setConfirming(true)}
          >
            Delete
          </Button>
        )}
      </span>
    </li>
  );
}

export function AdminOrganizationsPage() {
  const { data } = useAdminOrganizations();
  const { data: usersData } = useAdminUsers();
  const createOrg = useAdminCreateOrganization();

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");

  const userItems = usersData.users
    .toSorted((a, b) => a.email.localeCompare(b.email))
    .map((user) => ({
      value: user.id,
      label: user.name ? `${user.email} (${user.name})` : user.email,
    }));

  async function handleCreate() {
    if (!slug.trim() || !name.trim() || !ownerUserId) {
      return;
    }
    const trimmedDescription = description.trim() || null;
    try {
      await createOrg.mutateAsync({
        slug: slug.trim(),
        name: name.trim(),
        description: trimmedDescription,
        ownerUserId,
      });
      setSlug("");
      setName("");
      setDescription("");
      setOwnerUserId("");
      toast.success("Organization created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Create failed");
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <AdminPageTopBar title="Organizations" />
      <section className="flex flex-col gap-3">
        <Heading level={2}>Create organization</Heading>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-slug">Slug</Label>
            <Input
              id="org-slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLowerCase())}
              placeholder="rift-league"
              className="font-mono"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-name">Name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Rift League"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="org-desc">Description</Label>
            <Input
              id="org-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Owner</Label>
            <Select
              items={userItems}
              value={ownerUserId}
              onValueChange={(value) => value && setOwnerUserId(value)}
            >
              <SelectTrigger aria-label="Owner">
                <SelectValue placeholder="Select owner..." />
              </SelectTrigger>
              <SelectContent>
                {userItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          className="w-fit"
          disabled={!slug.trim() || !name.trim() || !ownerUserId || createOrg.isPending}
          onClick={handleCreate}
        >
          Create
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <Heading level={2}>Organizations</Heading>
        {data.items.length === 0 ? (
          <p className="text-muted-foreground">No organizations yet.</p>
        ) : (
          <ul className="divide-border divide-y rounded-lg border">
            {data.items.map((org) => (
              <OrgRow key={org.id} org={org} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
