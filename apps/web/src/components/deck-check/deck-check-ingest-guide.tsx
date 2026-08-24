import type { TournamentHostInfo } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { getSiteUrl } from "@/lib/site-config";

/**
 * Example request body, pre-filled with this tournament's id so the organizer
 * can copy it straight into their integration.
 * @returns The example JSON request payload.
 */
function buildExamplePayload(tournamentId: string): string {
  return `{
  "tournamentId": "${tournamentId}",
  "entries": [
    {
      "externalId": "1234",
      "playerName": "A. Player",
      "riotId": "Player#EUW",
      "submittedAt": "2026-06-18T20:00:00Z",
      "allowDeckPublishing": true,
      "allowNameSharing": true,
      "allowRiotIdSharing": true,
      "withdrawn": false,
      "cards": [
        { "name": "Darius, Trifarian", "quantity": 1, "section": "champion" },
        { "name": "Blazing Scorcher", "quantity": 3, "section": "main" }
      ]
    }
  ]
}`;
}

/**
 * Example success response.
 * @returns The example JSON response body.
 */
function buildExampleResponse(tournamentId: string): string {
  return `{
  "tournamentId": "${tournamentId}",
  "entriesCreated": 1,
  "entriesUpdated": 0,
  "entriesUnchanged": 0,
  "entriesWithdrawn": 0,
  "checksInvalidated": 0,
  "entries": [
    {
      "externalId": "1234",
      "entryId": "019eb565-3d55-7d21-8d86-e9b6939a2c2f",
      "claimUrl": "${getSiteUrl()}/tournaments/claim/8f3c2a…"
    }
  ]
}`;
}

/**
 * Organizer-facing guide for pushing entrant decklists into this tournament over
 * the deck-check ingest API. Lives on the tournament's Deck check tab so the
 * example carries the real tournament id. A push must use a key whose host
 * matches the tournament's host, so the guide links to the right place to manage
 * them: the organization's page for org-run events, or your profile otherwise.
 * @returns The collapsible API ingest guide.
 */
export function DeckCheckIngestGuide({
  tournamentId,
  host,
}: {
  tournamentId: string;
  host: TournamentHostInfo;
}) {
  const keysLink =
    host.type === "organization" && host.orgId ? (
      <Link to="/organizations/$id" params={{ id: host.orgId }} className="font-medium underline">
        {host.displayName}&apos;s page
      </Link>
    ) : (
      <Link to="/profile" hash="integrations" className="font-medium underline">
        your profile
      </Link>
    );

  return (
    <details className="bg-card rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Push decklists with an API key
      </summary>
      <div className="mt-3 flex flex-col gap-4 text-sm">
        <div className="flex flex-col gap-1">
          <p>
            An API key lets another site or tool send entrant decklists into this tournament. Manage
            keys on {keysLink}.
          </p>
          <p className="text-muted-foreground">
            A push must use a key that belongs to the tournament&apos;s host:{" "}
            {host.type === "organization"
              ? "use one of the organization's keys, not a personal one."
              : "use one of your personal keys."}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="font-semibold">Request</p>
          <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-5">
            <li>
              <span className="text-foreground">POST</span>{" "}
              <code className="break-all">{getSiteUrl()}/api/v1/ingest/deck-check</code>
            </li>
            <li>
              Header <code>Authorization: Bearer &lt;your key&gt;</code>
            </li>
            <li>
              JSON body with this tournament&apos;s <code>tournamentId</code> (
              <code className="break-all">{tournamentId}</code>) and an <code>entries</code> array
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="font-semibold">Example request body</p>
          <pre className="bg-muted overflow-x-auto rounded-md p-3">
            {buildExamplePayload(tournamentId)}
          </pre>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="font-semibold">Entry fields</p>
          <ul className="flex flex-col gap-2">
            <li>
              <code>externalId</code>{" "}
              <span className="text-muted-foreground">
                Your own id for the player; send it again to update the same entry.
              </span>
            </li>
            <li>
              <code>playerName</code>{" "}
              <span className="text-muted-foreground">Shown to judges next to the entry.</span>
            </li>
            <li>
              <code>riotId</code>, <code>submittedAt</code>{" "}
              <span className="text-muted-foreground">
                Optional, shown to judges. Players link the entry to their OpenRift account
                themselves through its <code>claimUrl</code>.
              </span>
            </li>
            <li>
              <code>allowDeckPublishing</code>, <code>allowNameSharing</code>,{" "}
              <code>allowRiotIdSharing</code>{" "}
              <span className="text-muted-foreground">
                Consent to publish the deck, the player&apos;s name, and their Riot ID after the
                event. Send <code>false</code> when declined. Omit to keep what&apos;s stored (new
                entries default to allowed).
              </span>
            </li>
            <li>
              <code>withdrawn</code>{" "}
              <span className="text-muted-foreground">
                Set <code>true</code> to withdraw a player. Sending the entry again without it
                restores them.
              </span>
            </li>
            <li>
              <code>cards[].section</code>{" "}
              <span className="text-muted-foreground">The card&apos;s zone (see below).</span>
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="font-semibold">Card sections</p>
          <p className="text-muted-foreground">
            <code>legend</code>, <code>champion</code>, <code>main</code>, <code>runes</code>,{" "}
            <code>battlefield</code>, <code>sideboard</code>, <code>overflow</code>. Common variants
            (<code>deck</code>, <code>maindeck</code>, <code>side</code>, plurals) work too;
            anything else rejects the push.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="font-semibold">Response</p>
          <p className="text-muted-foreground">
            A successful push returns <code>200</code> with result counts (
            <code>entriesCreated</code>, <code>entriesUpdated</code>, <code>entriesUnchanged</code>,{" "}
            <code>entriesWithdrawn</code>, <code>checksInvalidated</code>) and an{" "}
            <code>entries</code> array keyed by your <code>externalId</code>.
          </p>
          <pre className="bg-muted overflow-x-auto rounded-md p-3">
            {buildExampleResponse(tournamentId)}
          </pre>
          <p className="text-muted-foreground">
            Put each <code>claimUrl</code> in your confirmation email: opening it and signing in
            links the entry to the player&apos;s OpenRift account, even if you never shared their
            email.
          </p>
        </div>
      </div>
    </details>
  );
}
