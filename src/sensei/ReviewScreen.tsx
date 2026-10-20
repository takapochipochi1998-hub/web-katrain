import React, { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { GameNode } from '../types';
import { SenseiBoard, type BoardMarker } from './SenseiBoard';
import { ScoreGraph } from './ScoreGraph';
import { Segmented } from './RankPicker';
import { MOVE_QUALITY_LABEL, type MoveQuality } from './moveQuality';
import {
  branchPoint,
  candidateLetter,
  isMistake,
  isOnMainLine,
  judgeLine,
  judgeMove,
  mainLine,
  scoreSeries,
  type MoveVerdict,
} from './reviewModel';
import { resultLabel } from './gameResult';

const DEPTHS = [
  { value: 200, label: '速い' },
  { value: 1000, label: '標準' },
  { value: 4000, label: '深い' },
] as const;
type Depth = (typeof DEPTHS)[number]['value'];

const QUALITY_COLOR: Record<MoveQuality, string> = {
  best: '#2f6fdc',
  good: '#3a9a3a',
  inaccuracy: '#8a8a3a',
  mistake: '#e07a1f',
  blunder: '#d7263d',
};

/** Points to wait for before the auto-reply trusts the engine's first choice. */
const AUTO_REPLY_MIN_VISITS = 64;

const isPass = (m: { x: number } | null | undefined) => !!m && m.x < 0;

/** Try-out moves the player made, and those the engine has already answered. */
const playerTryouts = new WeakSet<GameNode>();
const answeredTryouts = new WeakSet<GameNode>();
const KANJI_ROWS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九'];

/** Reviewing a finished game: mistakes, candidates, the score graph and try-outs. */
export const ReviewScreen: React.FC<{ onPlayAgain: () => void }> = ({ onPlayAgain }) => {
  const rootNode = useGameStore((s) => s.rootNode);
  const currentNode = useGameStore((s) => s.currentNode);
  const board = useGameStore((s) => s.board);
  const isGameAnalysisRunning = useGameStore((s) => s.isGameAnalysisRunning);
  const done = useGameStore((s) => s.gameAnalysisDone);
  const total = useGameStore((s) => s.gameAnalysisTotal);
  const analysisData = useGameStore((s) => s.analysisData);
  const treeVersion = useGameStore((s) => s.treeVersion);
  const katagoVisits = useGameStore((s) => s.settings.katagoVisits);

  const [autoReply, setAutoReply] = useState(true);

  // Set the store up for reviewing once: no bot, live analysis on, a quick pass over the game.
  useEffect(() => {
    const store = useGameStore.getState();
    useGameStore.setState({ isAiPlaying: false, aiColor: null });
    if (!store.isAnalysisMode) store.toggleAnalysisMode();
    store.navigateStart();
    if (mainLine(store.rootNode).some((node) => !node.analysis)) store.startFastGameAnalysis();
  }, []);

  // treeVersion: analysis lands on nodes in place, so derive again when it moves.
  const line = useMemo(() => mainLine(rootNode), [rootNode, treeVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const verdicts = useMemo(() => judgeLine(line), [line, treeVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const series = useMemo(() => scoreSeries(line), [line, treeVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMain = isOnMainLine(currentNode);
  const anchor = branchPoint(currentNode);
  const anchorIndex = line.indexOf(anchor);
  const result = line[line.length - 1]?.endState ?? rootNode.properties?.RE?.[0] ?? null;

  // The move being judged: the next game move on the main line, otherwise the
  // player's latest try-out (the move before the engine's auto reply, if any).
  const autoReplied = !onMain && !!currentNode.parent && answeredTryouts.has(currentNode.parent) && !playerTryouts.has(currentNode);
  const judgedNode = autoReplied ? currentNode.parent! : currentNode;
  const judged: MoveVerdict | null = onMain
    ? verdicts.find((v) => v.moveNumber === anchorIndex + 1) ?? null
    : judgeMove(judgedNode, judgedNode.gameState.moveHistory.length);
  const replyMove = autoReplied ? currentNode.move : null;

  // analysisData is the live (still deepening) analysis of the current node.
  const analysis = analysisData ?? currentNode.analysis ?? null;
  const candidates = (analysis?.moves ?? []).filter((m) => m.x >= 0).slice(0, 10);

  // Try-out auto reply: answer each of the player's try-out moves with the engine's best.
  useEffect(() => {
    if (!autoReply || onMain || !playerTryouts.has(currentNode) || answeredTryouts.has(currentNode)) return;
    const best = currentNode.analysis?.moves?.[0];
    const visits = currentNode.analysis?.rootVisits ?? 0;
    if (!best || best.x < 0 || visits < Math.min(AUTO_REPLY_MIN_VISITS, katagoVisits)) return;
    answeredTryouts.add(currentNode);
    useGameStore.getState().playMove(best.x, best.y);
  }, [autoReply, onMain, currentNode, treeVersion, analysisData, katagoVisits]);

  const tryMove = (x: number, y: number) => {
    const before = useGameStore.getState().currentNode;
    useGameStore.getState().playMove(x, y);
    const after = useGameStore.getState().currentNode;
    // Replaying the game's own move just steps forward; anything else is a try-out,
    // including one tried before (its earlier reply is then reused).
    if (after !== before && !isOnMainLine(after)) {
      playerTryouts.add(after);
      answeredTryouts.delete(after);
    }
  };

  const goTo = (node: GameNode | undefined) => { if (node) useGameStore.getState().jumpToNode(node); };
  const mistakes = verdicts.filter(isMistake);
  const nextMistake = mistakes.find((v) => v.moveNumber > anchorIndex + 1);
  const prevMistake = [...mistakes].reverse().find((v) => v.moveNumber < anchorIndex + 1);

  const markers: BoardMarker[] = candidates.map((m, i) => ({
    x: m.x,
    y: m.y,
    label: candidateLetter(i),
    fill: i === 0 ? '#2f6fdc' : '#7fb24a',
    textColor: '#fff',
  }));
  const lastMove = currentNode.move && !isPass(currentNode.move) ? currentNode.move : null;

  return (
    <div className="sensei-game">
      <div className="sensei-board-wrap">
        <SenseiBoard board={board} lastMove={lastMove} markers={markers} onTap={tryMove} />
      </div>
      <aside className="sensei-side">
        <div className="sensei-nav-buttons">
          <button type="button" aria-label="最初へ" onClick={() => goTo(line[0])}>⏮</button>
          <button type="button" disabled={!prevMistake} onClick={() => goTo(prevMistake && line[prevMistake.moveNumber - 1])}>前の悪手</button>
          <button type="button" aria-label="1手戻る" onClick={() => useGameStore.getState().navigateBack()}>◀</button>
          <button type="button" aria-label="1手進む" onClick={() => goTo(onMain ? line[anchorIndex + 1] : currentNode.children[0])}>▶</button>
          <button type="button" disabled={!nextMistake} onClick={() => goTo(nextMistake && line[nextMistake.moveNumber - 1])}>次の悪手</button>
          <button type="button" aria-label="最後へ" onClick={() => goTo(line[line.length - 1])}>⏭</button>
        </div>

        {!onMain && (
          <div className="sensei-trial">
            <span>試し打ち中</span>
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={autoReply} onChange={(e) => setAutoReply(e.target.checked)} />
              AIが自動で応手
            </label>
            <button type="button" className="sensei-dark" onClick={() => goTo(anchor)}>実戦に戻る</button>
          </div>
        )}

        <div className="sensei-verdict">
          <span className="text-sm">{onMain ? '次の一手' : '試し打ちの手'}</span>
          {judged ? <Verdict verdict={judged} /> : <span className="text-sm">終局</span>}
        </div>
        {replyMove && replyMove.x >= 0 && (
          <p className="text-sm">AIの応手: {replyMove.x + 1}の{KANJI_ROWS[replyMove.y]}</p>
        )}

        {candidates.length > 0 && (
          <ul className="sensei-candidates">
            {candidates.map((m, i) => (
              <li key={`${m.x}-${m.y}`}>
                <button type="button" onClick={() => tryMove(m.x, m.y)}>
                  <b>{candidateLetter(i)}</b> {i === 0 ? 'AIの一手' : `−${Math.max(0, m.pointsLost).toFixed(1)}目`}
                </button>
              </li>
            ))}
          </ul>
        )}

        <ScoreGraph series={series} verdicts={verdicts} currentMove={Math.max(0, anchorIndex)} onSelect={(n) => goTo(line[Math.min(n, line.length - 1)])} />
        <p className="text-xs">
          {isGameAnalysisRunning ? `対局を解析中… ${done} / ${total}` : `悪手 ${mistakes.length}手`}
          {result ? ` · ${resultLabel(result)}` : ''}
        </p>

        <div className="sensei-row text-sm">
          <span>読みの深さ</span>
          <Segmented
            options={DEPTHS}
            value={(DEPTHS.find((d) => d.value === katagoVisits)?.value ?? 1000) as Depth}
            onChange={(v) => useGameStore.getState().updateSettings({ katagoVisits: v })}
          />
        </div>
        <button type="button" className="sensei-green" onClick={onPlayAgain}>もう一度対局</button>
      </aside>
    </div>
  );
};

const Verdict: React.FC<{ verdict: MoveVerdict }> = ({ verdict }) => {
  if (verdict.quality === null) return <span className="text-sm">{verdict.moveNumber}手目 · 解析中…</span>;
  const label = verdict.quality === 'best' ? 'AIの一手' : MOVE_QUALITY_LABEL[verdict.quality];
  return (
    <span className="flex items-center gap-2">
      <span className="text-sm">{verdict.moveNumber}手目</span>
      <span className="sensei-badge" style={{ background: QUALITY_COLOR[verdict.quality] }}>{label}</span>
      {verdict.quality !== 'best' && <span className="font-bold">−{verdict.pointsLost!.toFixed(1)}目</span>}
    </span>
  );
};
