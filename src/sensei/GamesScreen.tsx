import React, { useState } from 'react';
import { outcomeFor, resultLabel } from './gameResult';
import { rankLabel } from './rankLadder';
import type { SavedGame } from './savedGames';
import { Dialog, Header } from './ui';
import { MiniBoard } from './MiniBoard';

type Props = {
  games: readonly SavedGame[];
  onOpen: (game: SavedGame) => void;
  /** Review a game record from elsewhere (it is not added to this list). */
  onImport: (sgf: string) => void;
  onDelete: (id: string) => void;
};

const dateLabel = (ms: number) =>
  new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Every game against the bot: open a finished one to review, an unfinished one to resume. */
export const GamesScreen: React.FC<Props> = ({ games, onOpen, onImport, onDelete }) => {
  const [pendingDelete, setPendingDelete] = useState<SavedGame | null>(null);
  return (
    <>
      <Header title="棋譜" />
      <div className="sensei-page">
        <label className="sensei-secondary sensei-block cursor-pointer">
          SGFを読み込んで検討する
          <input
            type="file"
            accept=".sgf,application/x-go-sgf,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void file.text().then(onImport);
            }}
          />
        </label>
        {games.length === 0 ? (
          <p className="sensei-empty">まだ対局がありません。<br />「対局」タブからAIと打つと、ここに残ります。</p>
        ) : (
          <div className="sensei-card">
            <ul className="sensei-list">
              {games.map((g) => {
                const outcome = outcomeFor(g.result, g.meta.humanColor);
                return (
                  <li key={g.id} className="flex items-center">
                    <button type="button" className="sensei-list-item" onClick={() => onOpen(g)}>
                      <MiniBoard sgf={g.sgf} />
                      <span className="sensei-list-main">
                        <span className="sensei-list-title">
                          {g.meta.size}路 · AI {rankLabel(g.meta.aiRank)}
                          <span className={`sensei-stone sensei-stone-${g.meta.humanColor} sensei-stone-inline`} aria-label={g.meta.humanColor === 'black' ? 'あなたは黒' : 'あなたは白'} />
                        </span>
                        <span className="sensei-muted block">
                          {dateLabel(g.updatedAt)} · {g.moveCount}手 · {g.meta.kind === 'ranked' ? 'ランク戦' : '自由対局'}
                          {g.result ? ` · ${resultLabel(g.result)}` : ''}
                        </span>
                      </span>
                      <span className={`sensei-pill ${outcome ?? ''}`}>
                        {outcome === 'win' ? '勝ち' : outcome === 'loss' ? '負け' : outcome === 'draw' ? '持碁' : '対局中'}
                      </span>
                    </button>
                    <button type="button" className="sensei-ghost px-2" aria-label="この棋譜を削除" onClick={() => setPendingDelete(g)}>×</button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      {pendingDelete && (
        <Dialog title="この棋譜を削除しますか？" onClose={() => setPendingDelete(null)}>
          <p className="sensei-muted text-center">{dateLabel(pendingDelete.updatedAt)}の{pendingDelete.meta.size}路の対局を削除します。元に戻せません。</p>
          <div className="sensei-actions">
            <button type="button" className="sensei-secondary" onClick={() => setPendingDelete(null)}>やめる</button>
            <button type="button" className="sensei-danger" onClick={() => { onDelete(pendingDelete.id); setPendingDelete(null); }}>削除する</button>
          </div>
        </Dialog>
      )}
    </>
  );
};
