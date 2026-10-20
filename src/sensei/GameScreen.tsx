import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { GameNode, Player } from '../types';
import { SenseiBoard } from './SenseiBoard';
import { outcomeFor, resultFromScoreLead, resultLabel } from './gameResult';
import { rankLabel, recordResult, type RankBook, type RankedBoardSize } from './rankLadder';
import { saveSession, type SessionMeta } from './session';

const isPass = (m: { x: number; y: number } | null | undefined) => !!m && m.x < 0;

/**
 * The bot falls back to the engine's own move when the human net is missing;
 * such a game was not played at the rank on the label, so it does not count.
 */
function playedOffRank(node: GameNode, humanColor: Player): boolean {
  for (let n: GameNode | null = node; n; n = n.parent) {
    if (n.move && n.move.player !== humanColor && n.aiThoughts && !n.aiThoughts.startsWith('Human (')) return true;
  }
  return false;
}

type Props = {
  meta: SessionMeta;
  ranks: RankBook;
  onRanksChange: (book: RankBook) => void;
  onMetaChange: (meta: SessionMeta) => void;
  onReplay: () => void;
  onReview: () => void;
};

/** Playing a game against the bot: the board, whose turn it is, pass and resign. */
export const GameScreen: React.FC<Props> = ({ meta, ranks, onRanksChange, onMetaChange, onReplay, onReview }) => {
  const board = useGameStore((s) => s.board);
  const currentNode = useGameStore((s) => s.currentNode);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const isAiThinking = useGameStore((s) => s.isAiThinking);
  const capturedBlack = useGameStore((s) => s.capturedBlack);
  const capturedWhite = useGameStore((s) => s.capturedWhite);
  const analysisData = useGameStore((s) => s.analysisData);
  const isAnalysisMode = useGameStore((s) => s.isAnalysisMode);
  useGameStore((s) => s.treeVersion); // endState is written in place; re-render on tree changes.

  const [confirmResign, setConfirmResign] = useState(false);
  const [showScore, setShowScore] = useState(false);
  const [dismissedNodeId, setDismissedNodeId] = useState<string | null>(null);
  const countingNodeRef = useRef<string | null>(null);

  const endState = currentNode.endState ?? null;
  const bothPassed = isPass(currentNode.move) && isPass(currentNode.parent?.move);
  const ended = !!endState;
  const counting = bothPassed && !ended;
  const humanToMove = !ended && !bothPassed && !isAiThinking && currentPlayer === meta.humanColor;
  const aiColor = meta.humanColor === 'black' ? 'white' : 'black';
  const aiName = `AIボット ${rankLabel(meta.aiRank)}`;
  const offRank = playedOffRank(currentNode, meta.humanColor);
  const size = meta.size as RankedBoardSize;

  // Two passes end the game but leave it uncounted: let the engine count it.
  useEffect(() => {
    if (!counting || countingNodeRef.current === currentNode.id) return;
    countingNodeRef.current = currentNode.id;
    useGameStore.setState({ isAiPlaying: false, aiColor: null });
    void (async () => {
      // runAnalysis does nothing unless analysis mode is on.
      if (!useGameStore.getState().isAnalysisMode) useGameStore.getState().toggleAnalysisMode();
      await useGameStore.getState().runAnalysis({ force: true, visits: 400 });
      const lead = useGameStore.getState().currentNode.analysis?.rootScoreLead;
      if (typeof lead === 'number') useGameStore.getState().recordCountedResult(resultFromScoreLead(lead));
      useGameStore.setState((s) => ({ treeVersion: s.treeVersion + 1 }));
    })();
  }, [counting, currentNode.id]);

  // Move the ranked ladder once per finished game.
  useEffect(() => {
    if (!ended || meta.kind !== 'ranked' || meta.rankRecorded || offRank) return;
    const outcome = outcomeFor(endState, meta.humanColor);
    if (!outcome) return;
    onRanksChange(recordResult(ranks, size, outcome, Date.now()));
    const updated = { ...meta, rankRecorded: true };
    saveSession(updated);
    onMetaChange(updated);
  }, [ended, endState, meta, ranks, size, onRanksChange, onMetaChange, offRank]);

  // "形勢を表示" needs the live analysis running while the game is on.
  useEffect(() => {
    if (ended || bothPassed) return;
    if (showScore !== isAnalysisMode) useGameStore.getState().toggleAnalysisMode();
  }, [showScore, isAnalysisMode, ended, bothPassed]);

  const lastMove = currentNode.move && !isPass(currentNode.move) ? currentNode.move : null;
  const outcome = outcomeFor(endState, meta.humanColor);
  const lead = analysisData?.rootScoreLead;
  const dialogOpen = ended && dismissedNodeId !== currentNode.id;
  const change = meta.kind === 'ranked' ? ranks[size].history.find((h) => h.at >= meta.startedAt) : undefined;
  const rankChange = change && change.before !== change.after
    ? change.outcome === 'win'
      ? `おめでとうございます！ 棋力が${rankLabel(change.after)}に昇格しました！`
      : `残念…！ 棋力が${rankLabel(change.after)}に降格されました`
    : null;

  const status = ended
    ? resultLabel(endState)
    : counting
      ? '地を数えています…'
      : isAiThinking || currentPlayer === aiColor
        ? 'AIの一手を考え中…'
        : 'あなたの手番です';

  return (
    <div className="sensei-game">
      <div className="sensei-board-wrap">
        <SenseiBoard
          board={board}
          lastMove={lastMove}
          disabled={!humanToMove}
          onTap={(x, y) => useGameStore.getState().playMove(x, y)}
        />
      </div>
      <aside className="sensei-side">
        <div className="sensei-players">
          <PlayerLine color="white" name={meta.humanColor === 'white' ? 'あなた' : aiName} captures={capturedBlack} />
          <PlayerLine color="black" name={meta.humanColor === 'black' ? 'あなた' : aiName} captures={capturedWhite} />
        </div>
        <div className="sensei-status">
          <span>{status}{isAiThinking && <span className="sensei-spinner" aria-hidden />}</span>
          {!ended && (
            <div className="flex gap-2">
              <button type="button" className="sensei-dark" disabled={!humanToMove} onClick={() => useGameStore.getState().passTurn()}>パス</button>
              <button type="button" className="sensei-dark" onClick={() => setConfirmResign(true)}>降参</button>
            </div>
          )}
          {ended && (
            <button type="button" className="sensei-dark" onClick={onReview}>対局を検討</button>
          )}
        </div>
        {!ended && (
          <label className="sensei-row text-sm">
            <span>形勢を表示</span>
            <input type="checkbox" checked={showScore} onChange={(e) => setShowScore(e.target.checked)} />
          </label>
        )}
        {showScore && !ended && typeof lead === 'number' && (
          <p className="text-sm">形勢: {lead >= 0 ? '黒' : '白'} +{Math.abs(lead).toFixed(1)}目</p>
        )}
      </aside>

      {confirmResign && (
        <Dialog title="投了しますか？" onClose={() => setConfirmResign(false)}>
          <p>本当に投了しますか？</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="sensei-secondary" onClick={() => setConfirmResign(false)}>戻る</button>
            <button
              type="button"
              className="sensei-primary"
              onClick={() => { setConfirmResign(false); useGameStore.getState().resign(meta.humanColor); }}
            >
              降参
            </button>
          </div>
        </Dialog>
      )}

      {ended && dialogOpen && (
        <Dialog
          title={outcome === 'win' ? 'あなたの勝ちです！' : outcome === 'loss' ? 'あなたの負けです！' : '持碁です'}
          onClose={() => setDismissedNodeId(currentNode.id)}
        >
          <p className="sensei-result">{resultLabel(endState)}</p>
          {rankChange && <p className="font-bold">{rankChange}</p>}
          {meta.kind === 'ranked' && offRank && <p className="text-sm">人間らしいAIのモデルが使えず通常のAIで打ったため、この対局は棋力に反映しません。</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="sensei-green" onClick={onReplay}>もう一度対局</button>
            <button type="button" className="sensei-primary" onClick={onReview}>対局を検討</button>
          </div>
        </Dialog>
      )}
    </div>
  );
};

const PlayerLine: React.FC<{ color: 'black' | 'white'; name: string; captures: number }> = ({ color, name, captures }) => (
  <div className="flex items-center gap-2">
    <span className={`sensei-stone sensei-stone-${color}`} aria-hidden />
    <span className="font-bold">{name}</span>
    <span className="ml-auto text-xs">アゲハマ: {captures}</span>
  </div>
);

export const Dialog: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="sensei-overlay" role="dialog" aria-modal="true" aria-label={title}>
    <div className="sensei-dialog space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">{title}</h2>
        <button type="button" aria-label="閉じる" onClick={onClose}>×</button>
      </div>
      {children}
    </div>
  </div>
);
