import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { GameNode, Player } from '../types';
import { SenseiBoard } from './SenseiBoard';
import { outcomeFor, parseResult, resultFromScoreLead, resultLabel } from './gameResult';
import { rankLabel, recordResult, type RankBook, type RankedBoardSize } from './rankLadder';
import { loseOnTime, saveSession, type SessionMeta } from './session';
import { formatClock, hasClock, spendTime, viewClock } from './clock';
import { Dialog } from './ui';
import { useNarrow } from './useNarrow';
import { errorText, log } from './log';

const COUNT_TIMEOUT_MS = 30_000;

const isPass = (m: { x: number; y: number } | null | undefined) => !!m && m.x < 0;

/** When the player's turn at each position began, and moves already charged to the clock. */
const turnStarts = new WeakMap<GameNode, number>();
const charged = new WeakSet<GameNode>();
const turnStartFor = (node: GameNode): number => {
  if (!turnStarts.has(node)) turnStarts.set(node, Date.now());
  return turnStarts.get(node)!;
};

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
  onRanksChange: (book: RankBook) => void;
  onMetaChange: (meta: SessionMeta) => void;
  onReplay: () => void;
  onReview: () => void;
};

/** Playing a game against the bot: the board, whose turn it is, pass and resign. */
export const GameScreen: React.FC<Props> = ({ meta, ranks, confirmMoves, onRanksChange, onMetaChange, onReplay, onReview }) => {
  const board = useGameStore((s) => s.board);
  const currentNode = useGameStore((s) => s.currentNode);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const isAiThinking = useGameStore((s) => s.isAiThinking);
  const capturedBlack = useGameStore((s) => s.capturedBlack);
  const capturedWhite = useGameStore((s) => s.capturedWhite);
  useGameStore((s) => s.treeVersion); // endState is written in place; re-render on tree changes.

  const narrow = useNarrow();
  const [confirmResign, setConfirmResign] = useState(false);
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
  // The player's clock: runs while it is their turn, charged when they move.
  const tc = meta.timeControl;
  const [now, setNow] = useState(() => Date.now());
  const clockRunning = hasClock(tc) && !!meta.clock && humanToMove;
  const elapsed = clockRunning ? Math.max(0, (now - turnStartFor(currentNode)) / 1000) : 0;
  const clockView = hasClock(tc) && meta.clock ? viewClock(meta.clock, tc, elapsed) : null;

  useEffect(() => {
    if (!clockRunning || !tc || !meta.clock) return;
    const clock = meta.clock;
    const start = turnStartFor(currentNode);
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (viewClock(clock, tc, (t - start) / 1000).flagged) {
        clearInterval(id);
        loseOnTime(meta.humanColor);
      }
    }, 250);
    return () => clearInterval(id);
  }, [clockRunning, tc, meta.clock, meta.humanColor, currentNode]);

  useEffect(() => {
    const parent = currentNode.parent;
    if (!hasClock(tc) || !meta.clock || !parent || currentNode.move?.player !== meta.humanColor || charged.has(currentNode)) return;
    charged.add(currentNode);
    const next = spendTime(meta.clock, tc, (Date.now() - turnStartFor(parent)) / 1000);
    if (!next) return;
    const updated = { ...meta, clock: next };
    saveSession(updated);
    onMetaChange(updated);
  }, [currentNode, meta, tc, onMetaChange]);

  // A ghost belongs to the position it was placed on.
  const liveGhost = ghost && ghost.nodeId === currentNode.id && humanToMove ? ghost : null;

  // Nothing reads the live analysis during play; keep the engine free for the bot.
  // Not when the game already sits at two passes: counting needs the analysis on.
  useEffect(() => {
    const store = useGameStore.getState();
    const node = store.currentNode;
    const atTwoPasses = isPass(node.move) && isPass(node.parent?.move);
    if (store.isAnalysisMode && !node.endState && !atTwoPasses) store.toggleAnalysisMode();
  }, []);

  // Two passes end the game but leave it uncounted: let the engine count it.
  // If the engine cannot (it failed, or took too long), the game stays reviewable.
  const [countFailedNodeId, setCountFailedNodeId] = useState<string | null>(null);
  useEffect(() => {
    if (!counting || countingNodeRef.current === currentNode.id) return;
    const nodeId = currentNode.id;
    countingNodeRef.current = nodeId;
    useGameStore.setState({ isAiPlaying: false, aiColor: null });
    log('count-start', { online: navigator.onLine });
    const started = Date.now();
    void (async () => {
      try {
        // runAnalysis does nothing unless analysis mode is on.
        if (!useGameStore.getState().isAnalysisMode) useGameStore.getState().toggleAnalysisMode();
        await Promise.race([
          useGameStore.getState().runAnalysis({ force: true, visits: 400 }),
          new Promise((resolve) => setTimeout(resolve, COUNT_TIMEOUT_MS)),
        ]);
      } catch (e) {
        log('count-error', { error: errorText(e).slice(0, 300) });
      }
      const state = useGameStore.getState();
      const lead = state.currentNode.id === nodeId ? state.currentNode.analysis?.rootScoreLead : undefined;
      if (typeof lead === 'number') {
        const result = resultFromScoreLead(lead);
        state.recordCountedResult(result);
        log('count-done', { result, ms: Date.now() - started });
      } else {
        log('count-failed', { ms: Date.now() - started });
        setCountFailedNodeId(nodeId);
      }
      useGameStore.setState((s) => ({ treeVersion: s.treeVersion + 1 }));
    })();
  }, [counting, currentNode.id]);
  const countFailed = counting && countFailedNodeId === currentNode.id;

  // The diary: every move with who played it and how long the bot took.
  useEffect(() => {
    const move = currentNode.move;
    if (!move) { turnStartFor(currentNode); return; }
    const by = move.player === meta.humanColor ? 'human' : 'ai';
    const parent = currentNode.parent;
    const ms = by === 'ai' && parent ? Date.now() - turnStartFor(parent) : undefined;
    log('move', { by, at: move.x < 0 ? 'pass' : `${move.x},${move.y}`, ...(ms !== undefined ? { ms } : {}) });
    turnStartFor(currentNode); // Stamp when this position appeared, for timing the reply.
  }, [currentNode, meta.humanColor]);
  useEffect(() => {
    if (endState) log('game-end', { result: endState });
  }, [endState]);

  // Move the ranked ladder once per finished game.
  useEffect(() => {
    if (!ended || meta.kind !== 'ranked' || meta.rankRecorded || offRank) return;
    const outcome = outcomeFor(endState, meta.humanColor);
    if (!outcome) return;
    onRanksChange(recordResult(ranks, size, outcome, Date.now(), meta.aiRank));
    const updated = { ...meta, rankRecorded: true };
    saveSession(updated);
    onMetaChange(updated);
  }, [ended, endState, meta, ranks, size, onRanksChange, onMetaChange, offRank]);


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
  const aiPassed = !ended && !counting && isPass(currentNode.move) && currentNode.move?.player === aiColor;
  const outcome = outcomeFor(endState, meta.humanColor);
  const dialogOpen = ended && dismissedNodeId !== currentNode.id;
  const change = meta.kind === 'ranked' ? ranks[size].history.find((h) => h.at >= meta.startedAt) : undefined;
  // "レート 3000 → 3020（+20）", and a line when the equivalent rank moved.
  const ratingChange = change && change.ratingBefore !== undefined && change.ratingAfter !== undefined
    ? `レート ${change.ratingBefore} → ${change.ratingAfter}（${change.ratingAfter >= change.ratingBefore ? '+' : '−'}${Math.abs(change.ratingAfter - change.ratingBefore)}）`
    : null;
  const rankChange = change && change.before !== change.after
    ? change.outcome === 'win'
      ? `おめでとうございます！ ${rankLabel(change.after)}相当になりました`
      : `${rankLabel(change.after)}相当になりました`
    : null;
  const players: Array<{ color: Player; name: string; captures: number }> = [
    { color: 'black', name: meta.humanColor === 'black' ? 'あなた' : aiName, captures: capturedWhite },
    { color: 'white', name: meta.humanColor === 'white' ? 'あなた' : aiName, captures: capturedBlack },
  ];
  // The clock is the chip's main figure; byo-yomi tints the chip so it shows at a glance.
  const flagged = parseResult(endState)?.margin === 'time';
  const clock = hasClock(tc) && clockView
    ? flagged
      ? { big: '0:00', small: '時間切れ', byo: true }
      : clockView.inByoyomi
        ? { big: String(Math.max(0, Math.ceil(clockView.secondsLeft))), small: `残り${clockView.periodsLeft}回`, byo: true }
        : { big: formatClock(clockView.secondsLeft), small: tc.byoSec > 0 ? `+${tc.byoSec}秒×${clockView.periodsLeft}` : '', byo: false }
    : null;
  const clockUrgent = !!clock && clockRunning && !!clockView && (clockView.inByoyomi ? clockView.secondsLeft <= 10 : clockView.secondsLeft <= 30);

  // The players and the result: beside the board on a wide screen, under it on a phone.
  const info = (
    <>
      <div className="sensei-players">
        {players.map((p) => {
          const mine = p.color === meta.humanColor;
          const thinking = !ended && p.color === aiColor && (isAiThinking || currentPlayer === aiColor) && !counting;
          return (
            <div key={p.color} className={`sensei-player${!ended && currentPlayer === p.color ? ' is-turn' : ''}${mine && clock?.byo ? ' is-byoyomi' : ''}`}>
              <span className={`sensei-stone sensei-stone-${p.color}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="sensei-player-name">{p.name}</div>
                <div className="sensei-player-sub">アゲハマ {p.captures}</div>
              </div>
              {mine && clock && (
                <div className="sensei-clock" aria-label={`持ち時間 ${clock.big} ${clock.small.replace('+', '秒読み ')}`}>
                  <div className={`sensei-clock-big tabular-nums${clockUrgent ? ' sensei-clock-urgent' : ''}`}>{clock.big}</div>
                  {clock.small && <div className="sensei-clock-small">{clock.small}</div>}
                </div>
              )}
              {thinking && <span className="sensei-spinner" aria-label="AIが考えています" />}
            </div>
          );
        })}
      </div>
      {(counting || ended || aiPassed) && (
        <div className={`sensei-status${aiPassed ? ' sensei-status-pass' : ''}`} aria-live="polite">
          {ended
            ? resultLabel(endState)
            : countFailed
              ? '地を数えられませんでした。検討画面で確かめてください'
              : counting
                ? <>地を数えています <span className="sensei-spinner" aria-hidden /></>
                : 'AIがパスしました。あなたもパスすると終局です'}
        </div>
      )}
    </>
  );

  return (
    <>
      <div className="sensei-game">
        <div className="sensei-side sensei-gamebar">
          <div className="sensei-gamebar-row">
            <div className="flex-1" />
            {countFailed ? (
              <button type="button" className="sensei-primary sensei-compact" onClick={onReview}>検討する</button>
            ) : !ended ? (
              <>
                <button type="button" className="sensei-secondary sensei-compact" disabled={!humanToMove} onClick={() => { setGhost(null); useGameStore.getState().passTurn(); }}>パス</button>
                <button type="button" className="sensei-danger sensei-compact" disabled={counting} onClick={() => setConfirmResign(true)}>投了</button>
              </>
            ) : (
              <>
                <button type="button" className="sensei-secondary sensei-compact" onClick={onReplay}>もう一度対局</button>
                <button type="button" className="sensei-primary sensei-compact" onClick={onReview}>検討する</button>
              </>
            )}
          </div>
          {!narrow && info}
        </div>
        <div className="sensei-board-wrap">
          <SenseiBoard
            board={board}
            lastMove={lastMove}
            ghost={liveGhost ? { x: liveGhost.x, y: liveGhost.y, player: meta.humanColor } : null}
            disabled={!humanToMove}
            dragPlayer={humanToMove ? meta.humanColor : null}
            onTap={tap}
          />
        </div>
        {narrow && <div className="sensei-side sensei-gameinfo">{info}</div>}
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
          {ratingChange && <p className="sensei-rating-change">{ratingChange}</p>}
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
