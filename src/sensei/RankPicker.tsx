import React from 'react';
import { RANKS, rankLabel, shiftRank, type Rank } from './rankLadder';

/** AI Sensei's strength control: − / slider / + around a rank label. */
export const RankPicker: React.FC<{ value: Rank; onChange: (rank: Rank) => void; id?: string }> = ({ value, onChange, id }) => (
  <div className="flex items-center gap-2">
    <button type="button" className="sensei-step" aria-label="1つ弱く" onClick={() => onChange(shiftRank(value, -1))}>−</button>
    <div className="relative flex-1">
      <input
        id={id}
        type="range"
        min={0}
        max={RANKS.length - 1}
        value={RANKS.indexOf(value)}
        onChange={(e) => onChange(RANKS[Number(e.target.value)]!)}
        className="sensei-range w-full"
        aria-valuetext={rankLabel(value)}
      />
    </div>
    <span className="w-12 text-center font-bold tabular-nums">{rankLabel(value)}</span>
    <button type="button" className="sensei-step" aria-label="1つ強く" onClick={() => onChange(shiftRank(value, 1))}>＋</button>
  </div>
);

/** A row of mutually exclusive choices, like AI Sensei's segmented toggles. */
export function Segmented<T extends string | number>({ options, value, onChange }: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="sensei-segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'is-active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
