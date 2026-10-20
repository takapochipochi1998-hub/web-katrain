import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { GameNode, Player } from '../types';
import { SenseiBoard } from './SenseiBoard';
import { outcomeFor, resultFromScoreLead, resultLabel } from './gameResult';
import { rankLabel, recordResult, type RankBook, type RankedBoardSize } from './rankLadder';
import { saveSession, type SessionMeta } from './session';
import { Dialog, Header, Switch } from './ui';

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
  confirmMoves: boolean;
  showScoreByDefault: boolean;
  onRanksChange: (book: RankBook) => void;
  onMetaChange: (meta: SessionMeta) => void;
  onReplay: () => void;
  onReview: () => void;
  onLeave: () => void;
};

/** Playing a game against the bot: the board, whose turn it is, pass and resign. */
export const GameScreen: React.FC<Props> = ({ meta, ranks, confirmMoves, showScoreByDefault, onRanksChange, onMetaChange, onReplay, onReview, onLeave }) => {
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
  const [showScore, setShowScore] = useState(showScoreByDefault);
  const [dismissedNodeId, setDismissedNodeId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const countingNodeRef = useRef<string | null>(null);

  const endState = currentNode.endState ?? null;
  const bothPassed = isPass(currentNode.move) && isPass(currentNode.parent?.move);
  const ended = !!endState;
  const counting = bothPassed && !ended;
  const humanToMove = !ended && !bothPassed && !isAiThinking && currentPlayer === meta.humanColor;
  const aiColor: Player = meta.humanColor === 'black' ? 'white' : 'black';
  const aiName = `AI ${rankLabel(meta.aiRank)}`;
  const offRank = playedOffRank(currentNode, meta.humanColor);
  const size = meta.size as RankedBoardSize;
  // A ghost belongs to the position it was placed on.
  const liveGhost = ghost && ghost.nodeId === currentNode.id && humanToMove ? ghost : null;

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

  const tap = (x: number, y: number) => {
    if (board[y]?.[x]) return;
    if (confirmMoves && !(liveGhost && liveGhost.x === x && liveGhost.y === y)) {
      setGhost({ x, y, nodeId: currentNode.id });
      return;
    }
    setGhost(null);
    useGameStore.getState().playMove(x, y);
  };

  const lastMove = currentNode.move && !isPass(currentNode.move) ? currentNode.move : null;
  const outcome = outcomeFor(endState, meta.humanColor);
  const lead = analysisData?.rootScoreLead;
  const dialogOpen = ended && dismissedNodeId !== currentNode.id;
  const change = meta.kind === 'ranked' ? ranks[size].history.find((h) => h.at >= meta.startedAt) : undefined;
  const rankChange = change && change.before !== change.after
    ? change.outcome === 'win'
      ? `おめでとうございます！ 棋力が${rankLabel(change.after)}に昇格しました`
      : `棋力が${rankLabel(change.after)}に降格しました`
    : null;
  const moveNumber = currentNode.gameState.moveHistory.length;

  const status = ended
    ? resultLabel(endState)
    : counting
      ? <>地を数えています <span className="sensei-spinner" aria-hidden /></>
      : isAiThinking || currentPlayer === aiColor
        ? <>AIが考えています <span className="sensei-spinner" aria-hidden /></>
        : liveGhost
          ? 'もう一度タップすると打ちます'
          : 'あなたの番です';

  const players: Array<{ color: Player; name: string; captures: number }> = [
    { color: 'black', name: meta.humanColor === 'black' ? 'あなた' : aiName, captures: capturedWhite },
    { color: 'white', name: meta.humanColor === 'white' ? 'あなた' : aiName, captures: capturedBlack },
  ];

  return (
    <>
      <Header
        title={`${meta.size}路 · ${meta.kind === 'ranked' ? 'ランク戦' : '自由対局'}`}
        left={<button type="button" className="sensei-back" onClick={onLeave}>‹ 戻る</button>}
        right={<span className="sensei-muted">{moveNumber}手</span>}
      />
      <div className="sensei-game">
        <div className="sensei-board-wrap">
          <SenseiBoard
            board={board}
            lastMove={lastMove}
            ghost={liveGhost ? { x: liveGhost.x, y: liveGhost.y, player: meta.humanColor } : null}
            disabled={!humanToMove}
            onTap={tap}
          />
        </div>
        <div className="sensei-side">
          <div className="sensei-players">
            {players.map((p) => (
              <div key={p.color} className={`sensei-player${!ended && currentPlayer === p.color ? ' is-turn' : ''}`}>
                <span className={`sensei-stone sensei-stone-${p.color}`} aria-hidden />
                <div className="min-w-0">
                  <div className="sensei-player-name">{p.name}</div>
                  <div className="sensei-player-sub">アゲハマ {p.captures}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="sensei-status" aria-live="polite">{status}</div>
          {showScore && !ended && typeof lead === 'number' && (
            <div className="sensei-muted text-center">形勢: {lead >= 0 ? '黒' : '白'}が{Math.abs(lead).toFixed(1)}目リード</div>
          )}
          {!ended ? (
            <div className="sensei-actions">
              <button type="button" className="sensei-secondary" disabled={!humanToMove} onClick={() => { setGhost(null); useGameStore.getState().passTurn(); }}>パス</button>
              <button type="button" className="sensei-danger" disabled={counting} onClick={() => setConfirmResign(true)}>投了</button>
            </div>
          ) : (
            <div className="sensei-actions">
              <button type="button" className="sensei-secondary" onClick={onReplay}>もう一度対局</button>
              <button type="button" className="sensei-primary" onClick={onReview}>検討する</button>
            </div>
          )}
          {!ended && (
            <div className="sensei-card">
              <div className="sensei-row">
                <span>形勢を表示</span>
                <Switch checked={showScore} onChange={setShowScore} label="形勢を表示" />
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmResign && (
        <Dialog title="投了しますか？" onClose={() => setConfirmResign(false)}>
          <p className="sensei-muted text-center">この対局は{outcomeLabel(aiColor)}の勝ちとして記録されます。</p>
          <div className="sensei-actions">
            <button type="button" className="sensei-secondary" onClick={() => setConfirmResign(false)}>続ける</button>
            <button
              type="button"
              className="sensei-primary"
              onClick={() => { setConfirmResign(false); useGameStore.getState().resign(meta.humanColor); }}
            >
              投了する
            </button>
          </div>
        </Dialog>
      )}

      {ended && dialogOpen && (
        <Dialog
          title={outcome === 'win' ? 'あなたの勝ちです' : outcome === 'loss' ? 'あなたの負けです' : '持碁です'}
          onClose={() => setDismissedNodeId(currentNode.id)}
        >
          <p className="sensei-result">{resultLabel(endState)}</p>
          {rankChange && <p className="sensei-promo">{rankChange}</p>}
          {meta.kind === 'ranked' && offRank && (
            <p className="sensei-muted">人間らしいAIのモデルが使えず通常のAIで打ったため、この対局は棋力に反映しません。</p>
          )}
          <div className="sensei-actions">
            <button type="button" className="sensei-secondary" onClick={onReplay}>もう一度対局</button>
            <button type="button" className="sensei-primary" onClick={onReview}>検討する</button>
          </div>
        </Dialog>
      )}
    </>
  );
};

const outcomeLabel = (color: Player) => (color === 'black' ? '黒' : '白');
