import React, { useState } from 'react';
import type { BoardSize, Player } from '../types';
import { RankPicker, Segmented } from './RankPicker';
import {
  rankLabel,
  setRank,
  shiftRank,
  type Rank,
  type RankBook,
  type RankedBoardSize,
} from './rankLadder';
import type { GameConfig } from './session';

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
};

/** "AIと対局": ranked tabs per board size and a free game form. */
export const PlayScreen: React.FC<Props> = ({ ranks, onRanksChange, onStart }) => {
  const [tab, setTab] = useState<Tab>(19);
  return (
    <div className="sensei-page">
      <h1 className="sensei-title">AIと対局</h1>
      <div className="sensei-tabs">
        {TAB_OPTIONS.map((o) => (
          <button key={String(o.value)} type="button" className={tab === o.value ? 'is-active' : ''} onClick={() => setTab(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      {tab === 'free'
        ? <FreeGameForm onStart={onStart} />
        : <RankedPanel size={tab} ranks={ranks} onRanksChange={onRanksChange} onStart={onStart} />}
    </div>
  );
};

const RankedPanel: React.FC<Props & { size: RankedBoardSize }> = ({ size, ranks, onRanksChange, onStart }) => {
  const state = ranks[size];
  const [initial, setInitial] = useState<Rank>('10k');
  const [humanColor, setHumanColor] = useState<Player>('black');

  if (!state.rank) {
    return (
      <div className="sensei-card space-y-4">
        <p>{size}路のランク戦は初めてです。最初の棋力を選んでください。勝てば1つ強いAI、負ければ1つ弱いAIと次に対局します。</p>
        <RankPicker value={initial} onChange={setInitial} />
        <button type="button" className="sensei-primary" onClick={() => onRanksChange(setRank(ranks, size, initial))}>
          この棋力で始める
        </button>
      </div>
    );
  }

  const rank = state.rank;
  const recent = state.history.slice(-10).reverse();
  return (
    <div className="space-y-4">
      <div className="sensei-card space-y-4">
        <div className="flex items-baseline justify-between">
          <span>現在の棋力</span>
          <span className="text-2xl font-bold">{rankLabel(rank)}</span>
        </div>
        <div className="sensei-row">
          <span>プレイヤーの手番</span>
          <Segmented options={[{ value: 'black', label: '黒' }, { value: 'white', label: '白' }]} value={humanColor} onChange={setHumanColor} />
        </div>
        <button
          type="button"
          className="sensei-primary"
          onClick={() => onStart({ kind: 'ranked', size, aiRank: rank, humanColor, handicap: 0, komi: 6.5 })}
        >
          対局開始（AI {rankLabel(rank)}）
        </button>
        <div className="flex gap-2 text-sm">
          <button type="button" className="sensei-secondary flex-1" onClick={() => onRanksChange(setRank(ranks, size, shiftRank(rank, -1)))}>
            棋力を1つ下げる（{rankLabel(shiftRank(rank, -1))}）
          </button>
          <button type="button" className="sensei-secondary flex-1" onClick={() => onRanksChange(setRank(ranks, size, shiftRank(rank, 1)))}>
            棋力を1つ上げる（{rankLabel(shiftRank(rank, 1))}）
          </button>
        </div>
      </div>
      {recent.length > 0 && (
        <div className="sensei-card">
          <h2 className="mb-2 font-bold">棋力の推移</h2>
          <ul className="space-y-1 text-sm">
            {recent.map((h) => (
              <li key={h.at} className="flex justify-between">
                <span>{new Date(h.at).toLocaleDateString('ja-JP')}</span>
                <span>{h.outcome === 'win' ? '勝ち' : h.outcome === 'loss' ? '負け' : '持碁'}</span>
                <span>{rankLabel(h.before)} → {rankLabel(h.after)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const FreeGameForm: React.FC<{ onStart: (config: GameConfig) => void }> = ({ onStart }) => {
  const [size, setSize] = useState<BoardSize>(19);
  const [aiRank, setAiRank] = useState<Rank>('5k');
  const [humanColor, setHumanColor] = useState<Player>('black');
  const [showDetails, setShowDetails] = useState(false);
  const [handicap, setHandicap] = useState(0);
  const [komi, setKomi] = useState(6.5);
  const maxHandicap = size === 9 ? 5 : 9;

  return (
    <div className="sensei-card space-y-4">
      <div className="sensei-row">
        <span>盤面</span>
        <Segmented
          options={[{ value: 9, label: '9x9' }, { value: 13, label: '13x13' }, { value: 19, label: '19x19' }]}
          value={size}
          onChange={(s) => { setSize(s); setHandicap((h) => Math.min(h, s === 9 ? 5 : 9)); }}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="sensei-ai-rank">AIの棋力（レベル）</label>
        <RankPicker id="sensei-ai-rank" value={aiRank} onChange={setAiRank} />
      </div>
      <div className="sensei-row">
        <span>プレイヤーの手番</span>
        <Segmented options={[{ value: 'black', label: '黒' }, { value: 'white', label: '白' }]} value={humanColor} onChange={setHumanColor} />
      </div>
      <button type="button" className="text-sm underline" onClick={() => setShowDetails((v) => !v)}>
        詳細設定 {showDetails ? '▲' : '▼'}
      </button>
      {showDetails && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="sensei-handicap">置石: {handicap}</label>
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
          <div className="space-y-1">
            <label htmlFor="sensei-komi">コミ: {komi}</label>
            <input
              id="sensei-komi"
              type="range"
              min={-9.5}
              max={9.5}
              step={1}
              value={komi}
              onChange={(e) => setKomi(Number(e.target.value))}
              className="sensei-range w-full"
            />
          </div>
        </div>
      )}
      <button
        type="button"
        className="sensei-primary"
        onClick={() => onStart({ kind: 'free', size, aiRank, humanColor, handicap, komi })}
      >
        対局開始
      </button>
    </div>
  );
};
