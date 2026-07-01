import type {
  DeckMatchupSwapResponse,
  DeckPlanCardMetaResponse,
  DeckPlanResponse,
} from "@openrift/shared";
import { imageUrl, WellKnown } from "@openrift/shared";

// Read-only render of a deck's plan (ADR-029) for the public share page. Purely
// presentational: it takes the plan plus a denormalized card-meta lookup so it
// works for anonymous viewers without catalog access.

export type CardMetaLookup = (cardId: string) => DeckPlanCardMetaResponse | undefined;

function CardLine({
  cardId,
  lookup,
  quantity,
}: {
  cardId: string;
  lookup: CardMetaLookup;
  quantity?: number;
}) {
  const meta = lookup(cardId);
  const landscape = meta?.cardType === WellKnown.cardType.BATTLEFIELD;
  return (
    <span className="inline-flex items-center gap-2">
      {meta?.imageId ? (
        <img
          src={imageUrl(meta.imageId, "400w")}
          alt=""
          className={
            landscape ? "h-6 w-9 rounded-xs object-cover" : "h-8 w-6 rounded-xs object-cover"
          }
        />
      ) : null}
      <span className="truncate">
        {quantity === undefined ? null : (
          <span className="text-muted-foreground">{quantity}× </span>
        )}
        {meta?.cardName ?? "Unknown card"}
      </span>
    </span>
  );
}

function SwapColumn({
  label,
  tone,
  sign,
  swaps,
  lookup,
}: {
  label: string;
  tone: string;
  sign: string;
  swaps: DeckMatchupSwapResponse[];
  lookup: CardMetaLookup;
}) {
  return (
    <div className="flex-1 space-y-1.5">
      <div className={`text-2xs font-semibold tracking-wide uppercase ${tone}`}>
        {sign} {label}
      </div>
      {swaps.length === 0 ? (
        <div className="text-muted-foreground text-sm">No changes</div>
      ) : (
        swaps.map((swap) => (
          <div key={swap.cardId}>
            <CardLine cardId={swap.cardId} lookup={lookup} quantity={swap.quantity} />
          </div>
        ))
      )}
    </div>
  );
}

export function DeckPlanView({
  plan,
  planCardMeta,
  hideHeading,
}: {
  plan: DeckPlanResponse;
  planCardMeta: DeckPlanCardMetaResponse[];
  /** Suppress the built-in "Deck plan" heading when the host supplies its own (e.g. a collapsible trigger). */
  hideHeading?: boolean;
}) {
  const metaById = new Map(planCardMeta.map((meta) => [meta.cardId, meta]));
  const lookup: CardMetaLookup = (cardId) => metaById.get(cardId);

  const battlefields = [
    { label: "Game 1", cardId: plan.battlefieldGame1CardId },
    { label: "Going first", cardId: plan.battlefieldFirstCardId },
    { label: "Going second", cardId: plan.battlefieldSecondCardId },
  ].flatMap((entry) =>
    entry.cardId === null ? [] : [{ label: entry.label, cardId: entry.cardId }],
  );

  const hasMulligan = plan.mulliganSplit
    ? plan.mulliganFirst !== "" || plan.mulliganSecond !== ""
    : plan.mulliganGeneral !== "";

  const hasBattlefields = plan.battlefieldCustom
    ? plan.battlefieldNote !== ""
    : battlefields.length > 0;

  return (
    <section className="space-y-5">
      {!hideHeading && <h2 className="text-lg font-semibold">Deck plan</h2>}

      {plan.generalStrategy !== "" && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Strategy</h3>
          <p className="text-muted-foreground max-w-prose whitespace-pre-wrap">
            {plan.generalStrategy}
          </p>
        </div>
      )}

      {hasMulligan ? (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Mulligan priority</h3>
          {plan.mulliganSplit ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-muted-foreground text-xs">Going first</div>
                <p className="whitespace-pre-wrap">{plan.mulliganFirst || "—"}</p>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Going second</div>
                <p className="whitespace-pre-wrap">{plan.mulliganSecond || "—"}</p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground max-w-prose whitespace-pre-wrap">
              {plan.mulliganGeneral}
            </p>
          )}
        </div>
      ) : null}

      {hasBattlefields ? (
        <div className="space-y-1.5">
          <h3 className="text-sm font-medium">Battlefields</h3>
          {plan.battlefieldCustom ? (
            <p className="text-muted-foreground max-w-prose whitespace-pre-wrap">
              {plan.battlefieldNote}
            </p>
          ) : (
            <div className="flex flex-wrap gap-4">
              {battlefields.map((entry) => (
                <div key={entry.label} className="space-y-0.5">
                  <div className="text-muted-foreground text-xs">{entry.label}</div>
                  <CardLine cardId={entry.cardId} lookup={lookup} />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {plan.matchups.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Matchups</h3>
          <div className="grid gap-3 @2xl:grid-cols-2">
            {plan.matchups.map((matchup) => {
              const outSwaps = matchup.swaps.filter((swap) => swap.direction === "out");
              const inSwaps = matchup.swaps.filter((swap) => swap.direction === "in");
              return (
                <div key={matchup.id} className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    {matchup.opponentCardId === null ? (
                      <span className="truncate font-medium">{matchup.opponentLabel}</span>
                    ) : (
                      <>
                        <CardLine cardId={matchup.opponentCardId} lookup={lookup} />
                        {matchup.opponentLabel !== "" && (
                          <span className="text-muted-foreground truncate">
                            {matchup.opponentLabel}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex flex-col gap-4 sm:flex-row">
                    <SwapColumn
                      label="Out"
                      tone="text-destructive"
                      sign="−"
                      swaps={outSwaps}
                      lookup={lookup}
                    />
                    <SwapColumn
                      label="In"
                      tone="text-green-600 dark:text-green-400"
                      sign="+"
                      swaps={inSwaps}
                      lookup={lookup}
                    />
                  </div>
                  {matchup.notes !== "" && (
                    <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                      {matchup.notes}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
