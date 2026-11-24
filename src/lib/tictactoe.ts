// Lógica pura del gato (tres en raya). El jugador es "X" y empieza; la IA es "O".

export type Cell = "" | "X" | "O";
export type GatoMode = "perfect" | "blunder";

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function winningLine(b: Cell[]): number[] | null {
  for (const l of LINES) {
    if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return l;
  }
  return null;
}

export function outcome(b: Cell[]): "X" | "O" | "draw" | null {
  const l = winningLine(b);
  if (l) return b[l[0]] as "X" | "O";
  return b.every(Boolean) ? "draw" : null;
}

/** Puntaje desde el punto de vista de la IA (positivo = gana la IA). */
function minimax(b: Cell[], turn: "X" | "O", depth: number): number {
  const o = outcome(b);
  if (o === "O") return 10 - depth;
  if (o === "X") return depth - 10;
  if (o === "draw") return 0;
  let best = turn === "O" ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = turn;
    const s = minimax(b, turn === "O" ? "X" : "O", depth + 1);
    b[i] = "";
    best = turn === "O" ? Math.max(best, s) : Math.min(best, s);
  }
  return best;
}

/**
 * Elige la jugada de la IA.
 * - perfect: la mejor jugada posible (imposible de vencer).
 * - blunder: la peor jugada posible, para "dejarse ganar" en ocasiones especiales.
 * Entre jugadas empatadas elige al azar para que no se sienta repetitivo.
 */
export function aiMove(board: Cell[], mode: GatoMode, randInt: (n: number) => number): number {
  const b = [...board];
  const options: { i: number; s: number }[] = [];
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = "O";
    options.push({ i, s: minimax(b, "X", 1) });
    b[i] = "";
  }
  const target =
    mode === "perfect"
      ? Math.max(...options.map((o) => o.s))
      : Math.min(...options.map((o) => o.s));
  const candidates = options.filter((o) => o.s === target);
  return candidates[randInt(candidates.length)].i;
}
