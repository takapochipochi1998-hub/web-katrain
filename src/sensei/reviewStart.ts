/**
 * Where the next review opens, when it should not open at the end of the game:
 * "検討に戻る" returns to the move a resumed game started from. Read once.
 */
let pendingMove: number | null = null;

export const openReviewAt = (move: number): void => { pendingMove = move; };

export function takeReviewStart(): number | null {
  const move = pendingMove;
  pendingMove = null;
  return move;
}
