import React, { useCallback, useState } from 'react';
import { GameScreen } from './GameScreen';
import { PlayScreen } from './PlayScreen';
import { loadRankBook, saveRankBook, type RankBook } from './rankLadder';
import { loadSession, startGame, type GameConfig, type SessionMeta } from './session';
import { setUiMode } from './uiMode';

type Screen = 'play' | 'game';

/** The AI Sensei-style shell: play against the bot, then review. */
export const SenseiApp: React.FC = () => {
  const [ranks, setRanks] = useState<RankBook>(() => loadRankBook());
  const [meta, setMeta] = useState<SessionMeta | null>(() => loadSession());
  const [lastConfig, setLastConfig] = useState<GameConfig | null>(null);
  const [screen, setScreen] = useState<Screen>('play');

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
          <button type="button" className={screen === 'game' ? 'is-active' : ''} onClick={() => setScreen('game')}>対局中の盤</button>
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
            // The review screen is the next step; until then the detail mode reviews.
            onReview={() => setUiMode('classic')}
          />
        )}
      </main>
    </div>
  );
};
