/**
 * The player's clock: main time, then Japanese byo-yomi (a period is used up
 * only when a move takes longer than it). The bot's time is not kept.
 */
export type TimeControl = {
  /** Main time in seconds; 0 for none. */
  mainSec: number;
  /** Byo-yomi period in seconds; 0 for none. */
  byoSec: number;
  periods: number;
};

export type Clock = {
  mainLeft: number;
  periodsLeft: number;
};

export const NO_TIME_CONTROL: TimeControl = { mainSec: 0, byoSec: 0, periods: 0 };
export const BYO_PERIODS = 3;

export const hasClock = (tc: TimeControl | null | undefined): tc is TimeControl =>
  !!tc && (tc.mainSec > 0 || tc.byoSec > 0);

export const startClock = (tc: TimeControl): Clock => ({ mainLeft: tc.mainSec, periodsLeft: tc.byoSec > 0 ? tc.periods : 0 });

export type ClockView = {
  /** Seconds left in main time, or in the current byo-yomi period. */
  secondsLeft: number;
  inByoyomi: boolean;
  periodsLeft: number;
  flagged: boolean;
};

/** How the clock stands `elapsed` seconds into the player's turn. */
export function viewClock(clock: Clock, tc: TimeControl, elapsed: number): ClockView {
  if (elapsed <= clock.mainLeft) {
    return { secondsLeft: clock.mainLeft - elapsed, inByoyomi: false, periodsLeft: clock.periodsLeft, flagged: false };
  }
  if (tc.byoSec <= 0 || clock.periodsLeft <= 0) {
    return { secondsLeft: 0, inByoyomi: false, periodsLeft: 0, flagged: true };
  }
  const over = elapsed - clock.mainLeft;
  const spent = Math.floor(over / tc.byoSec);
  const periodsLeft = clock.periodsLeft - spent;
  if (periodsLeft <= 0) return { secondsLeft: 0, inByoyomi: true, periodsLeft: 0, flagged: true };
  return { secondsLeft: tc.byoSec - (over - spent * tc.byoSec), inByoyomi: true, periodsLeft, flagged: false };
}

/** The clock after a move that took `elapsed` seconds; null if the player ran out. */
export function spendTime(clock: Clock, tc: TimeControl, elapsed: number): Clock | null {
  const view = viewClock(clock, tc, elapsed);
  if (view.flagged) return null;
  if (!view.inByoyomi) return { mainLeft: clock.mainLeft - elapsed, periodsLeft: clock.periodsLeft };
  // Finishing inside a period resets it; only the periods fully used are gone.
  return { mainLeft: 0, periodsLeft: view.periodsLeft };
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
