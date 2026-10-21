/**
 * Keeping games, ranks and problems the same on every device that shares the
 * cloud secret. The server holds one document; each device merges it with its
 * own copy and writes the union back. Settings stay per device on purpose (a
 * phone and a PC want different boards), and secrets never leave the device.
 */
import { readLocalStorage, writeLocalStorage } from '../utils/storage';
import { parseRankBook, RANKED_BOARD_SIZES, type RankBook, type RankHistoryEntry, type RankState } from './rankLadder';
import { parseSavedGames, type SavedGame } from './savedGames';
import type { Problem } from './problems';

export type Tombstones = { games: Record<string, number>; problems: Record<string, number> };

export type SyncData = {
  v: 1;
  games: SavedGame[];
  ranks: RankBook;
  problems: Problem[];
  deleted: Tombstones;
};

const TOMBSTONE_KEY = 'web-katrain:sensei-sync-deleted:v1';

export function loadTombstones(): Tombstones {
  try {
    const raw = JSON.parse(readLocalStorage(TOMBSTONE_KEY) ?? 'null') as Partial<Tombstones> | null;
    return { games: { ...(raw?.games ?? {}) }, problems: { ...(raw?.problems ?? {}) } };
  } catch {
    return { games: {}, problems: {} };
  }
}

export function storeTombstones(t: Tombstones): void {
  writeLocalStorage(TOMBSTONE_KEY, JSON.stringify(t));
}

/** Remember a deletion, so another device's copy does not bring it back. */
export function markDeleted(kind: keyof Tombstones, id: string, at = Date.now()): void {
  const t = loadTombstones();
  t[kind][id] = at;
  storeTombstones(t);
}

const maxRecord = (a: Record<string, number>, b: Record<string, number>) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
  return out;
};

/** Of two copies of one game: the finished one, else the longer one, else the newer one. */
function betterGame(a: SavedGame, b: SavedGame): SavedGame {
  if (!!a.result !== !!b.result) return a.result ? a : b;
  if (a.moveCount !== b.moveCount) return a.moveCount > b.moveCount ? a : b;
  return a.updatedAt >= b.updatedAt ? a : b;
}

export function mergeGames(a: readonly SavedGame[], b: readonly SavedGame[], deleted: Record<string, number>): SavedGame[] {
  const byId = new Map<string, SavedGame>();
  for (const g of [...a, ...b]) {
    const seen = byId.get(g.id);
    byId.set(g.id, seen ? betterGame(seen, g) : g);
  }
  return [...byId.values()]
    .filter((g) => !(g.id in deleted))
    .sort((x, y) => y.meta.startedAt - x.meta.startedAt);
}

const lastChange = (s: RankState) => s.changedAt ?? s.history[s.history.length - 1]?.at ?? 0;

function mergeRankState(a: RankState, b: RankState): RankState {
  const history = new Map<number, RankHistoryEntry>();
  for (const h of [...a.history, ...b.history]) history.set(h.at, h);
  const newer = lastChange(b) > lastChange(a) ? b : a;
  return {
    rank: newer.rank ?? a.rank ?? b.rank,
    history: [...history.values()].sort((x, y) => x.at - y.at),
    ...(lastChange(newer) ? { changedAt: lastChange(newer) } : {}),
  };
}

export function mergeRanks(a: RankBook, b: RankBook): RankBook {
  const out = { ...a };
  for (const size of RANKED_BOARD_SIZES) out[size] = mergeRankState(a[size], b[size]);
  return out;
}

export function mergeProblems(a: readonly Problem[], b: readonly Problem[], deleted: Record<string, number>): Problem[] {
  const byId = new Map<string, Problem>();
  for (const p of [...a, ...b]) {
    const seen = byId.get(p.id);
    byId.set(p.id, seen && seen.attempts >= p.attempts ? seen : p);
  }
  return [...byId.values()].filter((p) => !(p.id in deleted)).sort((x, y) => y.createdAt - x.createdAt);
}

export function mergeSync(local: SyncData, remote: SyncData | null): SyncData {
  if (!remote) return local;
  const deleted = {
    games: maxRecord(local.deleted.games, remote.deleted?.games ?? {}),
    problems: maxRecord(local.deleted.problems, remote.deleted?.problems ?? {}),
  };
  return {
    v: 1,
    games: mergeGames(local.games, parseSavedGames(remote.games), deleted.games),
    ranks: mergeRanks(local.ranks, parseRankBook(remote.ranks)),
    problems: mergeProblems(local.problems, Array.isArray(remote.problems) ? remote.problems : [], deleted.problems),
    deleted,
  };
}

type Remote = { data: SyncData | null; rev: number };

async function call(url: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(`${url.replace(/\/$/, '')}/data`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
}

/**
 * Pull, merge, push. Returns the merged data for the caller to apply locally.
 * A write that raced another device's (409) is merged again and retried.
 */
export async function syncWithServer(url: string, token: string, local: SyncData): Promise<SyncData> {
  let res = await call(url, token);
  if (!res.ok) throw new Error(`同期の取得に失敗しました（HTTP ${res.status}）`);
  let remote = (await res.json()) as Remote;
  for (let attempt = 0; attempt < 3; attempt++) {
    const merged = mergeSync(local, remote.data);
    if (remote.data && JSON.stringify(merged) === JSON.stringify(mergeSync(remote.data, null))) return merged;
    res = await call(url, token, { method: 'PUT', body: JSON.stringify({ data: merged, baseRev: remote.rev }) });
    if (res.ok) return merged;
    if (res.status !== 409) throw new Error(`同期の保存に失敗しました（HTTP ${res.status}）`);
    remote = (await res.json()) as Remote;
    local = merged;
  }
  throw new Error('同期が混み合っています。少し待ってから開き直してください');
}
