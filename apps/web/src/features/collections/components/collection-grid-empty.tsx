import { Link } from "@tanstack/react-router";
import {
  CameraIcon,
  DownloadIcon,
  LibraryBigIcon,
  PackageIcon,
  SquarePlusIcon,
} from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { useCommandPaletteStore } from "@/stores/command-palette-store";

interface CollectionGridEmptyProps {
  collectionName: string | undefined;
  inboxName: string | undefined;
  addTarget: string | undefined;
  onBrowseLibrary: () => void;
}

export function CollectionGridEmpty({
  collectionName,
  inboxName,
  addTarget,
  onBrowseLibrary,
}: CollectionGridEmptyProps) {
  return (
    <EmptyState
      className="flex-1"
      icon={PackageIcon}
      title="No cards yet"
      description={
        <>
          Browse the card catalog and add cards to{" "}
          {collectionName
            ? `"${collectionName}"`
            : inboxName
              ? `"${inboxName}"`
              : "your collection"}
          .{" "}
          <Link to="/help/$slug" params={{ slug: "cards-printings-copies" }}>
            Learn about cards, printings &amp; copies
          </Link>
        </>
      }
    >
      <div className="flex flex-wrap justify-center gap-2">
        {addTarget && (
          <>
            <Button onClick={onBrowseLibrary}>
              <LibraryBigIcon />
              Browse & add
            </Button>
            <Link to="/scan" className={buttonVariants({ variant: "ghost" })}>
              <CameraIcon />
              Scan cards
            </Link>
            <Button
              variant="ghost"
              onClick={() => useCommandPaletteStore.getState().openQuickAdd("add")}
            >
              <SquarePlusIcon />
              Quick add
            </Button>
          </>
        )}
        <Link to="/collections/import" className={buttonVariants({ variant: "ghost" })}>
          <DownloadIcon />
          Import from another tool
        </Link>
      </div>
    </EmptyState>
  );
}
