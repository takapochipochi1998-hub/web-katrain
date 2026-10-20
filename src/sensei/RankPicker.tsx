import React from 'react';
import { RANKS, rankLabel, shiftRank, type Rank, type RankHistoryEntry } from './rankLadder';

/** AI Sensei's strength control: − / slider / + around a rank label. */
export const RankPicker: React.FC<{ value: Rank; onChange: (rank: Rank) => void; id?: string }> = ({ value, onChange, id }) => (
  <div className="flex items-center gap-2">
    <button type="button" className="sensei-step" aria-label="1つ弱く" onClick={() => onChange(shiftRank(value, -1))}>−</button>
    <input
      id={id}
      type="range"
      min={0}
      max={RANKS.length - 1}
      value={RANKS.indexOf(value)}
      onChange={(e) => onChange(RANKS[Number(e.target.value)]!)}
      className="sensei-range min-w-0 flex-1"
      aria-valuetext={rankLabel(value)}
    />
    <span className="sensei-rank-value">{rankLabel(value)}</span>
    <button type="button" className="sensei-step" aria-label="1つ強く" onClick={() => onChange(shiftRank(value, 1))}>＋</button>
  </div>
);

/** The rank after each ranked game, oldest on the left. */
export const RankHistoryChart: React.FC<{ history: readonly RankHistoryEntry[] }> = ({ history }) => {
  const recent = history.slice(-30);
  if (recent.length < 2) return null;
  const values = [RANKS.indexOf(recent[0]!.before), ...recent.map((h) => RANKS.indexOf(h.after))];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const W = 300;
  const H = 80;
  const span = Math.max(1, max - min);
  const x = (i: number) => (i / (values.length - 1)) * (W - 12) + 6;
  const y = (v: number) => H - 10 - ((v - min) / span) * (H - 24);
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="棋力の推移">
      <path d={path} fill="none" stroke="var(--s-accent)" strokeWidth={2.5} strokeLinejoin="round" />
      {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={2.8} fill="var(--s-accent)" />)}
      <text x={4} y={12} fontSize={10} fill="var(--s-muted)">{rankLabel(RANKS[max]!)}</text>
      <text x={4} y={H - 2} fontSize={10} fill="var(--s-muted)">{rankLabel(RANKS[min]!)}</text>
    </svg>
  );
};
