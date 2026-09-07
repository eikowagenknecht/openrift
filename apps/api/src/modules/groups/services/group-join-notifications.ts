import { isGroupApprovalEmailEnabled } from "@openrift/shared/types/api/preferences";

import type { Repos } from "../../../deps.js";
import {
  buildGroupApprovedEmail,
  buildGroupJoinRequestEmail,
} from "../../../emails/group-emails.js";
import { buildUnsubscribeUrls } from "../../../emails/unsubscribe-token.js";
import type { TradeEmailDeps } from "./trade-notifications.js";

export interface GroupJoinRequest {
  groupId: string;
  groupSlug: string;
  groupName: string;
  requesterUserId: string;
}

function membersUrl(appBaseUrl: string, groupSlug: string): string {
  return `${appBaseUrl}/groups/${encodeURIComponent(groupSlug)}/members`;
}

function groupUrl(appBaseUrl: string, groupSlug: string): string {
  return `${appBaseUrl}/groups/${encodeURIComponent(groupSlug)}`;
}

function manageUrl(appBaseUrl: string, groupSlug: string): string {
  return `${appBaseUrl}/groups/${encodeURIComponent(groupSlug)}/manage`;
}

/**
 * Never throws. The caller invokes it after the invite row has committed and
 * outside any transaction, so a mail failure can never roll back or 500 the request.
 */
export async function notifyAdminsOfGroupJoinRequest(
  repos: Repos,
  request: GroupJoinRequest,
  deps?: TradeEmailDeps,
): Promise<void> {
  if (deps === undefined) {
    return;
  }

  try {
    const recipients = await repos.userPreferences.listGroupJoinRequestRecipients(request.groupId);
    if (recipients.length === 0) {
      return;
    }

    const requester = await repos.users.findById(request.requesterUserId);
    const url = membersUrl(deps.appBaseUrl, request.groupSlug);

    for (const recipient of recipients) {
      const { pageUrl, oneClickUrl } = buildUnsubscribeUrls(
        deps.appBaseUrl,
        deps.unsubscribeSecret,
        recipient.userId,
        "groupJoinRequests",
      );
      const { subject, html } = buildGroupJoinRequestEmail({
        recipientName: recipient.name,
        requesterName: requester?.name ?? null,
        groupName: request.groupName,
        membersUrl: url,
        unsubscribeUrl: pageUrl,
      });

      // Sent individually so admins don't see each other's addresses.
      try {
        await deps.sendEmail({
          to: recipient.email,
          subject,
          html,
          listUnsubscribeUrl: oneClickUrl,
        });
      } catch (error) {
        deps.log.error(
          { err: error, recipientUserId: recipient.userId },
          "Failed to send group join-request email",
        );
      }
    }
  } catch (error) {
    deps.log.error(
      { err: error, groupId: request.groupId },
      "Failed to notify admins of a group join request",
    );
  }
}

export interface GroupApproval {
  groupId: string;
  groupSlug: string;
  groupName: string;
  memberUserId: string;
}

/**
 * Same contract as {@link notifyAdminsOfGroupJoinRequest}: never throws, and
 * the caller invokes it after the membership has committed and outside the transaction.
 */
export async function notifyMemberOfGroupApproval(
  repos: Repos,
  approval: GroupApproval,
  deps?: TradeEmailDeps,
): Promise<void> {
  if (deps === undefined) {
    return;
  }

  try {
    const context = await repos.userPreferences.getEmailNotificationContext(approval.memberUserId);
    if (context === undefined || !context.emailVerified) {
      return;
    }
    if (!isGroupApprovalEmailEnabled(context.emailNotifications)) {
      return;
    }

    const { pageUrl, oneClickUrl } = buildUnsubscribeUrls(
      deps.appBaseUrl,
      deps.unsubscribeSecret,
      approval.memberUserId,
      "groupApprovals",
    );
    const { subject, html } = buildGroupApprovedEmail({
      recipientName: context.name,
      groupName: approval.groupName,
      groupUrl: groupUrl(deps.appBaseUrl, approval.groupSlug),
      manageUrl: manageUrl(deps.appBaseUrl, approval.groupSlug),
      unsubscribeUrl: pageUrl,
    });

    await deps.sendEmail({
      to: context.email,
      subject,
      html,
      listUnsubscribeUrl: oneClickUrl,
    });
  } catch (error) {
    deps.log.error(
      { err: error, groupId: approval.groupId, memberUserId: approval.memberUserId },
      "Failed to send a group approval email",
    );
  }
}
