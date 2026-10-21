/** What 設定 shows about device sync. */
export type SyncStatus =
  | { state: 'off' }
  | { state: 'syncing'; at?: number; games?: number; message?: string }
  | { state: 'ok'; at: number; games: number }
  | { state: 'error'; at: number; message: string };

/** The sync endpoint sits beside the analysis one in the same Modal app. */
export const syncUrlFor = (cloudUrl: string): string => cloudUrl.replace('-katago-web.', '-sync.');
