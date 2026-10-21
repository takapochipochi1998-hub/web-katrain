/**
 * The bridge between the simple UI and web-katrain's store: starting a game
 * against the human-like bot and remembering what kind of game it is.
 */
import { useGameStore } from '../store/gameStore';
import type { BoardSize, GameNode, Player } from '../types';
import { parseSgf } from '../utils/sgf';
import { sgfForPath } from './sgfPath';
import { hasClock, startClock, type Clock, type TimeControl } from './clock';
import { humanProfileFor, humanWeaknessFor, isRank, rankLabel, type Rank } from './rankLadder';
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
  /** The player's time limit for this game and what is left of it. */
  timeControl?: TimeControl;
  clock?: Clock;
};

export type GameConfig = {
  kind: GameKind;
  size: BoardSize;
  aiRank: Rank;
  handicap: number;
  komi: number;
  timeControl?: TimeControl;
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Clock fields from storage, dropped unless they are whole and sane. */
export function parseClockFields(raw: Partial<Pick<SessionMeta, 'timeControl' | 'clock'>>): Pick<SessionMeta, 'timeControl' | 'clock'> {
  const tc = raw.timeControl;
  const clock = raw.clock;
  if (!tc || !isNum(tc.mainSec) || !isNum(tc.byoSec) || !isNum(tc.periods) || !hasClock(tc)) return {};
  if (!clock || !isNum(clock.mainLeft) || !isNum(clock.periodsLeft)) return { timeControl: tc, clock: startClock(tc) };
  return { timeControl: tc, clock };
}

/** Colours are drawn at random, except that handicap stones are the player's. */
export function drawHumanColor(handicap: number, random: () => number = Math.random): Player {
  if (handicap > 0) return 'black';
  return random() < 0.5 ? 'black' : 'white';
}

const STORAGE_KEY = 'web-katrain:sensei-session:v1';

/**
 * Search for the bot's own moves. The human-like bot picks from the human net's
 * policy and the search barely weighs in (KataGo's imitate settings), so a short
 * search keeps its strength and only guards the pass decision: about a third of
 * the time of 100 visits.
 */
export const HUMAN_BOT_VISITS = 16;

/**
 * The tree the simple mode put in the store. The detail mode shares the store
 * and can replace the game at any time; anything else in the store is not ours
 * to resume, save or count.
 */
let ownRoot: GameNode | null = null;
const claimStoreGame = () => { ownRoot = useGameStore.getState().rootNode; };
export const ownsStoreGame = (): boolean => ownRoot !== null && useGameStore.getState().rootNode === ownRoot;

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
      ...parseClockFields(raw),
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
  const humanColor = drawHumanColor(config.handicap);
  const aiColor: Player = humanColor === 'black' ? 'white' : 'black';
  // The detail mode shares this store; its teach mode would take back our moves.
  if (store.isTeachMode) store.toggleTeachMode();
  if (store.isContinuousAnalysis) store.toggleContinuousAnalysis(true);
  if (useGameStore.getState().isAnalysisMode) useGameStore.getState().toggleAnalysisMode();
  store.startNewGame({ komi: config.komi, rules: 'japanese', boardSize: config.size, handicap: config.handicap });
  const aiName = `AI ${rankLabel(config.aiRank)}`;
  store.setRootProperty('PB', humanColor === 'black' ? 'あなた' : aiName);
  store.setRootProperty('PW', humanColor === 'white' ? 'あなた' : aiName);
  store.setRootProperty(aiColor === 'black' ? 'BR' : 'WR', config.aiRank);
  store.updateSettings({
    aiStrategy: 'human',
    humanSlProfile: humanProfileFor(config.aiRank),
    aiHumanWeakness: humanWeaknessFor(config.aiRank),
    aiMoveVisits: HUMAN_BOT_VISITS,
    timerMainTimeMinutes: 0,
    timerByoLengthSeconds: 0,
    timerByoPeriods: 0,
    timerMinimalUseSeconds: 0,
  });
  useGameStore.setState({ isAiPlaying: true, aiColor });
  if (useGameStore.getState().currentPlayer === aiColor) useGameStore.getState().scheduleAiMove(300);
  claimStoreGame();

  const meta: SessionMeta = {
    kind: config.kind,
    size: config.size,
    aiRank: config.aiRank,
    humanColor: humanColor,
    startedAt: Date.now(),
    rankRecorded: false,
    ...(hasClock(config.timeControl) ? { timeControl: config.timeControl, clock: startClock(config.timeControl) } : {}),
  };
  saveSession(meta);
  return meta;
}

/** Put the bot back on for a game already in the store, after a reload or a fresh start from a position. */
function resumeBot(meta: SessionMeta): void {
  const store = useGameStore.getState();
  if (store.isTeachMode) store.toggleTeachMode();
  if (store.isContinuousAnalysis) store.toggleContinuousAnalysis(true);
  if (useGameStore.getState().isAnalysisMode) useGameStore.getState().toggleAnalysisMode();
  const aiColor: Player = meta.humanColor === 'black' ? 'white' : 'black';
  store.updateSettings({ aiStrategy: 'human', humanSlProfile: humanProfileFor(meta.aiRank), aiHumanWeakness: humanWeaknessFor(meta.aiRank), aiMoveVisits: HUMAN_BOT_VISITS });
  useGameStore.setState({ isAiPlaying: true, aiColor });
  if (useGameStore.getState().currentPlayer === aiColor) useGameStore.getState().scheduleAiMove(300);
}

/** Load an SGF into the store and stand on its last move. */
export function loadSgfToEnd(sgf: string): void {
  const store = useGameStore.getState();
  useGameStore.setState({ isAiPlaying: false, aiColor: null });
  store.loadGame(parseSgf(sgf));
  useGameStore.getState().navigateEnd();
  claimStoreGame();
}

export function resumeGame(meta: SessionMeta, sgf: string): void {
  loadSgfToEnd(sgf);
  saveSession(meta);
  resumeBot(meta);
}

/** A free game against the bot from the position at `node`, playing the side to move. */
export function startFromPosition(node: GameNode, aiRank: Rank): SessionMeta {
  const humanColor = node.gameState.currentPlayer;
  const sgf = sgfForPath(node);
  loadSgfToEnd(sgf);
  const store = useGameStore.getState();
  const aiName = `AI ${rankLabel(aiRank)}`;
  store.setRootProperty('PB', humanColor === 'black' ? 'あなた' : aiName);
  store.setRootProperty('PW', humanColor === 'white' ? 'あなた' : aiName);
  const meta: SessionMeta = {
    kind: 'free',
    size: node.gameState.board.length as BoardSize,
    aiRank,
    humanColor,
    startedAt: Date.now(),
    rankRecorded: false,
  };
  saveSession(meta);
  resumeBot(meta);
  return meta;
}

/** The player ran out of time: the game is lost on time ("W+T" / "B+T"). */
export function loseOnTime(humanColor: Player): void {
  const state = useGameStore.getState();
  const result = `${humanColor === 'black' ? 'W' : 'B'}+T`;
  state.currentNode.endState = result;
  state.rootNode.properties = state.rootNode.properties ?? {};
  state.rootNode.properties.RE = [result];
  useGameStore.setState((s) => ({ isAiPlaying: false, isAiThinking: false, aiColor: null, treeVersion: s.treeVersion + 1 }));
}
