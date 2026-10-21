import React, { useState } from 'react';
import type { BoardSize } from '../types';
import { RankHistoryChart, RankPicker } from './RankPicker';
import { rankLabel, setRank, shiftRank, type Rank, type RankBook, type RankedBoardSize } from './rankLadder';
import type { GameConfig, SessionMeta } from './session';
import { Header, Segmented } from './ui';

type Tab = RankedBoardSize | 'free';

const TAB_OPTIONS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: 19, label: '19路ランク戦' },
  { value: 13, label: '13路ランク戦' },
  { value: 9, label: '9路ランク戦' },
  { value: 'free', label: '自由対局' },
];

const KOMI_FOR_HANDICAP = (handicap: number) => (handicap > 0 ? 0.5 : 6.5);

type Props = {
  ranks: RankBook;
  onRanksChange: (book: RankBook) => void;
  onStart: (config: GameConfig) => void;
  /** A game still in progress, offered for resuming. */
  ongoing: SessionMeta | null;
  onResume: () => void;
};

/** "AIと対局": ranked tabs per board size and a free game form. */
export const PlayScreen: React.FC<Props> = ({ ranks, onRanksChange, onStart, ongoing, onResume }) => {
  const [tab, setTab] = useState<Tab>(19);
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
                {ongoing.size}路 · AI {rankLabel(ongoing.aiRank)} · {ongoing.kind === 'ranked' ? 'ランク戦' : '自由対局'}
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
        {tab === 'free'
          ? <FreeGameForm onStart={onStart} />
          : <RankedPanel key={tab} size={tab} ranks={ranks} onRanksChange={onRanksChange} onStart={onStart} />}
      </div>
    </>
  );
};

const RankedPanel: React.FC<Pick<Props, 'ranks' | 'onRanksChange' | 'onStart'> & { size: RankedBoardSize }> = ({ size, ranks, onRanksChange, onStart }) => {
  const state = ranks[size];
  const [initial, setInitial] = useState<Rank>('10k');

  if (!state.rank) {
    return (
      <div className="sensei-card sensei-stack">
        <h2>{size}路のランク戦をはじめる</h2>
        <p className="sensei-muted">最初の棋力を1回だけ選びます。勝てば1つ強いAI、負ければ1つ弱いAIと次に対局し、自分の棋力に合った相手へ自然に近づきます。</p>
        <RankPicker value={initial} onChange={setInitial} />
        <button type="button" className="sensei-primary sensei-block" onClick={() => onRanksChange(setRank(ranks, size, initial))}>
          {rankLabel(initial)}から始める
        </button>
      </div>
    );
  }

  const rank = state.rank;
  const wins = state.history.filter((h) => h.outcome === 'win').length;
  const losses = state.history.filter((h) => h.outcome === 'loss').length;
  return (
    <>
      <div className="sensei-card sensei-stack">
        <div className="flex items-end justify-between">
          <div>
            <div className="sensei-muted">{size}路の現在の棋力</div>
            <div className="sensei-big">{rankLabel(rank)}</div>
          </div>
          <div className="sensei-muted text-right">{wins}勝 {losses}敗</div>
        </div>
        <button
          type="button"
          className="sensei-primary sensei-block"
          onClick={() => onStart({ kind: 'ranked', size, aiRank: rank, handicap: 0, komi: 6.5 })}
        >
          AI {rankLabel(rank)}と対局する
        </button>
      </div>
      {state.history.length >= 2 && (
        <div className="sensei-card">
          <h2>棋力の推移</h2>
          <RankHistoryChart history={state.history} />
        </div>
      )}
      <div className="sensei-card">
        <h2>棋力の調整</h2>
        <div className="sensei-toolbar">
          <button type="button" className="sensei-secondary" onClick={() => onRanksChange(setRank(ranks, size, shiftRank(rank, -1)))}>
            1つ下げる（{rankLabel(shiftRank(rank, -1))}）
          </button>
          <button type="button" className="sensei-secondary" onClick={() => onRanksChange(setRank(ranks, size, shiftRank(rank, 1)))}>
            1つ上げる（{rankLabel(shiftRank(rank, 1))}）
          </button>
        </div>
      </div>
    </>
  );
};

const FreeGameForm: React.FC<{ onStart: (config: GameConfig) => void }> = ({ onStart }) => {
  const [size, setSize] = useState<BoardSize>(19);
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
      <p className="sensei-muted">手番（黒・白）は対局ごとにランダムに決まります。</p>
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
