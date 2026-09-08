import { PodPairingsSection } from "@/features/tournaments/components/pairings-section";
import { useTournamentRunState } from "@/features/tournaments/hooks/use-tournament-run";
import { useRegionLabel } from "@/hooks/use-region-label";

export function TournamentPairingsTab({ id }: { id: string }) {
  const { data } = useTournamentRunState(id);
  const regionLabel = useRegionLabel();
  return <PodPairingsSection id={id} data={data} regionLabel={regionLabel} />;
}
