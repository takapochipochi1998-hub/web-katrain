import React, { useState } from 'react';
import { clearLog, exportLog } from './log';
import { runSpeedTest, type SpeedRow } from './speedTest';
import type { SyncStatus } from './syncStatus';
import { useGameStore } from '../store/gameStore';
import type { Preferences } from './preferences';
import { BYO_PERIODS } from './clock';
import { Header, Segmented, Switch } from './ui';


const MAIN_TIMES = [
  { value: 0, label: 'なし' },
  { value: 600, label: '10分' },
  { value: 1200, label: '20分' },
  { value: 1800, label: '30分' },
] as const;

const BYO_TIMES = [
  { value: 0, label: 'なし' },
  { value: 30, label: '30秒' },
  { value: 60, label: '60秒' },
] as const;

type Props = { prefs: Preferences; onChange: (prefs: Preferences) => void; syncStatus: SyncStatus; onSyncNow: () => void };

export const SettingsScreen: React.FC<Props> = ({ prefs, onChange, syncStatus, onSyncNow }) => {
  const engineBackend = useGameStore((s) => s.engineBackend);
  const engineModelName = useGameStore((s) => s.engineModelName);
  const set = (patch: Partial<Preferences>) => onChange({ ...prefs, ...patch });
  const [tokenDraft, setTokenDraft] = useState(prefs.cloudToken);
  const [speedRows, setSpeedRows] = useState<SpeedRow[] | null>(null);
  const [testing, setTesting] = useState(false);
  const [logNote, setLogNote] = useState<string | null>(null);

  const speedTest = async () => {
    setTesting(true);
    setSpeedRows([]);
    const cloud = prefs.cloudToken ? { url: prefs.cloudUrl, token: prefs.cloudToken } : null;
    await runSpeedTest(cloud, setSpeedRows).catch(() => undefined);
    setTesting(false);
  };

  const copyLog = async () => {
    const text = exportLog();
    try {
      await navigator.clipboard.writeText(text);
      setLogNote('コピーしました');
    } catch {
      setLogNote(text);
    }
  };

  return (
    <>
      <Header title="設定" />
      <div className="sensei-page">
        <div className="sensei-section-label">対局</div>
        <div className="sensei-card">
          <div className="sensei-row">
            <span>
              着手の確認
              <span className="sensei-muted block">1回目のタップで仮に置き、もう一度タップで打ちます</span>
            </span>
            <Switch checked={prefs.confirmMoves} onChange={(v) => set({ confirmMoves: v })} label="着手の確認" />
          </div>
          <div className="sensei-row">
            <span>
              座標を表示
              <span className="sensei-muted block">盤の外側に数字と漢数字を出します</span>
            </span>
            <Switch checked={prefs.showCoords} onChange={(v) => set({ showCoords: v })} label="座標を表示" />
          </div>
          <div className="sensei-row">
            <span>持ち時間</span>
            <Segmented
              options={MAIN_TIMES}
              value={(MAIN_TIMES.find((o) => o.value === prefs.timeControl.mainSec)?.value ?? 0) as (typeof MAIN_TIMES)[number]['value']}
              onChange={(v) => set({ timeControl: { ...prefs.timeControl, mainSec: v } })}
              label="持ち時間"
            />
          </div>
          <div className="sensei-row">
            <span>
              秒読み
              <span className="sensei-muted block">持ち時間のあと、1手ごとに。{BYO_PERIODS}回まで超過できます</span>
            </span>
            <Segmented
              options={BYO_TIMES}
              value={(BYO_TIMES.find((o) => o.value === prefs.timeControl.byoSec)?.value ?? 0) as (typeof BYO_TIMES)[number]['value']}
              onChange={(v) => set({ timeControl: { ...prefs.timeControl, byoSec: v, periods: v > 0 ? BYO_PERIODS : 0 } })}
              label="秒読み"
            />
          </div>
        </div>

        <div className="sensei-section-label">クラウド解析（試験中）</div>
        <div className="sensei-card sensei-stack">
          <label className="flex flex-col gap-2">
            <span>合言葉</span>
            <input
              className="sensei-input"
              type="password"
              autoComplete="off"
              placeholder="クラウドの合言葉"
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              onBlur={() => set({ cloudToken: tokenDraft.trim() })}
            />
          </label>
          <p className="sensei-muted">この端末の中だけに保存します。同じ合言葉を入れた端末どうしで、棋譜・棋力・問題集が同期されます（設定は端末ごと）。</p>
          <div className="sensei-row">
            <span>
              端末間の同期
              <span className="sensei-muted block">{syncLabel(syncStatus)}</span>
            </span>
            <button type="button" className="sensei-secondary" disabled={!prefs.cloudToken || syncStatus.state === 'syncing'} onClick={onSyncNow}>今すぐ同期</button>
          </div>
          <button type="button" className="sensei-secondary" disabled={testing} onClick={() => void speedTest()}>
            {testing ? '計測中…' : '速度テスト'}
          </button>
          {speedRows && speedRows.length > 0 && (
            <table className="sensei-speed">
              <thead><tr><th /><th>端末内</th><th>クラウド</th></tr></thead>
              <tbody>
                {speedRows.map((r) => (
                  <tr key={r.label}>
                    <th>{r.label}</th>
                    <td>{r.device !== undefined ? `${(r.device / 1000).toFixed(2)}秒` : '…'}</td>
                    <td>{r.cloud !== undefined ? `${(r.cloud / 1000).toFixed(2)}秒` : prefs.cloudToken ? '…' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {speedRows?.some((r) => r.note) && <p className="sensei-muted">{speedRows.filter((r) => r.note).map((r) => r.note).join(' / ')}</p>}
        </div>

        <div className="sensei-section-label">ログ</div>
        <div className="sensei-card sensei-stack">
          <p className="sensei-muted">画面の移動・対局・エラーをこの端末に記録しています。不具合があったらコピーして送ってください。</p>
          <div className="sensei-actions">
            <button type="button" className="sensei-secondary" onClick={() => { clearLog(); setLogNote('消去しました'); }}>消去</button>
            <button type="button" className="sensei-primary" onClick={() => void copyLog()}>ログをコピー</button>
          </div>
          {logNote && (logNote.length > 40 ? <pre className="sensei-log">{logNote}</pre> : <p className="sensei-muted">{logNote}</p>)}
        </div>

        <div className="sensei-section-label">そのほか</div>
        <div className="sensei-card">
          <div className="sensei-row">
            <span>
              エンジン
              <span className="sensei-muted block">{engineModelName ?? '未読み込み'}{engineBackend ? ` · ${engineBackend}` : ''}</span>
            </span>
          </div>
          <div className="sensei-row">
            <span>
              効果音
              <span className="sensei-muted block">碁石の音は KaTrain（MIT）より。録音: Jordan Seaward、Funkenschlag1</span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
};

const syncLabel = (s: SyncStatus): string => {
  if (s.state === 'off') return '合言葉を入れると始まります';
  if (s.state === 'syncing') return '同期しています…';
  const time = new Date(s.at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  return s.state === 'ok' ? `${time} に同期しました（棋譜 ${s.games}局）` : `${time} 同期できませんでした: ${s.message}`;
};
