import { getTableContext } from "@/lib/auth";
import { db } from "@/lib/db";
import type { BoardGame } from "@/lib/types";
import { MesaHeader } from "@/components/mesa/MesaHeader";
import { BoardGameGrid } from "@/components/mesa/BoardGameGrid";

export default async function LudotecaPage() {
  const ctx = await getTableContext();
  const games = ctx
    ? (db()
        .prepare(
          `SELECT id, name, genre, min_players, max_players, minutes, summary, cover_file, back_file, available
           FROM board_games WHERE restaurant_id = ? ORDER BY available DESC, name COLLATE NOCASE`,
        )
        .all(ctx.restaurant.id) as BoardGame[])
    : [];

  return (
    <>
      <MesaHeader title="Ludoteca" />
      <p className="pb-3 pt-1 text-sm text-muted">Toca una caja para ver de qué trata y pídela sin levantarte.</p>
      <BoardGameGrid games={games} />
    </>
  );
}
