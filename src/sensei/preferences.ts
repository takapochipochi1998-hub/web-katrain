/** The simple mode's own settings, kept apart from web-katrain's. */
import { readLocalStorage, writeLocalStorage } from '../utils/storage';
import { NO_TIME_CONTROL, type TimeControl } from './clock';

export type Preferences = {
  /** Tap once to place a ghost stone, again to play it: guards against slips on a phone. */
  confirmMoves: boolean;
  /** The player's time limit for new games. */
  timeControl: TimeControl;
  /** Gemini API key for "AIに聞く"; stays on this device. */
  geminiApiKey: string;
  geminiModel: string;
  /** Cloud KataGo (Modal): its address and the shared secret; both stay on this device. */
  cloudUrl: string;
  cloudToken: string;
};

export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
export const DEFAULT_CLOUD_URL = 'https://takapochipochi1998-hub--go-ai-trainer-katago-usw-katago-web.us-west.modal.run';

export const defaultPreferences = (): Preferences => ({
  confirmMoves: true,
  timeControl: NO_TIME_CONTROL,
  geminiApiKey: '',
  geminiModel: DEFAULT_GEMINI_MODEL,
  cloudUrl: DEFAULT_CLOUD_URL,
  cloudToken: '',
});

const STORAGE_KEY = 'web-katrain:sensei-preferences:v1';

export function parsePreferences(raw: unknown): Preferences {
  const prefs = defaultPreferences();
  if (!raw || typeof raw !== 'object') return prefs;
  const r = raw as Partial<Record<keyof Preferences, unknown>>;
  if (typeof r.confirmMoves === 'boolean') prefs.confirmMoves = r.confirmMoves;
  const tc = r.timeControl as Partial<TimeControl> | undefined;
  if (tc && [tc.mainSec, tc.byoSec, tc.periods].every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)) {
    prefs.timeControl = { mainSec: tc.mainSec!, byoSec: tc.byoSec!, periods: tc.periods! };
  }
  if (typeof r.geminiApiKey === 'string') prefs.geminiApiKey = r.geminiApiKey.trim();
  if (typeof r.geminiModel === 'string' && r.geminiModel.trim()) prefs.geminiModel = r.geminiModel.trim();
  if (typeof r.cloudUrl === 'string' && /^https:\/\//.test(r.cloudUrl.trim())) prefs.cloudUrl = r.cloudUrl.trim();
  if (typeof r.cloudToken === 'string') prefs.cloudToken = r.cloudToken.trim();
  return prefs;
}

export function loadPreferences(): Preferences {
  try {
    return parsePreferences(JSON.parse(readLocalStorage(STORAGE_KEY) ?? 'null'));
  } catch {
    return defaultPreferences();
  }
}

export function storePreferences(prefs: Preferences): void {
  writeLocalStorage(STORAGE_KEY, JSON.stringify(prefs));
}
