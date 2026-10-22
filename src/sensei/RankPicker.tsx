import React from 'react';
import { displayRating, RANKS, rankLabel, ratingForRank, shiftRank, type Rank, type RankHistoryEntry } from './rankLadder';

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

/**
 * The rating after each ranked game, oldest on the left: a plain line with
 * rank ticks on the left and dates below.
 */
export const RankHistoryChart: React.FC<{ history: readonly RankHistoryEntry[] }> = ({ history }) => {
  const recent = history.slice(-30);
  if (recent.length === 0) {
    return <p className="sensei-muted">ランク戦を打つと、ここに棋力の移り変わりが表示されます。</p>;
  }
  // Games from before ratings carry only ranks; place them at those ranks' ratings.
  const values = [
    recent[0]!.ratingBefore ?? ratingForRank(recent[0]!.before),
    ...recent.map((h) => h.ratingAfter ?? ratingForRank(h.after)),
  ].map(displayRating);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(15, (hi - lo) * 0.1);
  const min = lo - pad;
  const max = hi + pad;
  const W = 320;
  const H = 150;
  const left = 38;
  const right = 8;
  const top = 8;
  const bottom = 22;
  const x = (i: number) => left + (i / Math.max(1, values.length - 1)) * (W - left - right);
  const y = (v: number) => top + ((max - v) / (max - min)) * (H - top - bottom);
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('');
  // A tick at each rank inside the range (ranks sit closer together among kyu), thinned to about five.
  const inRange = RANKS.filter((r) => { const v = displayRating(ratingForRank(r)); return v >= min && v <= max; });
  const every = Math.max(1, Math.ceil(inRange.length / 5));
  const ticks = inRange.filter((_, i) => i % every === 0).map((r) => ({ rank: r, v: displayRating(ratingForRank(r)) }));
  const day = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
  return (
    <figure className="sensei-rank-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`レートの推移: ${values[0]}から${values[values.length - 1]}`}>
        {ticks.map(({ rank, v }) => (
          <g key={rank}>
            <line x1={left} y1={y(v)} x2={W - right} y2={y(v)} stroke="var(--s-border)" strokeWidth={1} />
            <text x={left - 6} y={y(v) + 3.5} fontSize={10} textAnchor="end" fill="var(--s-muted)">{rankLabel(rank)}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--s-accent)" strokeWidth={2.2} strokeLinejoin="round" />
        <text x={left} y={H - 6} fontSize={10} fill="var(--s-muted)">{day(recent[0]!.at)}</text>
        <text x={W - right} y={H - 6} fontSize={10} textAnchor="end" fill="var(--s-muted)">{day(recent[recent.length - 1]!.at)}</text>
      </svg>
    </figure>
  );
};
