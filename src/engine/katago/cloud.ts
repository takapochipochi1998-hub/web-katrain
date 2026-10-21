/**
 * The cloud KataGo (a real KataGo on a GPU, see go-ai-trainer/cloud/): when it
 * is set up and the device is online, analysis goes there first, and the
 * on-device engine answers only if the cloud does not.
 *
 * The request is KataGo's analysis-engine JSON; the reply is turned into the
 * same payload the on-device engine produces, so callers cannot tell them apart.
 */
import type { BoardSize, BoardState, GameRules, Move, Player } from '../../types';
import { formatGtpMove, parseGtpMove } from '../../lib/gtp';
import { applyCapturesInPlace } from '../../utils/gameLogic';
import type { KataGoAnalysisPayload } from './types';

export type CloudConfig = {
  url: string;
  token: string;
  /** Told about each cloud call: how long it took, or why it fell back. */
  onEvent?: (event: 'ok' | 'fallback', data: Record<string, unknown>) => void;
};

let config: CloudConfig | null = null;

export function setCloudConfig(next: CloudConfig | null): void {
  config = next && next.url && next.token ? next : null;
}

export const cloudReady = (): boolean => !!config && (typeof navigator === 'undefined' || navigator.onLine !== false);

/** Wake the cloud machine ahead of the first real request; failures are ignored. */
export function warmUpCloud(): void {
  if (!cloudReady() || !config) return;
  void fetch(`${config.url.replace(/\/$/, '')}/health`, {
    headers: { Authorization: `Bearer ${config.token}` },
    signal: AbortSignal.timeout(30_000),
  }).catch(() => undefined);
}

export type CloudAnalyzeArgs = {
  board: BoardState;
  currentPlayer: Player;
  moveHistory: Move[];
  komi: number;
  rules?: GameRules;
  topK?: number;
  analysisPvLen?: number;
  wideRootNoise?: number;
  rootPolicyTemperature?: number;
  conservativePass?: boolean;
  visits?: number;
  maxTimeMs?: number;
  ownershipMode?: 'none' | 'root' | 'tree';
  includeMovesOwnership?: boolean;
  humanSlProfile?: string;
  humanSlRootExploreProb?: number;
};

const color = (p: Player) => (p === 'black' ? 'B' : 'W');

/** Moves from an empty board when they rebuild this position; otherwise the stones as they stand. */
function positionFor(args: CloudAnalyzeArgs) {
  const size = args.board.length;
  const replay: BoardState = Array.from({ length: size }, () => Array(size).fill(null));
  let fits = true;
  for (const m of args.moveHistory) {
    if (m.x < 0) continue;
    if (replay[m.y]?.[m.x] !== null) { fits = false; break; }
    replay[m.y]![m.x] = m.player;
    applyCapturesInPlace(replay, m.x, m.y, m.player);
  }
  fits = fits && replay.every((row, y) => row.every((c, x) => c === args.board[y]![x]));
  if (fits) {
    return { moves: args.moveHistory.map((m) => [color(m.player), m.x < 0 ? 'pass' : formatGtpMove(m.x, m.y, size)]) };
  }
  // Handicap or a set-up position: no history to give, only the stones.
  const initialStones: string[][] = [];
  args.board.forEach((row, y) => row.forEach((c, x) => { if (c) initialStones.push([color(c), formatGtpMove(x, y, size)]); }));
  return { initialStones, moves: [], initialPlayer: color(args.currentPlayer) };
}

type CloudMoveInfo = {
  move: string; visits: number; edgeVisits?: number; winrate: number; scoreLead: number; scoreSelfplay: number;
  scoreStdev: number; prior: number; humanPrior?: number; utility?: number; lcb?: number; utilityLcb?: number;
  playSelectionValue?: number; weight?: number; edgeWeight?: number; order: number; pv?: string[]; pvVisits?: number[];
  pvEdgeVisits?: number[]; ownership?: number[];
};
type CloudResponse = {
  error?: string;
  rootInfo: Record<string, number>;
  moveInfos: CloudMoveInfo[];
  ownership?: number[];
  ownershipStdev?: number[];
  policy?: number[];
  humanPolicy?: number[];
};

