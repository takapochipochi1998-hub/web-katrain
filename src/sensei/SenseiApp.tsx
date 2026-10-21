import React, { useCallback, useEffect, useState } from 'react';
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
import { loadRankBook, rankLabel, saveRankBook, type Rank, type RankBook } from './rankLadder';
import { mainLine } from './reviewModel';
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
  const [reviewRank, setReviewRank] = useState<Rank>(() => {
    const book = loadRankBook();
    return book[19].rank ?? book[13].rank ?? book[9].rank ?? '5k';
  });

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
    const rank = lastConfig.kind === 'ranked' ? ranks[lastConfig.size as 9 | 13 | 19].rank ?? lastConfig.aiRank : lastConfig.aiRank;
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

  const addProblem = (node: GameNode) => {
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
    if (!problem) { setToast('この局面はまだ解析中です'); return; }
    if (problems.some((p) => sameProblem(p, problem))) { setToast('この局面はもう問題集にあります'); return; }
    updateProblems([problem, ...problems]);
    setToast('問題集に追加しました');
  };

  const playFromHere = (node: GameNode) => {
    // Play the position against a bot of the player's own strength.
    const rank = reviewRank;
    const next = startFromPosition(node, rank);
    setMeta(next);
    setLastConfig(null);
    setView('game');
    setToast(`この局面からAI ${rankLabel(rank)}と対局します`);
  };

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
        onNavigate={navigate}
      />
    );
  } else if (view === 'review') {
    content = (
      <ReviewScreen
        key={meta?.startedAt ?? 0}
        playerRank={reviewRank}
        onPlayerRankChange={setReviewRank}
        geminiApiKey={prefs.geminiApiKey}
        geminiModel={prefs.geminiModel}
        onNavigate={navigate}
        onAddProblem={addProblem}
        onPlayFromHere={playFromHere}
        onOpenSettings={() => { setView(null); setTab('settings'); }}
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
        onDelete={(id) => setGames((list) => { const next = removeGame(list, id); storeSavedGames(next); return next; })}
      />
    );
  } else if (tab === 'problems') {
    content = (
      <ProblemsScreen
        problems={problems}
        onAttempt={(id, correct) => updateProblems(recordAttempt(problems, id, correct))}
        onDelete={(id) => updateProblems(problems.filter((p) => p.id !== id))}
      />
    );
  } else {
    content = <SettingsScreen prefs={prefs} onChange={updatePrefs} />;
  }

  return (
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
  );
};
