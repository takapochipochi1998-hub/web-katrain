import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isSmallKataGoModel, KATAGO_RECOMMENDED_MODEL_PATH } from '../engine/katago/modelDefaults';
import { useGameStore } from '../store/gameStore';
import type { GameNode } from '../types';
import { publicUrl } from '../utils/publicUrl';
import { generateSgfFromTree } from '../utils/sgf';
import { GameScreen } from './GameScreen';
import { GamesScreen } from './GamesScreen';
import { PlayScreen } from './PlayScreen';
import { ProblemsScreen } from './ProblemsScreen';
import { ReviewScreen } from './ReviewScreen';
import { SettingsScreen } from './SettingsScreen';
import { createProblem, loadProblems, recordAttempt, sameProblem, storeProblems, type Problem } from './problems';
import { loadPreferences, storePreferences, type Preferences } from './preferences';
import { loadRankBook, rankForRating, rankLabel, ratingOf, saveRankBook, type Rank, type RankBook } from './rankLadder';
import { branchPoint, mainLine } from './reviewModel';
import { openReviewAt } from './reviewStart';
import { gameIdFor, loadSavedGames, removeGame, storeSavedGames, upsertGame, type SavedGame } from './savedGames';
import {
  loadSession,
  loadSgfToEnd,
  ownsStoreGame,
  resumeGame,
  saveSession,
  startFromPosition,
  startGame,
  type GameConfig,
  type SessionMeta,
} from './session';
import { Icons } from './icons';
import { Toast } from './ui';
import { ErrorBoundary } from './ErrorBoundary';
import { log } from './log';
import { setCloudConfig, warmUpCloud } from '../engine/katago/cloud';
import { stoneSprites } from './stoneSprites';
import { BoardPrefsContext } from './boardPrefs';
import { loadTombstones, markDeleted, storeTombstones, syncWithServer } from './sync';
import { syncUrlFor, type SyncStatus } from './syncStatus';

type Tab = 'play' | 'games' | 'problems' | 'settings';
type View = 'game' | 'review' | null;

const TABS: ReadonlyArray<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'play', label: '対局', icon: Icons.play },
  { id: 'games', label: '棋譜', icon: Icons.games },
  { id: 'problems', label: '次の一手', icon: Icons.problems },
  { id: 'settings', label: '設定', icon: Icons.settings },
];

/** Snapshot of the game in the store, ready for the game list. */
function snapshot(meta: SessionMeta, previous: SavedGame | undefined): SavedGame {
  const { rootNode } = useGameStore.getState();
  const line = mainLine(rootNode);
  const last = line[line.length - 1]!;
  const result = last.endState ?? rootNode.properties?.RE?.[0] ?? null;
  return {
    id: gameIdFor(meta),
    meta,
    sgf: generateSgfFromTree(rootNode),
    result,
    moveCount: line.length - 1,
    // Reviewing an old game should not move it to the top of the list.
    updatedAt: previous?.result ? previous.updatedAt : Date.now(),
  };
}

