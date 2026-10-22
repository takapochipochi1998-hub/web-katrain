import React, { useState } from 'react';
import type { BoardSize } from '../types';
import { RankHistoryChart, RankPicker } from './RankPicker';
import { displayRating, PLACEMENT_GAMES, placementLeft, playingRating, rankForRating, rankLabel, type Rank, type RankBook, type RankedBoardSize } from './rankLadder';
import type { GameConfig, SessionMeta } from './session';
import { Header, Segmented } from './ui';

type Tab = 'ranked' | 'free';

const TAB_OPTIONS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: 'ranked', label: 'ランク戦' },
  { value: 'free', label: '練習対局' },
];

const SIZE_OPTIONS: ReadonlyArray<{ value: RankedBoardSize; label: string }> = [
  { value: 9, label: '9路' },
  { value: 13, label: '13路' },
  { value: 19, label: '19路' },
];

const KOMI_FOR_HANDICAP = (handicap: number) => (handicap > 0 ? 0.5 : 6.5);

type Props = {
  ranks: RankBook;
  onStart: (config: GameConfig) => void;
  /** A game still in progress, offered for resuming. */
  ongoing: SessionMeta | null;
  onResume: () => void;
  /** The board size the player has used most in their recent games. */
  preferredSize: RankedBoardSize;
};

/** "AIと対局": ranked play (a rating per board size) and practice games. */
export const PlayScreen: React.FC<Props> = ({ ranks, onStart, ongoing, onResume, preferredSize }) => {
  const [tab, setTab] = useState<Tab>('ranked');
  const [size, setSize] = useState<RankedBoardSize>(preferredSize);
  return (
    <>
      <Header title="AIと対局" />
      <div className="sensei-page">
        {ongoing && (
          <button type="button" className="sensei-card sensei-list-item" onClick={onResume}>
            <span className="sensei-stone sensei-stone-black" aria-hidden />
            <span className="sensei-list-main">
              <span className="sensei-list-title">対局を続ける</span>
              <span className="sensei-muted block">
                {ongoing.size}路 · {ongoing.kind === 'ranked'
                  ? placementLeft(ranks[ongoing.size as RankedBoardSize] ?? ranks[19]) > 0 ? 'ランク戦（判定中）' : `AI ${rankLabel(ongoing.aiRank)} · ランク戦`
                  : `AI ${rankLabel(ongoing.aiRank)} · 練習対局`}
              </span>
            </span>
            <span aria-hidden>›</span>
          </button>
        )}
        <div className="sensei-chips" role="tablist">
          {TAB_OPTIONS.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              role="tab"
              aria-selected={tab === o.value}
              className={tab === o.value ? 'is-active' : ''}
              onClick={() => setTab(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        {tab === 'free' ? (
          <FreeGameForm onStart={onStart} initialSize={preferredSize} />
        ) : (
          <>
            <div className="sensei-size-pick">
              <Segmented options={SIZE_OPTIONS} value={size} onChange={setSize} label="盤の大きさ" />
            </div>
            <RankedPanel key={size} size={size} ranks={ranks} onStart={onStart} />
          </>
        )}
      </div>
    </>
  );
};

const RankedPanel: React.FC<Pick<Props, 'ranks' | 'onStart'> & { size: RankedBoardSize }> = ({ size, ranks, onStart }) => {
  const state = ranks[size];
  // Never played at this size: start at 10 kyu; the first games find the level fast.
  const rating = playingRating(state);
  const rank = rankForRating(rating);
  const left = placementLeft(state);
  const wins = state.history.filter((h) => h.outcome === 'win').length;
  const losses = state.history.filter((h) => h.outcome === 'loss').length;
  return (
    <>
      <div className="sensei-card sensei-stack">
        <div className="flex items-end justify-between">
          <div>
            <div className="sensei-muted">{size}路のレート</div>
            {left > 0 ? (
              <>
                <div className="sensei-big">判定中</div>
                <div className="sensei-rank-equiv">{PLACEMENT_GAMES - left}/{PLACEMENT_GAMES}局 · あと{left}局でレートが決まります</div>
              </>
            ) : (
              <>
                <div className="sensei-big tabular-nums">{displayRating(rating)}</div>
                <div className="sensei-rank-equiv">{rankLabel(rank)}</div>
              </>
            )}
          </div>
          <div className="sensei-muted text-right">{wins}勝 {losses}敗</div>
        </div>
        <button
          type="button"
          className="sensei-primary sensei-block"
          onClick={() => onStart({ kind: 'ranked', size, aiRank: rank, handicap: 0, komi: 6.5 })}
        >
          対局する
        </button>
      </div>
      {left === 0 && state.history.length > 0 && (
        <div className="sensei-card">
          <h2>レートの推移</h2>
          <RankHistoryChart history={state.history} />
        </div>
      )}
    </>
  );
};

const FreeGameForm: React.FC<{ onStart: (config: GameConfig) => void; initialSize: BoardSize }> = ({ onStart, initialSize }) => {
  const [size, setSize] = useState<BoardSize>(initialSize);
  const [aiRank, setAiRank] = useState<Rank>('5k');
  const [showDetails, setShowDetails] = useState(false);
  const [handicap, setHandicap] = useState(0);
  const [komi, setKomi] = useState(6.5);
  const maxHandicap = size === 9 ? 5 : 9;

  return (
    <div className="sensei-card sensei-stack">
      <div className="sensei-row">
        <span>盤の大きさ</span>
        <Segmented
          options={[{ value: 9, label: '9路' }, { value: 13, label: '13路' }, { value: 19, label: '19路' }]}
          value={size}
          onChange={(s) => { setSize(s); setHandicap((h) => Math.min(h, s === 9 ? 5 : 9)); }}
          label="盤の大きさ"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="sensei-ai-rank">AIの棋力</label>
        <RankPicker id="sensei-ai-rank" value={aiRank} onChange={setAiRank} />
      </div>
      <button type="button" className="sensei-ghost self-start !px-0" onClick={() => setShowDetails((v) => !v)}>
        詳細設定 {showDetails ? '▲' : '▼'}
      </button>
      {showDetails && (
        <div className="sensei-stack">
          <div className="flex flex-col gap-1">
            <label htmlFor="sensei-handicap">置石: {handicap === 0 ? 'なし' : `${handicap}子`}</label>
            <input
              id="sensei-handicap"
              type="range"
              min={0}
              max={maxHandicap}
              value={handicap}
              onChange={(e) => { const h = Number(e.target.value); setHandicap(h); setKomi(KOMI_FOR_HANDICAP(h)); }}
              className="sensei-range w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="sensei-komi">コミ: {komi}目</label>
            <input id="sensei-komi" type="range" min={-9.5} max={9.5} step={1} value={komi} onChange={(e) => setKomi(Number(e.target.value))} className="sensei-range w-full" />
          </div>
        </div>
      )}
      <button
        type="button"
        className="sensei-primary sensei-block"
        onClick={() => onStart({ kind: 'free', size, aiRank, handicap, komi })}
      >
        対局開始
      </button>
    </div>
  );
};
