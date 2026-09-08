import { BookOpenIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useFriendGroupShareableCollections,
  useShareCollectionWithFriendGroup,
  useUnshareCollectionFromFriendGroup,
} from "@/features/groups/hooks/use-friend-group-sharing";

export function ShareableCollectionsPanel({ slug }: { slug: string }) {
  const { data } = useFriendGroupShareableCollections(slug);
  const share = useShareCollectionWithFriendGroup();
  const unshare = useUnshareCollectionFromFriendGroup();

  if (data.items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Share your collections</CardTitle>
          <CardDescription>
            You don&apos;t have any personal collections yet. Create one to share it with this
            group.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Share your collections</CardTitle>
        <CardDescription>Visible (read-only) to everyone in this group.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {data.items.map((row) => {
          const isShared = row.sharedAt !== null;
          return (
            <div key={row.collectionId} className="flex items-center gap-3">
              <Checkbox
                checked={isShared}
                onCheckedChange={(checked) => {
                  if (checked) {
                    share.mutate({ slug, collectionId: row.collectionId });
                  } else {
                    unshare.mutate({ slug, collectionId: row.collectionId });
                  }
                }}
                disabled={share.isPending || unshare.isPending}
              />
              <div className="flex items-center gap-2">
                <BookOpenIcon className="size-4" />
                <span className="font-medium">{row.collectionName}</span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
