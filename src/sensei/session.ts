/**
 * The bridge between the simple UI and web-katrain's store: starting a game
 * against the human-like bot and remembering what kind of game it is.
 */
import { useGameStore } from '../store/gameStore';
import type { BoardSize, Player } from '../types';
import { humanProfileFor, isRank, rankLabel, type Rank } from './rankLadder';
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from '../utils/storage';

export type GameKind = 'ranked' | 'free';

export type SessionMeta = {
  kind: GameKind;
  size: BoardSize;
  aiRank: Rank;
  humanColor: Player;
  startedAt: number;
  /** Set once the result has moved the ranked ladder, so it moves only once. */
  rankRecorded: boolean;
};

export type GameConfig = {
  kind: GameKind;
  size: BoardSize;
  aiRank: Rank;
  humanColor: Player;
  handicap: number;
  komi: number;
};

const STORAGE_KEY = 'web-katrain:sensei-session:v1';

export function loadSession(): SessionMeta | null {
  try {
    const raw = JSON.parse(readLocalStorage(STORAGE_KEY) ?? 'null') as Partial<SessionMeta> | null;
    if (!raw || !isRank(raw.aiRank) || (raw.kind !== 'ranked' && raw.kind !== 'free')) return null;
    if (raw.humanColor !== 'black' && raw.humanColor !== 'white') return null;
    if (raw.size !== 9 && raw.size !== 13 && raw.size !== 19) return null;
    return {
      kind: raw.kind,
      size: raw.size,
      aiRank: raw.aiRank,
      humanColor: raw.humanColor,
      startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : Date.now(),
      rankRecorded: raw.rankRecorded === true,
    };
  } catch {
    return null;
  }
}

export function saveSession(meta: SessionMeta | null): void {
  // Without storage the game still plays; it just will not resume after a reload.
  if (meta) writeLocalStorage(STORAGE_KEY, JSON.stringify(meta));
  else removeLocalStorage(STORAGE_KEY);
}

export function startGame(config: GameConfig): SessionMeta {
  const store = useGameStore.getState();
  const aiColor: Player = config.humanColor === 'black' ? 'white' : 'black';
  // The detail mode shares this store; its teach mode would take back our moves.
  if (store.isTeachMode) store.toggleTeachMode();
  if (store.isContinuousAnalysis) store.toggleContinuousAnalysis(true);
  if (useGameStore.getState().isAnalysisMode) useGameStore.getState().toggleAnalysisMode();
  store.startNewGame({ komi: config.komi, rules: 'japanese', boardSize: config.size, handicap: config.handicap });
  const aiName = `AI ${rankLabel(config.aiRank)}`;
  store.setRootProperty('PB', config.humanColor === 'black' ? 'あなた' : aiName);
  store.setRootProperty('PW', config.humanColor === 'white' ? 'あなた' : aiName);
  store.setRootProperty(aiColor === 'black' ? 'BR' : 'WR', config.aiRank);
  store.updateSettings({
    aiStrategy: 'human',
    humanSlProfile: humanProfileFor(config.aiRank),
    timerMainTimeMinutes: 0,
    timerByoLengthSeconds: 0,
    timerByoPeriods: 0,
    timerMinimalUseSeconds: 0,
  });
  useGameStore.setState({ isAiPlaying: true, aiColor });
  if (useGameStore.getState().currentPlayer === aiColor) useGameStore.getState().scheduleAiMove(300);

  const meta: SessionMeta = {
    kind: config.kind,
    size: config.size,
    aiRank: config.aiRank,
    humanColor: config.humanColor,
    startedAt: Date.now(),
    rankRecorded: false,
  };
  saveSession(meta);
  return meta;
}
