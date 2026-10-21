import { describe, expect, it } from 'vitest';
import { formatClock, spendTime, startClock, viewClock, type TimeControl } from '../src/sensei/clock';

const tc: TimeControl = { mainSec: 60, byoSec: 30, periods: 3 };

describe('player clock', () => {
  it('runs main time down first', () => {
    const c = startClock(tc);
    expect(viewClock(c, tc, 20)).toMatchObject({ secondsLeft: 40, inByoyomi: false, flagged: false });
    expect(spendTime(c, tc, 20)).toEqual({ mainLeft: 40, periodsLeft: 3 });
  });

  it('enters byo-yomi and keeps a period that was not used up', () => {
    const c = startClock(tc);
    expect(viewClock(c, tc, 75)).toMatchObject({ secondsLeft: 15, inByoyomi: true, periodsLeft: 3 });
    expect(spendTime(c, tc, 75)).toEqual({ mainLeft: 0, periodsLeft: 3 });
    expect(spendTime(c, tc, 95)).toEqual({ mainLeft: 0, periodsLeft: 2 });
  });

  it('flags when every period is gone or there is no byo-yomi', () => {
    const c = startClock(tc);
    expect(viewClock(c, tc, 60 + 90).flagged).toBe(true);
    expect(spendTime(c, tc, 151)).toBeNull();
    const suddenDeath: TimeControl = { mainSec: 10, byoSec: 0, periods: 0 };
    expect(viewClock(startClock(suddenDeath), suddenDeath, 11).flagged).toBe(true);
  });

  it('formats minutes and seconds', () => {
    expect(formatClock(605.2)).toBe('10:06');
    expect(formatClock(-1)).toBe('0:00');
  });
});
