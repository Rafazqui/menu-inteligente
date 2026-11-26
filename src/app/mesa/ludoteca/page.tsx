import { getTableContext } from "@/lib/auth";
import { q } from "@/lib/db";
import type { BoardGame } from "@/lib/types";
import { MesaHeader } from "@/components/mesa/MesaHeader";
import { BoardGameGrid } from "@/components/mesa/BoardGameGrid";
import { TrackView } from "@/components/mesa/Track";

export default async function LudotecaPage() {
  const ctx = await getTableContext();
  const games = ctx
    ? await q<BoardGame>(
        `SELECT id, name, genre, min_players, max_players, minutes, summary, cover_file, back_file, available
         FROM board_games WHERE restaurant_id = $1 ORDER BY available DESC, lower(name)`,
        [ctx.restaurant.id],
      )
    : [];

  return (
    <>
      <MesaHeader title="Ludoteca" />
      <TrackView type="ludoteca_view" />
      <p className="pb-3 pt-1 text-sm text-muted">Toca una caja para ver de qué trata y pídela sin levantarte.</p>
      <BoardGameGrid games={games} />
    </>
  );
}
