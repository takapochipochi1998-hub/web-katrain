import React, { useCallback, useEffect, useState } from 'react';
import { isSmallKataGoModel, KATAGO_RECOMMENDED_MODEL_PATH } from '../engine/katago/modelDefaults';
import { useGameStore } from '../store/gameStore';
import { publicUrl } from '../utils/publicUrl';
import { GameScreen } from './GameScreen';
import { PlayScreen } from './PlayScreen';
import { ReviewScreen } from './ReviewScreen';
import { loadRankBook, saveRankBook, type RankBook } from './rankLadder';
import { loadSession, startGame, type GameConfig, type SessionMeta } from './session';
import { setUiMode } from './uiMode';

type Screen = 'play' | 'game' | 'review';

/** The AI Sensei-style shell: play against the bot, then review. */
export const SenseiApp: React.FC = () => {
  const [ranks, setRanks] = useState<RankBook>(() => loadRankBook());
  const [meta, setMeta] = useState<SessionMeta | null>(() => loadSession());
  const [lastConfig, setLastConfig] = useState<GameConfig | null>(null);
  const [screen, setScreen] = useState<Screen>('play');

  // Review is the point of this mode, and the bundled test net is too weak for it.
  useEffect(() => {
    const { settings, updateSettings } = useGameStore.getState();
    if (isSmallKataGoModel(settings.katagoModelUrl)) {
      updateSettings({ katagoModelUrl: publicUrl(KATAGO_RECOMMENDED_MODEL_PATH) });
    }
  }, []);

  const updateRanks = useCallback((book: RankBook) => {
    setRanks(book);
    saveRankBook(book);
  }, []);

  const begin = (config: GameConfig) => {
    setLastConfig(config);
    setMeta(startGame(config));
    setScreen('game');
  };

  const replay = () => {
    if (!lastConfig || !meta) { setScreen('play'); return; }
    // A ranked rematch is against whatever rank the last result left.
    const rank = lastConfig.kind === 'ranked' ? ranks[lastConfig.size as 9 | 13 | 19].rank ?? lastConfig.aiRank : lastConfig.aiRank;
    begin({ ...lastConfig, aiRank: rank });
  };

  return (
    <div className="sensei-app">
      <nav className="sensei-nav" aria-label="メインメニュー">
        <span className="sensei-logo">碁トレ</span>
        <button type="button" className={screen === 'play' ? 'is-active' : ''} onClick={() => setScreen('play')}>AIと対局</button>
        {meta && (
          <button type="button" className={screen === 'game' ? 'is-active' : ''} onClick={() => setScreen('game')}>対局</button>
        )}
        {meta && (
          <button type="button" className={screen === 'review' ? 'is-active' : ''} onClick={() => setScreen('review')}>検討</button>
        )}
        <button type="button" className="sensei-nav-detail" onClick={() => setUiMode('classic')}>詳細モード</button>
      </nav>
      <main className="sensei-main">
        {screen === 'play' && <PlayScreen ranks={ranks} onRanksChange={updateRanks} onStart={begin} />}
        {screen === 'game' && meta && (
          <GameScreen
            key={meta.startedAt}
            meta={meta}
            ranks={ranks}
            onRanksChange={updateRanks}
            onMetaChange={setMeta}
            onReplay={replay}
            onReview={() => setScreen('review')}
          />
        )}
        {screen === 'review' && <ReviewScreen key={meta?.startedAt ?? 0} onPlayAgain={() => setScreen('play')} />}
      </main>
    </div>
  );
};
