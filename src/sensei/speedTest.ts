/**
 * Time the same work on this device and on the cloud KataGo: a bot move
 * (human-like net, 16 visits) and a review search (1000 visits), on 19x19.
 */
import { getKataGoEngineClient } from '../engine/katago/client';
import { useGameStore } from '../store/gameStore';
import { createEmptyBoard } from '../utils/boardSize';
import type { BoardState, Move, Player } from '../types';
import { HUMAN_BOT_VISITS } from './session';
import { log } from './log';

const LETTERS = 'ABCDEFGHJKLMNOPQRST';
// A plain opening, no captures, so stones can be set without playing rules.
const MOVES = 'Q16 D4 Q3 D16 C14 F17 C17 C16 D17 E17 E18 F18 E16 D15 E15 E14 F15 R5 F14 F13 G13 F12 R4 Q5 P4 P5 O4 O5 N4 N5 M4 M5 L4 L5 K4 K5 J4 J5 H4 H5'.split(' ');
const REVIEW_VISITS = 1000;

type Position = { board: BoardState; moves: Move[]; toPlay: Player; gtp: Array<[string, string]> };

function position(count: number): Position {
  const board = createEmptyBoard(19);
  const moves: Move[] = [];
  const gtp: Array<[string, string]> = [];
  MOVES.slice(0, count).forEach((m, i) => {
    const player: Player = i % 2 === 0 ? 'black' : 'white';
    const x = LETTERS.indexOf(m[0]!);
    const y = 19 - Number(m.slice(1));
    board[y]![x] = player;
    moves.push({ x, y, player });
    gtp.push([player === 'black' ? 'B' : 'W', m]);
  });
  return { board, moves, toPlay: count % 2 === 0 ? 'black' : 'white', gtp };
}

export type SpeedRow = { label: string; device?: number; cloud?: number; note?: string };

const absolute = (url: string) => new URL(url, window.location.href).toString();

async function onDevice(pos: Position, visits: number, human: boolean, id: string): Promise<number> {
  const { settings } = useGameStore.getState();
  const started = performance.now();
  await getKataGoEngineClient().analyze({
    positionId: `speedtest:${id}:${Date.now()}`,
    modelUrl: absolute(settings.katagoModelUrl),
    backend: settings.katagoBackend,
    board: pos.board,
    currentPlayer: pos.toPlay,
    moveHistory: pos.moves,
    komi: 6.5,
    rules: 'japanese',
    topK: 10,
    visits,
    maxTimeMs: 60_000,
    batchSize: Math.max(1, Math.min(settings.katagoBatchSize, 64)),
    maxChildren: 361,
    reuseTree: false,
    ownershipMode: 'none',
    analysisGroup: 'background',
    humanModelUrl: human ? absolute(settings.humanSlModelUrl) : undefined,
    humanSlProfile: human ? 'rank_5k' : undefined,
  });
  return performance.now() - started;
}

export async function cloudAnalyze(url: string, token: string, body: Record<string, unknown>, timeoutMs = 60_000): Promise<Record<string, unknown>> {
  const res = await fetch(`${url.replace(/\/$/, '')}/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

async function onCloud(url: string, token: string, pos: Position, visits: number, human: boolean): Promise<number> {
  const started = performance.now();
  await cloudAnalyze(url, token, {
    moves: pos.gtp,
    rules: 'japanese',
    komi: 6.5,
    boardXSize: 19,
    boardYSize: 19,
    maxVisits: visits,
    ...(human ? { includePolicy: true, overrideSettings: { humanSLProfile: 'rank_5k' } } : {}),
  }, 120_000);
  return performance.now() - started;
}

/** Runs the tests in turn, reporting each row as it finishes. */
export async function runSpeedTest(cloud: { url: string; token: string } | null, onRow: (rows: SpeedRow[]) => void): Promise<SpeedRow[]> {
  // Positions differ by row so no cache answers for the engine.
  const tests = [
    { label: 'AIの1手（1回目）', pos: position(36), visits: HUMAN_BOT_VISITS, human: true },
    { label: 'AIの1手（2回目）', pos: position(37), visits: HUMAN_BOT_VISITS, human: true },
    { label: 'AIの1手（3回目）', pos: position(38), visits: HUMAN_BOT_VISITS, human: true },
    { label: `検討 深さ${REVIEW_VISITS}`, pos: position(40), visits: REVIEW_VISITS, human: false },
  ];
  const rows: SpeedRow[] = [];
  for (const [i, t] of tests.entries()) {
    const row: SpeedRow = { label: t.label };
    rows.push(row);
    onRow([...rows]);
    try {
      row.device = await onDevice(t.pos, t.visits, t.human, String(i));
    } catch (e) {
      row.note = `端末: ${e instanceof Error ? e.message : String(e)}`;
    }
    onRow([...rows]);
    if (cloud) {
      try {
        row.cloud = await onCloud(cloud.url, cloud.token, t.pos, t.visits, t.human);
      } catch (e) {
        row.note = `${row.note ? row.note + ' / ' : ''}クラウド: ${e instanceof Error ? e.message : String(e)}`;
      }
      onRow([...rows]);
    }
  }
  log('speed-test', { rows: rows.map((r) => ({ l: r.label, d: r.device && Math.round(r.device), c: r.cloud && Math.round(r.cloud), n: r.note })) });
  return rows;
}
