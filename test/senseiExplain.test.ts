import { describe, expect, it, vi } from 'vitest';
import type { BoardState, GameNode } from '../src/types';
import { gtpLineLabel, gtpToPoint, pointLabel } from '../src/sensei/coords';
import { explainMove, factsForMove, factsToText } from '../src/sensei/explain';

describe('coordinates', () => {
  it('converts GTP to Japanese coordinates', () => {
    expect(gtpToPoint('A9', 9)).toEqual({ x: 0, y: 0 });
    expect(gtpToPoint('J1', 9)).toEqual({ x: 8, y: 8 }); // GTP skips I
    expect(pointLabel(3, 2)).toBe('4の三');
    expect(gtpLineLabel(['E5', 'pass'], 9, 'white')).toBe('白5の五→黒パス');
  });
});

const board = (): BoardState => Array.from({ length: 9 }, () => Array<null>(9).fill(null));
const territory = (v: number) => Array.from({ length: 9 }, () => Array<number>(9).fill(v));

describe('move facts', () => {
  const parentBoard = board();
  const parent = {
    id: 'p', parent: { id: 'r' } as GameNode, children: [], move: { x: 0, y: 0, player: 'white' },
    gameState: { board: parentBoard, currentPlayer: 'black', moveHistory: [{}], capturedBlack: 0, capturedWhite: 0, komi: 6.5 },
    analysis: {
      rootWinRate: 0.5, rootScoreLead: 1, territory: territory(0),
      moves: [
        { x: 4, y: 4, pointsLost: 0, winRate: 0.5, scoreLead: 1, visits: 50, order: 0, pv: ['E5', 'C3'] },
        { x: 0, y: 8, pointsLost: 7, winRate: 0.3, scoreLead: -6, visits: 5, order: 1, pv: ['A1', 'E5'] },
      ],
    },
  } as unknown as GameNode;
  const childBoard = board();
  childBoard[8]![0] = 'black';
  const node = {
    id: 'c', parent, children: [], move: { x: 0, y: 8, player: 'black' },
    gameState: { board: childBoard, currentPlayer: 'white', moveHistory: [{}, {}], capturedBlack: 0, capturedWhite: 0, komi: 6.5 },
    analysis: { rootWinRate: 0.3, rootScoreLead: -6, territory: territory(-1), moves: [] },
  } as unknown as GameNode;

  it('works out the loss, the best line and endangered stones', () => {
    const facts = factsForMove(node)!;
    expect(facts).toMatchObject({ color: '黒', played: '1の九', quality: '悪手', pointsLost: 7, best: '5の五', bestLine: '黒5の五→白3の七' });
    expect(facts.endangeredStones).toEqual(['1の九']);
    expect(factsToText(facts)).toContain('白が6目リード');
  });

  it('sends the key in a header and returns the text', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '解説' }] } }] }), { status: 200 }));
    const text = await explainMove({ apiKey: 'k', model: 'm', facts: factsForMove(node)! }, fetchImpl as unknown as typeof fetch);
    expect(text).toBe('解説');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain('k');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k');
  });

  it('refuses without a key', async () => {
    await expect(explainMove({ apiKey: '', model: 'm', facts: factsForMove(node)! })).rejects.toThrow('APIキー');
  });
});
