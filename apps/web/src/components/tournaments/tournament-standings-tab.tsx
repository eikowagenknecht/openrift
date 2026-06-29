import { StandingsTable } from "@/components/pod-tournaments/standings-table";
import { useTournamentRunState } from "@/hooks/use-tournaments";

// Standings come from the same pod engine, reused via the shared id.
export function TournamentStandingsTab({ id }: { id: string }) {
  const { data } = useTournamentRunState(id);
  return <StandingsTable standings={data.standings} />;
}
