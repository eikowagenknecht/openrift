import { PodPairingsSection } from "@/components/pod-tournaments/pairings-section";
import { useTournamentRunState } from "@/hooks/use-tournaments";

// The pairing engine is unchanged from the pod tournaments feature and keyed by
// the same tournament id, so the existing pod pairings surface is reused directly.
export function TournamentPairingsTab({ id }: { id: string }) {
  const { data } = useTournamentRunState(id);
  return <PodPairingsSection id={id} data={data} />;
}
