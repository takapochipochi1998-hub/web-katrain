import { describe, expect, it } from 'vitest';
import { emptyRankBook, recordResult, setRank } from '../src/sensei/rankLadder';
import type { SavedGame } from '../src/sensei/savedGames';
import { mergeGames, mergeRanks, mergeSync, type SyncData } from '../src/sensei/sync';

const game = (id: number, moveCount: number, result: string | null = null): SavedGame => ({
  id: String(id),
  meta: { kind: 'free', size: 9, aiRank: '5k', humanColor: 'black', startedAt: id, rankRecorded: false },
  sgf: `(;GM[1]SZ[9];B[ee]${'x'.repeat(moveCount)})`,
  result,
  moveCount,
  updatedAt: id,
});

describe('device sync merge', () => {
  it('keeps games from both devices, newest first', () => {
    expect(mergeGames([game(1, 3)], [game(2, 5)], {}).map((g) => g.id)).toEqual(['2', '1']);
  });

  it('prefers the finished copy, then the longer one', () => {
    expect(mergeGames([game(1, 40)], [game(1, 30, 'B+R')], {})[0]!.result).toBe('B+R');
    expect(mergeGames([game(1, 12)], [game(1, 20)], {})[0]!.moveCount).toBe(20);
  });

  it('does not bring back a game deleted on either device', () => {
    const local: SyncData = { v: 1, games: [], ranks: emptyRankBook(), problems: [], deleted: { games: { '1': 5 }, problems: {} } };
    const remote: SyncData = { v: 1, games: [game(1, 3), game(2, 3)], ranks: emptyRankBook(), problems: [], deleted: { games: {}, problems: {} } };
    const merged = mergeSync(local, remote);
    expect(merged.games.map((g) => g.id)).toEqual(['2']);
    expect(merged.deleted.games).toEqual({ '1': 5 });
  });

  it('takes the rank that changed last and keeps every result', () => {
    const phone = recordResult(setRank(emptyRankBook(), 9, '10k', 100), 9, 'win', 200);
    const pc = recordResult(setRank(emptyRankBook(), 9, '10k', 100), 9, 'loss', 300);
    const merged = mergeRanks(phone, pc);
    expect(merged[9].rating).toBe(2600);
    expect(merged[9].history.map((h) => h.at)).toEqual([200, 300]);
  });
});
