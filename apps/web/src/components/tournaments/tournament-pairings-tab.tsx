import { PodPairingsSection } from "@/components/pod-tournaments/pairings-section";
import { useRegionLabel } from "@/hooks/use-region-label";
import { useTournamentRunState } from "@/hooks/use-tournaments";

// The pairing engine is unchanged from the pod tournaments feature and keyed by
// the same tournament id, so the existing pod pairings surface is reused directly.
export function TournamentPairingsTab({ id }: { id: string }) {
  const { data } = useTournamentRunState(id);
  const regionLabel = useRegionLabel();
  return <PodPairingsSection id={id} data={data} regionLabel={regionLabel} />;
}
