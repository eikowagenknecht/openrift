import type { collectionGroupSharesResponseSchema } from "@openrift/shared/contracts/collections";
import type {
  friendGroupActivityEventSchema,
  friendGroupActivityResponseSchema,
  friendGroupBoxWantRowSchema,
  friendGroupBoxWantsResponseSchema,
  friendGroupCollectionCoverSchema,
  friendGroupCollectionShareResponseSchema,
  friendGroupDetailResponseSchema,
  friendGroupDiscordLinkCodeResponseSchema,
  friendGroupDiscordLinkResponseSchema,
  friendGroupDiscordLinksResponseSchema,
  friendGroupInviteDirectionSchema,
  friendGroupJoinPreviewResponseSchema,
  friendGroupListResponseSchema,
  friendGroupMatchesResponseSchema,
  friendGroupMatchRowSchema,
  friendGroupMemberDetailResponseSchema,
  friendGroupMemberPreviewSchema,
  friendGroupMemberResponseSchema,
  friendGroupPendingInvitesCountResponseSchema,
  friendGroupPendingRequestsCountResponseSchema,
  friendGroupRequestResponseSchema,
  friendGroupResponseSchema,
  friendGroupRoleSchema,
  friendGroupShareableCollectionResponseSchema,
  friendGroupShareableCollectionsResponseSchema,
  friendGroupShareableListResponseSchema,
  friendGroupShareableListsResponseSchema,
  friendGroupShareResponseSchema,
  friendGroupSharedCollectionDetailResponseSchema,
  friendGroupSharedListDetailResponseSchema,
  friendGroupSummaryResponseSchema,
} from "@openrift/shared/contracts/friend-groups";
import type { listGroupSharesResponseSchema } from "@openrift/shared/contracts/lists";
import type { z } from "zod";

// ADR-033 retired the `judge` role: judging now lives in tournament_staff.
export type FriendGroupRole = z.infer<typeof friendGroupRoleSchema>;
export type FriendGroupInviteDirection = z.infer<typeof friendGroupInviteDirectionSchema>;

export type FriendGroupResponse = z.infer<typeof friendGroupResponseSchema>;

export type FriendGroupSummaryResponse = z.infer<typeof friendGroupSummaryResponseSchema>;

export type FriendGroupMemberPreview = z.infer<typeof friendGroupMemberPreviewSchema>;

export type FriendGroupPendingInviteResponse = z.infer<
  typeof friendGroupListResponseSchema
>["pendingInvites"][number];

export type FriendGroupListResponse = z.infer<typeof friendGroupListResponseSchema>;

export type FriendGroupMemberResponse = z.infer<typeof friendGroupMemberResponseSchema>;

export type FriendGroupShareResponse = z.infer<typeof friendGroupShareResponseSchema>;

export type FriendGroupCollectionCover = z.infer<typeof friendGroupCollectionCoverSchema>;

export type FriendGroupCollectionShareResponse = z.infer<
  typeof friendGroupCollectionShareResponseSchema
>;

export type FriendGroupRequestResponse = z.infer<typeof friendGroupRequestResponseSchema>;

export type FriendGroupViewerStatus = "member" | "pending";

export type FriendGroupDetailResponse = z.infer<typeof friendGroupDetailResponseSchema>;

export type FriendGroupJoinViewerStatus = "available" | "pending" | "member";

export type FriendGroupJoinPreviewResponse = z.infer<typeof friendGroupJoinPreviewResponseSchema>;

export type FriendGroupShareableListResponse = z.infer<
  typeof friendGroupShareableListResponseSchema
>;

export type FriendGroupShareableListsResponse = z.infer<
  typeof friendGroupShareableListsResponseSchema
>;

export type FriendGroupShareableCollectionResponse = z.infer<
  typeof friendGroupShareableCollectionResponseSchema
>;

export type FriendGroupShareableCollectionsResponse = z.infer<
  typeof friendGroupShareableCollectionsResponseSchema
>;

export type FriendGroupMatchRow = z.infer<typeof friendGroupMatchRowSchema>;

export type FriendGroupMatchesResponse = z.infer<typeof friendGroupMatchesResponseSchema>;

export type FriendGroupBoxWantRow = z.infer<typeof friendGroupBoxWantRowSchema>;

export type FriendGroupBoxWantsResponse = z.infer<typeof friendGroupBoxWantsResponseSchema>;

export type FriendGroupMemberDetailResponse = z.infer<typeof friendGroupMemberDetailResponseSchema>;

export type FriendGroupDiscordLinkResponse = z.infer<typeof friendGroupDiscordLinkResponseSchema>;

export type FriendGroupDiscordLinksResponse = z.infer<typeof friendGroupDiscordLinksResponseSchema>;

export type FriendGroupDiscordLinkCodeResponse = z.infer<
  typeof friendGroupDiscordLinkCodeResponseSchema
>;

/**
 * One entry in a group's activity feed. A discriminated union over `kind`;
 * `at` is the ISO timestamp the feed sorts by (newest first).
 *
 * Card-bearing kinds (`trade-completed`, `match`) carry only `printingId` /
 * `cardId` — the client resolves the card name and image from its loaded
 * catalogue, the same way the trades and matches lists do.
 *
 * `match` is the one approximate kind: matches aren't stored, so `at` is the
 * latest of the timestamps that made the match possible (when both lists were
 * shared and both entries / the copy were created). It surfaces the viewer's
 * *incoming* matches only ("others now have something you want").
 */
export type FriendGroupActivityEvent = z.infer<typeof friendGroupActivityEventSchema>;

export type FriendGroupActivityResponse = z.infer<typeof friendGroupActivityResponseSchema>;

export type FriendGroupPendingInvitesCountResponse = z.infer<
  typeof friendGroupPendingInvitesCountResponseSchema
>;

export type FriendGroupPendingRequestsCountResponse = z.infer<
  typeof friendGroupPendingRequestsCountResponseSchema
>;

export type ListGroupSharesResponse = z.infer<typeof listGroupSharesResponseSchema>;

export type CollectionGroupSharesResponse = z.infer<typeof collectionGroupSharesResponseSchema>;

export type FriendGroupSharedListDetailResponse = z.infer<
  typeof friendGroupSharedListDetailResponseSchema
>;

export type FriendGroupSharedCollectionDetailResponse = z.infer<
  typeof friendGroupSharedCollectionDetailResponseSchema
>;
