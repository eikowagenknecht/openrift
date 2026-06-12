import type { AdminUserResponse } from "@openrift/shared";

import { AdminTable } from "@/components/admin/admin-table";
import type { AdminCellSlotProps, AdminColumnDef } from "@/components/admin/admin-table";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { useAdminUsers } from "@/hooks/use-admin-users";
import { formatAbsoluteDate } from "@/lib/format-date";
import { useGravatarHash } from "@/lib/gravatar";

function formatDate(iso: string): string {
  return formatAbsoluteDate(iso, { year: "numeric", month: "short", day: "numeric" });
}

function UserNameCell({ row }: AdminCellSlotProps<AdminUserResponse>) {
  const gravatarHash = useGravatarHash(row?.email ?? "");
  if (!row) {
    return null;
  }
  return (
    <div className="flex items-center gap-2">
      <UserAvatar
        image={row.image}
        name={row.name}
        email={row.email}
        gravatarHash={gravatarHash}
        size="sm"
      />
      <span className="font-medium">{row.name ?? "—"}</span>
    </div>
  );
}

function EmailCell({ row }: AdminCellSlotProps<AdminUserResponse>) {
  if (!row) {
    return null;
  }
  return <span className="text-sm">{row.email}</span>;
}

function RoleCell({ row }: AdminCellSlotProps<AdminUserResponse>) {
  if (!row) {
    return null;
  }
  return row.isAdmin ? (
    <Badge variant="default">Admin</Badge>
  ) : (
    <Badge variant="secondary">User</Badge>
  );
}

function CardCountCell({ row }: AdminCellSlotProps<AdminUserResponse>) {
  if (!row) {
    return null;
  }
  return <span className="tabular-nums">{row.cardCount.toLocaleString()}</span>;
}

function DeckCountCell({ row }: AdminCellSlotProps<AdminUserResponse>) {
  if (!row) {
    return null;
  }
  return <span className="tabular-nums">{row.deckCount.toLocaleString()}</span>;
}

function CollectionCountCell({ row }: AdminCellSlotProps<AdminUserResponse>) {
  if (!row) {
    return null;
  }
  return <span className="tabular-nums">{row.collectionCount.toLocaleString()}</span>;
}

function ListCountCell({ row }: AdminCellSlotProps<AdminUserResponse>) {
  if (!row) {
    return null;
  }
  return <span className="tabular-nums">{row.listCount.toLocaleString()}</span>;
}

function JoinedCell({ row }: AdminCellSlotProps<AdminUserResponse>) {
  if (!row) {
    return null;
  }
  return <span className="text-muted-foreground text-sm">{formatDate(row.createdAt)}</span>;
}

function LastActiveCell({ row }: AdminCellSlotProps<AdminUserResponse>) {
  if (!row) {
    return null;
  }
  return (
    <span className="text-muted-foreground text-sm">
      {row.lastActiveAt ? formatDate(row.lastActiveAt) : "Never"}
    </span>
  );
}

const columns: AdminColumnDef<AdminUserResponse>[] = [
  {
    header: "Name",
    sortValue: (user) => user.name ?? "",
    cell: <UserNameCell />,
  },
  {
    header: "Email",
    sortValue: (user) => user.email,
    cell: <EmailCell />,
  },
  {
    header: "Role",
    align: "center",
    width: "w-24",
    cell: <RoleCell />,
  },
  {
    header: "Cards",
    align: "right",
    width: "w-20",
    sortValue: (user) => user.cardCount,
    cell: <CardCountCell />,
  },
  {
    header: "Decks",
    align: "right",
    width: "w-20",
    sortValue: (user) => user.deckCount,
    cell: <DeckCountCell />,
  },
  {
    header: "Collections",
    align: "right",
    width: "w-28",
    sortValue: (user) => user.collectionCount,
    cell: <CollectionCountCell />,
  },
  {
    header: "Lists",
    align: "right",
    width: "w-20",
    sortValue: (user) => user.listCount,
    cell: <ListCountCell />,
  },
  {
    header: "Joined",
    width: "w-32",
    sortValue: (user) => user.createdAt,
    cell: <JoinedCell />,
  },
  {
    header: "Last active",
    width: "w-32",
    sortValue: (user) => user.lastActiveAt ?? "",
    cell: <LastActiveCell />,
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
