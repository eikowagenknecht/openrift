import type { AdminUserResponse } from "@openrift/shared";

import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { Badge } from "@/components/ui/badge";
import { useAdminUsers } from "@/hooks/use-admin-users";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const columns: AdminColumnDef<AdminUserResponse>[] = [
  {
    header: "Name",
    sortValue: (user) => user.name ?? "",
    cell: (user) => (
      <div className="flex items-center gap-2">
        {user.image ? (
          <img
            src={user.image}
            alt=""
            className="size-6 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="bg-muted size-6 rounded-full" />
        )}
        <span className="font-medium">{user.name ?? "—"}</span>
      </div>
    ),
  },
  {
    header: "Email",
    sortValue: (user) => user.email,
    cell: (user) => <span className="text-sm">{user.email}</span>,
  },
  {
    header: "Role",
    align: "center",
    width: "w-24",
    cell: (user) =>
      user.isAdmin ? (
        <Badge variant="default">Admin</Badge>
      ) : (
        <Badge variant="secondary">User</Badge>
      ),
  },
  {
    header: "Cards",
    align: "right",
    width: "w-20",
    sortValue: (user) => user.cardCount,
    cell: (user) => <span className="tabular-nums">{user.cardCount.toLocaleString()}</span>,
  },
  {
    header: "Decks",
    align: "right",
    width: "w-20",
    sortValue: (user) => user.deckCount,
    cell: (user) => <span className="tabular-nums">{user.deckCount.toLocaleString()}</span>,
  },
  {
    header: "Collections",
    align: "right",
    width: "w-28",
    sortValue: (user) => user.collectionCount,
    cell: (user) => <span className="tabular-nums">{user.collectionCount.toLocaleString()}</span>,
  },
  {
    header: "Joined",
    width: "w-32",
    sortValue: (user) => user.createdAt,
    cell: (user) => (
      <span className="text-muted-foreground text-sm">{formatDate(user.createdAt)}</span>
    ),
  },
  {
    header: "Last active",
    width: "w-32",
    sortValue: (user) => user.lastActiveAt ?? "",
    cell: (user) => (
      <span className="text-muted-foreground text-sm">
        {user.lastActiveAt ? formatDate(user.lastActiveAt) : "Never"}
      </span>
    ),
  },
];

export function UsersPage() {
  const { data } = useAdminUsers();

  return (
    <AdminTable
      columns={columns}
      data={data.users}
      getRowKey={(user) => user.id}
      emptyText="No users yet."
      defaultSort={{ column: "Joined", direction: "desc" }}
      toolbar={
        <p className="text-muted-foreground text-sm">
          {data.users.length} registered {data.users.length === 1 ? "user" : "users"}
        </p>
      }
    />
  );
}