export async function analyzeInCloud(args: CloudAnalyzeArgs, signal?: AbortSignal): Promise<KataGoAnalysisPayload> {
  if (!config) throw new Error('cloud not configured');
  const size = args.board.length as BoardSize;
  const wantOwnership = !!args.ownershipMode && args.ownershipMode !== 'none';
  const overrideSettings: Record<string, unknown> = {};
  if (args.humanSlProfile) overrideSettings.humanSLProfile = args.humanSlProfile;
  if (args.humanSlRootExploreProb !== undefined) overrideSettings.humanSLRootExploreProbWeightless = args.humanSlRootExploreProb;
  if (args.rootPolicyTemperature !== undefined) overrideSettings.rootPolicyTemperature = args.rootPolicyTemperature;
  if (args.wideRootNoise !== undefined) overrideSettings.wideRootNoise = args.wideRootNoise;
  if (args.conservativePass !== undefined) overrideSettings.conservativePass = args.conservativePass;
  if (args.maxTimeMs) overrideSettings.maxTime = args.maxTimeMs / 1000;
  const query = {
    ...positionFor(args),
    rules: args.rules ?? 'japanese',
    komi: args.komi,
    boardXSize: size,
    boardYSize: size,
    maxVisits: Math.max(1, args.visits ?? 100),
    analysisPVLen: args.analysisPvLen ?? 15,
    includePolicy: true,
    includeOwnership: wantOwnership,
    includeOwnershipStdev: wantOwnership,
    includeMovesOwnership: !!args.includeMovesOwnership,
    includePVVisits: true,
    overrideSettings,
  };
  // Long searches get longer; a cold machine can need ~15 s to answer at all.
  const timeoutMs = 15_000 + Math.min((args.visits ?? 100) * 5, args.maxTimeMs ?? Infinity);
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetch(`${config.url.replace(/\/$/, '')}/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as CloudResponse;
  if (data.error) throw new Error(data.error);
  return toPayload(data, args, size);
}

function toPayload(data: CloudResponse, args: CloudAnalyzeArgs, size: BoardSize): KataGoAnalysisPayload {
  const n = size * size;
  const root = data.rootInfo;
  const sign = args.currentPlayer === 'black' ? 1 : -1;
  const infos = [...data.moveInfos].sort((a, b) => a.order - b.order).slice(0, Math.max(1, args.topK ?? 10));
  const best = infos[0];
  const rootWinRate = root.winrate ?? best?.winrate ?? 0.5;
  const rootScoreLead = root.scoreLead ?? best?.scoreLead ?? 0;
  const bestScoreLead = best?.scoreLead ?? rootScoreLead;
  const moves = infos.map((m, i) => {
    const parsed = parseGtpMove(m.move, size);
    const at = parsed && parsed.kind === 'move' ? parsed : { x: -1, y: -1 };
    return {
      x: at.x,
      y: at.y,
      winRate: m.winrate,
      winRateLost: sign * (rootWinRate - m.winrate),
      scoreLead: m.scoreLead,
      scoreSelfplay: m.scoreSelfplay,
      scoreStdev: m.scoreStdev,
      visits: m.visits,
      edgeVisits: m.edgeVisits,
      weight: m.weight,
      edgeWeight: m.edgeWeight,
      pointsLost: sign * (rootScoreLead - m.scoreLead),
      relativePointsLost: sign * (bestScoreLead - m.scoreLead),
      order: i,
      prior: m.prior,
      pv: m.pv ?? [],
      pvVisits: m.pvVisits,
      pvEdgeVisits: m.pvEdgeVisits,
      lcb: m.lcb,
      utilityLcb: m.utilityLcb,
      playSelectionValue: m.playSelectionValue,
      utility: m.utility,
      humanPrior: m.humanPrior,
      ownership: m.ownership ? Float32Array.from(m.ownership) : undefined,
    };
  });
  return {
    rootWinRate,
    rootScoreLead,
    rootScoreSelfplay: root.scoreSelfplay ?? rootScoreLead,
    rootScoreStdev: root.scoreStdev ?? best?.scoreStdev ?? 0,
    rootVisits: root.visits ?? 0,
    rawWinRate: root.rawWinrate,
    rawScoreLead: root.rawLead,
    rawScoreSelfplay: root.rawScoreSelfplay,
    rawScoreSelfplayStdev: root.rawScoreSelfplayStdev,
    rawNoResultProb: root.rawNoResultProb,
    rawStWrError: root.rawStWrError,
    rawStScoreError: root.rawStScoreError,
    rawVarTimeLeft: root.rawVarTimeLeft,
    ownership: data.ownership ? Float32Array.from(data.ownership) : new Float32Array(n),
    ownershipStdev: data.ownershipStdev ? Float32Array.from(data.ownershipStdev) : new Float32Array(n),
    policy: data.policy ? Float32Array.from(data.policy) : new Float32Array(n + 1).fill(-1),
    humanPolicy: data.humanPolicy ? Float32Array.from(data.humanPolicy) : undefined,
    moves,
  };
}

export function reportCloud(event: 'ok' | 'fallback', data: Record<string, unknown>): void {
  config?.onEvent?.(event, data);
}
