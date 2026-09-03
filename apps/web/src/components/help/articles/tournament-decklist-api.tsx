import { Heading } from "@/components/heading";
import { Code } from "@/components/ui/code";
import { SOCIAL_LINKS } from "@/lib/social-links";

const EXAMPLE_REQUEST = `POST /api/v1/ingest/deck-check
Authorization: Bearer orpk_your-key-here
Content-Type: application/json

{
  "tournamentId": "019eb565-3d55-7d21-8d86-e9b6939a2c2f",
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

const EXAMPLE_RESPONSE = `{
  "tournamentId": "019eb565-3d55-7d21-8d86-e9b6939a2c2f",
  "entriesCreated": 1,
  "entriesUpdated": 0,
  "entriesUnchanged": 0,
  "entriesWithdrawn": 0,
  "checksInvalidated": 0,
  "entries": [
    {
      "externalId": "1234",
      "entryId": "019eb565-4a01-7c3b-9f12-c2d80f5a1e77",
      "claimUrl": "https://…/tournaments/claim/8f3c2a…"
    }
  ]
}`;

const ERROR_ROWS = [
  ["400", "The body is not valid JSON or doesn't match the payload shape."],
  ["401", "The API key is missing, unknown, or revoked."],
  [
    "404",
    "No tournament with that id belongs to the key's host, or the tournament has deck submission turned off.",
  ],
  ["409", "The tournament is archived. Un-archive it before pushing."],
  ["413", "The body is larger than 1 MB."],
  [
    "422",
    "A card uses an unknown section, or an external id starts with the reserved “openrift:” prefix. Nothing from the push is imported.",
  ],
  ["429", "More than 60 pushes in a minute with this key. Wait and retry."],
] as const;

export default function TournamentDecklistApiArticle() {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        If players register for your tournament on your own website or in your own tool, OpenRift
        can receive their decklists over an API. Judges then check the physical decks against the
        submitted lists on the tournament&apos;s{" "}
        <strong className="text-foreground">Deck check</strong> tab, with full card images, and
        every player gets a personal link to view their own submitted deck. This article is for
        organizers and the developers wiring a registration system up.
      </p>

      <section>
        <Heading className="mb-2">How it fits together</Heading>
        <ol className="text-muted-foreground list-inside list-decimal space-y-2">
          <li>
            <strong className="text-foreground">Create the tournament in OpenRift</strong> with deck
            submission enabled. The API can never create tournaments, it only fills existing ones
            with decklists.
          </li>
          <li>
            <strong className="text-foreground">Create an API key</strong> for whoever hosts the
            tournament: you, or your organization.
          </li>
          <li>
            <strong className="text-foreground">Push entries</strong> from your system, one at a
            time as registrations arrive or the whole field at once. Both work the same way.
          </li>
          <li>
            <strong className="text-foreground">Judges check decks</strong> on the tournament&apos;s
            Deck check tab as usual.
          </li>
          <li>
            <strong className="text-foreground">Players claim their deck</strong> through the claim
            link the API returns for each entry, typically forwarded in your confirmation email.
          </li>
        </ol>
        <p className="text-muted-foreground mt-3">
          The tournament&apos;s Deck check tab shows this same guide pre-filled with the real
          tournament id, ready to copy into your integration.
        </p>
      </section>

      <section>
        <Heading className="mb-2">API keys</Heading>
        <p className="text-muted-foreground">
          Personal keys are managed under <strong className="text-foreground">API keys</strong> on
          your{" "}
          <a href="/profile" className="text-primary hover:underline">
            profile
          </a>
          . For a tournament hosted by an organization, keys live on the organization&apos;s page
          instead and can be managed by its owners and managers. A push must use a key that belongs
          to the tournament&apos;s host: a personal key cannot push into an organization&apos;s
          tournament, and the other way around.
        </p>
        <p className="text-muted-foreground mt-2">
          A key looks like <Code>orpk_…</Code> and is shown once, right when it is created. Store it
          like a password: it lets its holder send decklists to every tournament of your account or
          organization. You can rename keys, see when each was last used, and revoke one at any
          time. A revoked key stops working immediately.
        </p>
      </section>

      <section>
        <Heading className="mb-2">Pushing decklists</Heading>
        <p className="text-muted-foreground">
          Send a <Code>POST</Code> to <Code>/api/v1/ingest/deck-check</Code> on this site, with your
          key in the <Code>Authorization</Code> header and a JSON body:
        </p>
        <pre className="bg-muted mt-3 overflow-x-auto rounded-md p-3 text-sm">
          {EXAMPLE_REQUEST}
        </pre>
        <ul className="text-muted-foreground mt-3 space-y-2">
          <li>
            <Code>tournamentId</Code> — the tournament&apos;s id, copied from its Deck check tab.
          </li>
          <li>
            <Code>externalId</Code> — your own id for the player. Pushing the same id again updates
            that entry instead of creating a new one. Ids starting with <Code>openrift:</Code> are
            reserved for decks players submit themselves and are rejected.
          </li>
          <li>
            <Code>playerName</Code> — shown to judges next to the entry. <Code>riotId</Code> and{" "}
            <Code>submittedAt</Code> are optional and also shown to judges.
          </li>
          <li>
            <Code>allowDeckPublishing</Code>, <Code>allowNameSharing</Code>,{" "}
            <Code>allowRiotIdSharing</Code> — the player&apos;s consent to publish their deck, name,
            and Riot ID after the event. Send <Code>false</Code> when a player declined; omit a flag
            to keep what is already stored (new entries default to allowed).
          </li>
          <li>
            <Code>withdrawn</Code> — set <Code>true</Code> to withdraw a player. Pushing the entry
            again without the flag restores them.
          </li>
          <li>
            <Code>cards</Code> — one line per card with its English name as printed, the quantity,
            and the deck section.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3">
          Sections map onto OpenRift&apos;s deck zones: <Code>legend</Code>, <Code>champion</Code>,{" "}
          <Code>main</Code>, <Code>runes</Code>, <Code>battlefield</Code>, <Code>sideboard</Code>,
          and <Code>overflow</Code>. Common variants like <Code>deck</Code>, <Code>maindeck</Code>,{" "}
          <Code>side</Code>, and plurals work too; any other section rejects the whole push, so
          nothing is half-imported. Card names don&apos;t have to resolve, though: a misspelled or
          unknown name never blocks a push, the line is flagged and judges see the raw name exactly
          as you sent it.
        </p>
      </section>

      <section>
        <Heading className="mb-2">What a push changes</Heading>
        <p className="text-muted-foreground">
          Pushes are partial: only the entries you send are touched, and leaving a player out of a
          push never withdraws them. Withdrawing is always the explicit <Code>withdrawn</Code> flag.
          That makes pushes safe to repeat: re-sending an unchanged entry does nothing, so you can
          push on every registration event without bookkeeping.
        </p>
        <p className="text-muted-foreground mt-2">
          When a re-pushed entry&apos;s card list actually changed, the stored deck is replaced. If
          a judge had already checked that deck, the check is reset and the judge sees exactly which
          cards were added, removed, or changed, so a stale check can never pass a changed deck.
          Your system stays the source of truth for the list: a push also replaces any edits the
          player made in OpenRift in the meantime.
        </p>
      </section>

      <section>
        <Heading className="mb-2">The response and claim links</Heading>
        <p className="text-muted-foreground">
          A successful push returns counts of what happened plus one result per entry, keyed by your
          own <Code>externalId</Code>:
        </p>
        <pre className="bg-muted mt-3 overflow-x-auto rounded-md p-3 text-sm">
          {EXAMPLE_RESPONSE}
        </pre>
        <p className="text-muted-foreground mt-3">
          <Code>entryId</Code> is the stable OpenRift id for the entry. <Code>claimUrl</Code> is a
          personal link for that player: put it in your confirmation email. A player who opens it
          signs in (or creates an account), confirms, and from then on sees their own submitted deck
          in OpenRift, and only their own. Nothing about the deck or the player is visible before
          the claim is confirmed, and OpenRift never needs the player&apos;s email address for this.
        </p>
        <p className="text-muted-foreground mt-2">
          The link is stable: re-pushing the same entry returns the same URL, so it is safe to
          re-send in a follow-up email. If a link ever reaches the wrong person, a judge can unlink
          the entry, which also blocks it from being claimed again.
        </p>
      </section>

      <section>
        <Heading className="mb-2">Limits and errors</Heading>
        <p className="text-muted-foreground">
          A push carries at most 500 entries with up to 200 card lines each, the body is capped at 1
          MB, and each key may push 60 times per minute (responses include standard{" "}
          <Code>RateLimit</Code> headers). Larger fields simply split across several pushes.
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg border text-sm">
          <table className="w-full">
            <thead>
              <tr className="border-border border-b">
                <th className="bg-muted/50 px-3 py-2 text-left text-xs font-medium">Status</th>
                <th className="bg-muted/50 px-3 py-2 text-left text-xs font-medium">Meaning</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {ERROR_ROWS.map(([status, meaning]) => (
                <tr key={status}>
                  <td className="px-3 py-1.5 align-top font-mono text-xs">{status}</td>
                  <td className="text-muted-foreground px-3 py-1.5">{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground mt-3">
          Failed pushes import nothing, so it is always safe to fix the problem and send the same
          push again.
        </p>
      </section>

      <section>
        <Heading className="mb-2">Reference and support</Heading>
        <p className="text-muted-foreground">
          The full request and response schemas are part of the{" "}
          <a href="/api/doc" className="text-primary hover:underline">
            OpenAPI specification
          </a>
          , browsable in{" "}
          <a href="/api/ui" className="text-primary hover:underline">
            Swagger UI
          </a>
          . Building an integration and something is missing or unclear? Let me know on{" "}
          <a
            href={SOCIAL_LINKS.discordInvite}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            Discord
          </a>{" "}
          or{" "}
          <a
            href={SOCIAL_LINKS.githubIssues}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            GitHub
          </a>{" "}
          and I&apos;ll do my best to help.
        </p>
      </section>
    </div>
  );
}