/** The AI Sensei-style shell: play against the bot, review, practise. */
export const SenseiApp: React.FC = () => {
  const [ranks, setRanks] = useState<RankBook>(() => loadRankBook());
  const [meta, setMeta] = useState<SessionMeta | null>(() => {
    // A session with no saved game behind it is a leftover from an older build.
    const session = loadSession();
    if (session && !loadSavedGames().some((g) => g.id === gameIdFor(session))) {
      saveSession(null);
      return null;
    }
    return session;
  });
  const [games, setGames] = useState<SavedGame[]>(() => loadSavedGames());
  const [problems, setProblems] = useState<Problem[]>(() => loadProblems());
  const [prefs, setPrefs] = useState<Preferences>(() => loadPreferences());
  const [lastConfig, setLastConfig] = useState<GameConfig | null>(null);
  const [tab, setTab] = useState<Tab>('play');
  const [view, setView] = useState<View>(null);
  const [toast, setToast] = useState<string | null>(null);
  // The player's level, from the ranked rating: for the board size on screen,
  // else any size they have a rating for, else 5 kyu.
  const boardSize = useGameStore((s) => s.board.length);
  const ratedSize = ([boardSize, 19, 13, 9] as const).find((n) => (n === 9 || n === 13 || n === 19) && ratingOf(ranks[n]) !== null);
  const ratedState = ratedSize === 9 || ratedSize === 13 || ratedSize === 19 ? ranks[ratedSize] : null;
  const reviewRank: Rank = ratedState ? rankForRating(ratingOf(ratedState)!) : '5k';

  // Review is the point of this mode, and the bundled test net is too weak for it.
  useEffect(() => {
    const { settings, updateSettings } = useGameStore.getState();
    if (isSmallKataGoModel(settings.katagoModelUrl)) {
      updateSettings({ katagoModelUrl: publicUrl(KATAGO_RECOMMENDED_MODEL_PATH) });
    }
  }, []);

  // A reload drops the store's game; bring back an unfinished one where it was left.
  useEffect(() => {
    if (!meta) return;
    const saved = loadSavedGames().find((g) => g.id === gameIdFor(meta));
    if (saved && !saved.result) resumeGame(meta, saved.sgf);
    // Only on start.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the current game in the list as it changes.
  useEffect(() => {
    if (!meta) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => setGames((list) => {
      const next = upsertGame(list, snapshot(meta, list.find((g) => g.id === gameIdFor(meta))));
      storeSavedGames(next);
      return next;
    });
    const unsubscribe = useGameStore.subscribe((state, prev) => {
      if (state.treeVersion === prev.treeVersion && state.rootNode === prev.rootNode) return;
      // Never file the detail mode's game under this one.
      if (state.rootNode.children.length === 0 || !ownsStoreGame()) return;
      clearTimeout(timer);
      timer = setTimeout(save, 800);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [meta]);

  useEffect(() => { log('screen', { tab, view: view ?? '-' }); }, [tab, view]);

  // Paint and decode the stone pictures before the first board is drawn.
  useEffect(() => { stoneSprites(); }, []);

  // The cloud KataGo, when its secret is set: wake it now so the first move is quick.
  useEffect(() => {
    setCloudConfig(prefs.cloudToken ? {
      url: prefs.cloudUrl,
      token: prefs.cloudToken,
      onEvent: (event, data) => {
        // Every fallback, and the bot's quick searches; not each review search.
        if (event === 'fallback' || (typeof data.visits === 'number' && data.visits <= 64)) log(`cloud-${event}`, data);
      },
    } : null);
    warmUpCloud();
  }, [prefs.cloudUrl, prefs.cloudToken]);

  // Device sync: games, ranks and problems, through the cloud with the same secret.
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'off' });
  const syncing = useRef(false);
  const runSync = useCallback(async () => {
    if (!prefs.cloudToken || syncing.current || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    syncing.current = true;
    setSyncStatus((s) => ({ ...s, state: 'syncing' }));
    try {
      const local = { v: 1 as const, games: loadSavedGames(), ranks: loadRankBook(), problems: loadProblems(), deleted: loadTombstones() };
      const merged = await syncWithServer(syncUrlFor(prefs.cloudUrl), prefs.cloudToken, local);
      storeTombstones(merged.deleted);
      if (JSON.stringify(merged.games) !== JSON.stringify(local.games)) { storeSavedGames(merged.games); setGames(merged.games); }
      if (JSON.stringify(merged.ranks) !== JSON.stringify(local.ranks)) { saveRankBook(merged.ranks); setRanks(merged.ranks); }
      if (JSON.stringify(merged.problems) !== JSON.stringify(local.problems)) { storeProblems(merged.problems); setProblems(merged.problems); }
      log('sync-ok', { games: merged.games.length, problems: merged.problems.length });
      setSyncStatus({ state: 'ok', at: Date.now(), games: merged.games.length });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log('sync-error', { error: message });
      setSyncStatus({ state: 'error', at: Date.now(), message });
    } finally {
      syncing.current = false;
    }
  }, [prefs.cloudToken, prefs.cloudUrl]);

  // On start, when the app comes back to the front, and a while after things change
  // (not during a game: every move would send the whole list).
  const inGame = view === 'game';
  useEffect(() => {
    if (!prefs.cloudToken) return;
    void runSync();
    const onVisible = () => { if (document.visibilityState === 'visible') void runSync(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [prefs.cloudToken, runSync]);
  useEffect(() => {
    if (!prefs.cloudToken || inGame) return;
    const timer = setTimeout(() => void runSync(), 8000);
    return () => clearTimeout(timer);
  }, [games, ranks, problems, inGame, prefs.cloudToken, runSync]);

  const updateRanks = useCallback((book: RankBook) => { setRanks(book); saveRankBook(book); }, []);
  const updatePrefs = (next: Preferences) => { setPrefs(next); storePreferences(next); };
  const updateProblems = (next: Problem[]) => { setProblems(next); storeProblems(next); };

  const begin = (config: GameConfig) => {
    setLastConfig(config);
    warmUpCloud();
    const started = startGame({ ...config, timeControl: prefs.timeControl });
    log('game-start', { kind: started.kind, size: started.size, ai: started.aiRank, human: started.humanColor, time: prefs.timeControl.mainSec, byo: prefs.timeControl.byoSec });
    setMeta(started);
    setView('game');
  };

  const replay = () => {
    if (!lastConfig) { setView(null); setTab('play'); return; }
    // A ranked rematch is against whatever rank the last result left.
    const rating = lastConfig.kind === 'ranked' ? ratingOf(ranks[lastConfig.size as 9 | 13 | 19]) : null;
    const rank = rating !== null ? rankForRating(rating) : lastConfig.aiRank;
    begin({ ...lastConfig, aiRank: rank });
  };

  const openGame = (game: SavedGame) => {
    setMeta(game.meta);
    saveSession(game.meta);
    setLastConfig({ kind: game.meta.kind, size: game.meta.size, aiRank: game.meta.aiRank, handicap: 0, komi: 6.5 });
    if (game.result) {
      loadSgfToEnd(game.sgf);
      setView('review');
    } else {
      resumeGame(game.meta, game.sgf);
      setView('game');
    }
  };

  /** Back to the game in progress, reloading it if the detail mode replaced the board. */
  const resume = () => {
    if (!meta) return;
    if (!ownsStoreGame()) {
      const saved = games.find((g) => g.id === gameIdFor(meta));
      if (!saved) { saveSession(null); setMeta(null); setToast('続きの対局が見つかりませんでした'); return; }
      resumeGame(meta, saved.sgf);
    }
    setView('game');
  };

  const navigate = (target: Tab) => { setView(null); setTab(target); };

  /** Back from a resumed game to the reviewed game, at the move it started from. */
  const backToReview = () => {
    const from = meta?.from;
    const game = from && games.find((g) => g.id === from.gameId);
    if (!from || !game) { setToast('元の棋譜が見つかりませんでした'); return; }
    openReviewAt(from.move);
    setMeta(game.meta);
    saveSession(game.meta);
    loadSgfToEnd(game.sgf);
    setLastConfig(null);
    setView('review');
  };

  /** Add the position before `node`'s game move; `quiet` for the automatic adds from mistakes. */
  const addProblem = (node: GameNode, quiet = false) => {
    const live = useGameStore.getState();
    const analysis = live.currentNode === node ? live.analysisData ?? node.analysis : node.analysis;
    const next = node.children[0]?.move ?? null;
    const problem = createProblem({
      board: node.gameState.board,
      toPlay: node.gameState.currentPlayer,
      moves: analysis?.moves ?? [],
      played: next && next.x >= 0 ? { x: next.x, y: next.y } : null,
      now: Date.now(),
    });
    if (!problem) { if (!quiet) setToast('この局面はまだ解析中です'); return; }
    if (quiet) {
      setProblems((list) => {
        if (list.some((p) => sameProblem(p, problem))) return list;
        const next = [problem, ...list];
        storeProblems(next);
        return next;
      });
      return;
    }
    if (problems.some((p) => sameProblem(p, problem))) { setToast('この局面はもう問題集にあります'); return; }
    updateProblems([problem, ...problems]);
    setToast('問題集に追加しました');
  };

  const playFromHere = (node: GameNode) => {
    // Play the position against a bot of the player's own strength, as a practice
    // game, remembering where it came from for "検討に戻る".
    const rank = reviewRank;
    let move = 0;
    for (let n = branchPoint(node); n.parent; n = n.parent) move++;
    const from = meta && games.some((g) => g.id === gameIdFor(meta)) ? { gameId: gameIdFor(meta), move } : undefined;
    const next = startFromPosition(node, rank, from);
    setMeta(next);
    setLastConfig(null);
    setView('game');
    setToast(`この局面から対局を再開します（相手: AI ${rankLabel(rank)}）`);
  };

  const boardPrefs = useMemo(() => ({ showCoords: prefs.showCoords }), [prefs.showCoords]);
  const currentSaved = meta ? games.find((g) => g.id === gameIdFor(meta)) : undefined;
  const ongoing = meta && !currentSaved?.result && view !== 'game' ? meta : null;

  let content: React.ReactNode;
  if (view === 'game' && meta) {
    content = (
      <GameScreen
        key={meta.startedAt}
        meta={meta}
        ranks={ranks}
        confirmMoves={prefs.confirmMoves}
        onRanksChange={updateRanks}
        onMetaChange={setMeta}
        onReplay={replay}
        onReview={() => { log('open-review', { from: 'game' }); setView('review'); }}
        onBackToReview={meta.from ? backToReview : undefined}
      />
    );
  } else if (view === 'review') {
    content = (
      <ReviewScreen
        key={meta?.startedAt ?? 0}
        playerRank={reviewRank}
        onAddProblem={addProblem}
        onAutoProblem={(node) => addProblem(node, true)}
        onPlayFromHere={playFromHere}
        humanColor={meta?.humanColor ?? null}
      />
    );
  } else if (tab === 'play') {
    content = <PlayScreen ranks={ranks} onRanksChange={updateRanks} onStart={begin} ongoing={ongoing} onResume={resume} />;
  } else if (tab === 'games') {
    content = (
      <GamesScreen
        games={games}
        onOpen={openGame}
        onImport={(sgf) => {
          try {
            loadSgfToEnd(sgf);
          } catch (e) {
            setToast(e instanceof Error ? `読み込めませんでした: ${e.message}` : '読み込めませんでした');
            return;
          }
          setMeta(null);
          setView('review');
        }}
        onDelete={(id) => { markDeleted('games', id); setGames((list) => { const next = removeGame(list, id); storeSavedGames(next); return next; }); }}
      />
    );
  } else if (tab === 'problems') {
    content = (
      <ProblemsScreen
        problems={problems}
        onAttempt={(id, correct) => updateProblems(recordAttempt(problems, id, correct))}
        onDelete={(id) => { markDeleted('problems', id); updateProblems(problems.filter((p) => p.id !== id)); }}
      />
    );
  } else {
    content = <SettingsScreen prefs={prefs} onChange={updatePrefs} syncStatus={syncStatus} onSyncNow={() => void runSync()} />;
  }

  return (
    <BoardPrefsContext.Provider value={boardPrefs}>
    <div className={`sensei-app${view ? ' is-immersive' : ''}`}>
      <div className="sensei-shell">
        <nav className="sensei-tabbar" aria-label="メインメニュー">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? 'is-active' : ''}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => { setView(null); setTab(t.id); }}
            >
              {t.icon}
              <span>{t.label}</span>
              {t.id === 'play' && ongoing && <span className="sensei-dot" aria-label="対局中" />}
            </button>
          ))}
        </nav>
        <main className="sensei-main">
          <ErrorBoundary key={`${tab}:${view ?? '-'}`} onReset={() => navigate('play')}>{content}</ErrorBoundary>
        </main>
      </div>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
    </BoardPrefsContext.Provider>
  );
};
