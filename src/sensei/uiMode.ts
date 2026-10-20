import { readLocalStorage, readSessionStorage, removeSessionStorage, writeLocalStorage, writeSessionStorage } from '../utils/storage';

/** Which shell the app shows: the simple AI Sensei-style one, or web-katrain's own. */
export type UiMode = 'simple' | 'classic';

const STORAGE_KEY = 'web-katrain:sensei-ui-mode:v1';
const listeners = new Set<(mode: UiMode) => void>();

export function getUiMode(): UiMode {
  return readLocalStorage(STORAGE_KEY) === 'classic' ? 'classic' : 'simple';
}

const SWITCHED_KEY = 'web-katrain:sensei-switched-from-simple:v1';

export function setUiMode(mode: UiMode): void {
  writeLocalStorage(STORAGE_KEY, mode);
  if (mode === 'classic') writeSessionStorage(SWITCHED_KEY, '1');
  listeners.forEach((listener) => listener(mode));
}

export function subscribeUiMode(listener: (mode: UiMode) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True once after the simple mode handed over to the detail mode in this tab. */
export function consumeSwitchedFromSimpleMode(): boolean {
  const switched = readSessionStorage(SWITCHED_KEY) === '1';
  removeSessionStorage(SWITCHED_KEY);
  return switched;
}
