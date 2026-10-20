/** The simple mode's own settings, kept apart from web-katrain's. */
import { readLocalStorage, writeLocalStorage } from '../utils/storage';

export type Preferences = {
  /** Tap once to place a ghost stone, again to play it: guards against slips on a phone. */
  confirmMoves: boolean;
  /** Show the score during play by default. */
  showScoreInGame: boolean;
  /** Gemini API key for "AIに聞く"; stays on this device. */
  geminiApiKey: string;
  geminiModel: string;
};

export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

export const defaultPreferences = (): Preferences => ({
  confirmMoves: true,
  showScoreInGame: false,
  geminiApiKey: '',
  geminiModel: DEFAULT_GEMINI_MODEL,
});

const STORAGE_KEY = 'web-katrain:sensei-preferences:v1';

export function parsePreferences(raw: unknown): Preferences {
  const prefs = defaultPreferences();
  if (!raw || typeof raw !== 'object') return prefs;
  const r = raw as Partial<Record<keyof Preferences, unknown>>;
  if (typeof r.confirmMoves === 'boolean') prefs.confirmMoves = r.confirmMoves;
  if (typeof r.showScoreInGame === 'boolean') prefs.showScoreInGame = r.showScoreInGame;
  if (typeof r.geminiApiKey === 'string') prefs.geminiApiKey = r.geminiApiKey.trim();
  if (typeof r.geminiModel === 'string' && r.geminiModel.trim()) prefs.geminiModel = r.geminiModel.trim();
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
