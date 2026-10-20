import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { DEFAULT_GEMINI_MODEL, type Preferences } from './preferences';
import { setUiMode } from './uiMode';
import { Header, Segmented, Switch } from './ui';


const AI_DEPTH = [
  { value: 50, label: '速い' },
  { value: 100, label: '標準' },
  { value: 300, label: '強め' },
] as const;

type Props = { prefs: Preferences; onChange: (prefs: Preferences) => void };

export const SettingsScreen: React.FC<Props> = ({ prefs, onChange }) => {
  const aiMoveVisits = useGameStore((s) => s.settings.aiMoveVisits);
  const engineBackend = useGameStore((s) => s.engineBackend);
  const engineModelName = useGameStore((s) => s.engineModelName);
  const [keyDraft, setKeyDraft] = useState(prefs.geminiApiKey);
  const [modelDraft, setModelDraft] = useState(prefs.geminiModel);
  const set = (patch: Partial<Preferences>) => onChange({ ...prefs, ...patch });

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
            <span>対局中に形勢を表示</span>
            <Switch checked={prefs.showScoreInGame} onChange={(v) => set({ showScoreInGame: v })} label="対局中に形勢を表示" />
          </div>
          <div className="sensei-row">
            <span>
              AIの応手の速さ
              <span className="sensei-muted block">AIが1手ごとに読む量。遅い端末では「速い」</span>
            </span>
            <Segmented
              options={AI_DEPTH}
              value={(AI_DEPTH.find((d) => d.value === aiMoveVisits)?.value ?? 100) as (typeof AI_DEPTH)[number]['value']}
              onChange={(v) => useGameStore.getState().updateSettings({ aiMoveVisits: v })}
              label="AIの応手の速さ"
            />
          </div>
        </div>

        <div className="sensei-section-label">AIに聞く（Gemini）</div>
        <div className="sensei-card sensei-stack">
          <label className="flex flex-col gap-2">
            <span>APIキー</span>
            <input
              className="sensei-input"
              type="password"
              autoComplete="off"
              placeholder="Google AI Studio で発行したキー"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onBlur={() => set({ geminiApiKey: keyDraft.trim() })}
            />
          </label>
          <p className="sensei-muted">キーはこの端末の中だけに保存し、Googleへの問い合わせ以外には送りません。</p>
          <label className="flex flex-col gap-2">
            <span>モデル</span>
            <input
              className="sensei-input"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={modelDraft}
              onChange={(e) => setModelDraft(e.target.value)}
              onBlur={() => set({ geminiModel: modelDraft.trim() || DEFAULT_GEMINI_MODEL })}
            />
          </label>
          <p className="sensei-muted">既定は {DEFAULT_GEMINI_MODEL}（速く、無料枠が多い）。動作を確かめたのはこのモデルだけです。</p>
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
              詳細モード
              <span className="sensei-muted block">web-katrainの元の画面。細かい解析や設定ができます</span>
            </span>
            <button type="button" className="sensei-secondary" onClick={() => setUiMode('classic')}>開く</button>
          </div>
        </div>
      </div>
    </>
  );
};
