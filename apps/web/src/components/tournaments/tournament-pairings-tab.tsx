import { PodPairingsSection } from "@/components/pod-tournaments/pairings-section";
import { useRegionLabel } from "@/hooks/use-region-label";
import { useTournamentRunState } from "@/hooks/use-tournaments";

export function TournamentPairingsTab({ id }: { id: string }) {
  const { data } = useTournamentRunState(id);
  const regionLabel = useRegionLabel();
  return <PodPairingsSection id={id} data={data} regionLabel={regionLabel} />;
}
