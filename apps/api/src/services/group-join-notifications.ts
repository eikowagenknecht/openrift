import type { Repos } from "../deps.js";
import { buildGroupJoinRequestEmail } from "../emails/group-emails.js";
import { buildUnsubscribeUrls } from "../emails/unsubscribe-token.js";
import type { TradeEmailDeps } from "./trade-notifications.js";

/** What the route knows about a join request that was just written. */
export interface GroupJoinRequest {
  groupId: string;
  groupSlug: string;
  groupName: string;
  /** Who asked to join — resolved to a name for the email body. */
  requesterUserId: string;
}

/**
 * The members tab, where the pending-requests band with its approve / deny
 * buttons lives, so the request is one click away.
 */
function membersUrl(appBaseUrl: string, groupSlug: string): string {
  return `${appBaseUrl}/groups/${encodeURIComponent(groupSlug)}/members`;
}

/**
 * Emails the group's owners and admins that someone asked to join.
 *
 * Opt-out per admin and default on: you become a group admin by creating the
 * group, and the request is addressed to you. The toggle lives in their
 * profile, and every send carries a one-click unsubscribe.
 *
 * Best-effort and side-effect-only: it never throws, and a failed send to one
 * admin does not stop the others. The caller invokes it after the invite row
 * has committed and outside any transaction, so a mail failure can never roll
 * back or 500 the request.
 */
export async function notifyAdminsOfGroupJoinRequest(
  repos: Repos,
  request: GroupJoinRequest,
  deps?: TradeEmailDeps,
): Promise<void> {
  // No SMTP wired (tests, an SMTP-less env): nothing to send.
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

      // One send per admin rather than a shared To: line, so admins never see
      // each other's addresses. A failure is logged and the loop continues.
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
