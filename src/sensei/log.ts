/**
 * A small on-device diary of what happened: screens opened, games started and
 * ended, engine timings, errors. Kept in localStorage so a bug met on the phone
 * can be copied from 設定 and read back.
 */
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from '../utils/storage';

export type LogEntry = { t: number; event: string; data?: Record<string, unknown> };

const STORAGE_KEY = 'web-katrain:sensei-log:v1';
const MAX_ENTRIES = 400;

let entries: LogEntry[] | null = null;

function load(): LogEntry[] {
  if (entries) return entries;
  try {
    const raw = JSON.parse(readLocalStorage(STORAGE_KEY) ?? '[]') as unknown;
    entries = Array.isArray(raw) ? (raw as LogEntry[]) : [];
  } catch {
    entries = [];
  }
  return entries;
}

export function log(event: string, data?: Record<string, unknown>): void {
  const list = load();
  list.push(data ? { t: Date.now(), event, data } : { t: Date.now(), event });
  if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
  try {
    writeLocalStorage(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage full: keep the in-memory copy.
  }
}

export function clearLog(): void {
  entries = [];
  removeLocalStorage(STORAGE_KEY);
}

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** The log as plain text, with the device and build on top. */
export function exportLog(): string {
  const head = [
    `build: ${import.meta.env.MODE} ${document.querySelector('script[type="module"][src]')?.getAttribute('src') ?? ''}`,
    `ua: ${navigator.userAgent}`,
    `online: ${navigator.onLine}`,
    `exported: ${stamp(Date.now())}`,
  ];
  const lines = load().map((e) => `${stamp(e.t)} ${e.event}${e.data ? ' ' + JSON.stringify(e.data) : ''}`);
  return [...head, '', ...lines].join('\n');
}

export const errorText = (err: unknown): string =>
  err instanceof Error ? `${err.name}: ${err.message}${err.stack ? '\n' + err.stack.split('\n').slice(0, 4).join('\n') : ''}` : String(err);

let installed = false;
/** Record uncaught errors and rejected promises. */
export function installErrorLogging(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => log('error', { message: e.message, at: `${e.filename}:${e.lineno}` }));
  window.addEventListener('unhandledrejection', (e) => log('rejection', { reason: errorText(e.reason).slice(0, 500) }));
  window.addEventListener('online', () => log('online'));
  window.addEventListener('offline', () => log('offline'));
}
