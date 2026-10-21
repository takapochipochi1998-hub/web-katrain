import React, { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { GameNode } from '../types';
import { SenseiBoard, type BoardMarker } from './SenseiBoard';
import { ScoreGraph } from './ScoreGraph';
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
import { pointLabel } from './coords';
import { explainMove, factsForMove } from './explain';
import { Header, Segmented, Switch } from './ui';
import { RankPicker } from './RankPicker';
import { humanProfileFor, rankLabel, type Rank } from './rankLadder';

const DEPTHS = [
  { value: 200, label: '速い' },
  { value: 1000, label: '標準' },
  { value: 4000, label: '深い' },
] as const;
type Depth = (typeof DEPTHS)[number]['value'];

const QUALITY_COLOR: Record<MoveQuality, string> = {
  best: '#2f5bd3',
  good: '#2e8b57',
  inaccuracy: '#8d8a3c',
  mistake: '#d97b20',
  blunder: '#d2333f',
};

/** Visits to wait for before the auto-reply trusts the engine's first choice. */
const AUTO_REPLY_MIN_VISITS = 64;

const isPass = (m: { x: number } | null | undefined) => !!m && m.x < 0;

/**
 * Make sure the game line has scores (a quick pass: one network evaluation per
 * position is enough for the graph and the mistake list) and that the position
 * on screen is being read in depth.
 */
function refreshAnalysis(): void {
  const store = useGameStore.getState();
  if (!store.isAnalysisMode) store.toggleAnalysisMode();
  if (!store.isGameAnalysisRunning && mainLine(store.rootNode).some((node) => !node.analysis)) {
    useGameStore.getState().startQuickGameAnalysis();
  }
  void useGameStore.getState().runAnalysis({ ifIdle: true });
}

/** Try-out moves the player made, and those the engine has already answered. */
const playerTryouts = new WeakSet<GameNode>();
const answeredTryouts = new WeakSet<GameNode>();
let lastReviewedRoot: GameNode | null = null;

type Props = {
  title: string;
  /** The player's rank, for "how often would a player of my rank play this?" */
  playerRank: Rank;
  onPlayerRankChange: (rank: Rank) => void;
  geminiApiKey: string;
  geminiModel: string;
  onBack: () => void;
  onAddProblem: (node: GameNode) => void;
  onPlayFromHere: (node: GameNode) => void;
  onOpenSettings: () => void;
};

/** Reviewing a finished game: mistakes, candidates, the score graph and try-outs. */
export const ReviewScreen: React.FC<Props> = ({ title, playerRank, onPlayerRankChange, geminiApiKey, geminiModel, onBack, onAddProblem, onPlayFromHere, onOpenSettings }) => {
  const rootNode = useGameStore((s) => s.rootNode);
  const currentNode = useGameStore((s) => s.currentNode);
  const board = useGameStore((s) => s.board);
  const isGameAnalysisRunning = useGameStore((s) => s.isGameAnalysisRunning);
  const done = useGameStore((s) => s.gameAnalysisDone);
  const total = useGameStore((s) => s.gameAnalysisTotal);
  const analysisData = useGameStore((s) => s.analysisData);
  const treeVersion = useGameStore((s) => s.treeVersion);
  const katagoVisits = useGameStore((s) => s.settings.katagoVisits);
  const humanSlEnabled = useGameStore((s) => s.settings.humanSlEnabled);

  const [autoReply, setAutoReply] = useState(true);
  const [explanation, setExplanation] = useState<{ nodeId: string; text: string } | null>(null);
  const [explaining, setExplaining] = useState<string | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);

  // Set the store up for reviewing once: no bot, live analysis on, a quick pass over the game.
  useEffect(() => {
    const store = useGameStore.getState();
    useGameStore.setState({ isAiPlaying: false, aiColor: null });
    if (!store.isAnalysisMode) store.toggleAnalysisMode();
    // Coming back to the same game keeps the place; a different game starts at move 0.
    if (lastReviewedRoot !== store.rootNode) store.navigateStart();
    lastReviewedRoot = store.rootNode;
  }, []);

  // "打ち手の級位": read each position with the human net at the player's rank too.
  // Changing it wipes every analysis in the tree (web-katrain treats it as an
  // engine change), so the quick pass is started after it, never before.
  useEffect(() => {
    const store = useGameStore.getState();
    const profile = humanProfileFor(playerRank);
    if (!store.settings.humanSlEnabled || store.settings.humanSlProfile !== profile) {
      store.updateSettings({ humanSlEnabled: true, humanSlProfile: profile });
    }
    refreshAnalysis();
  }, [playerRank]);

  // Read every position as it comes on screen. Stepping one move does this in the
  // store, but jumping (graph, mistakes, back to the game) does not, and the quick
  // pass leaves positions with a score but no candidates.
  useEffect(() => {
    void useGameStore.getState().runAnalysis({ ifIdle: true });
  }, [currentNode.id]);

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
  // The node whose move "AIに聞く" explains.
  const explainNode = onMain ? line[anchorIndex + 1] : judgedNode;

  // How likely a player of the chosen rank was to play the judged move.
  const judgedMove = onMain ? line[anchorIndex + 1]?.move : judgedNode.move;
  const positionBefore = onMain ? anchor : judgedNode.parent;
  const humanPolicy = (positionBefore === currentNode ? analysisData?.humanPolicy : undefined) ?? positionBefore?.analysis?.humanPolicy;
  const size = board.length;
  const humanProb = humanSlEnabled && humanPolicy && judgedMove && judgedMove.x >= 0
    ? humanPolicy[judgedMove.y * size + judgedMove.x]
    : undefined;

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

  const ask = async () => {
    if (!explainNode) return;
    const facts = factsForMove(explainNode);
    setExplainError(null);
    if (!facts) { setExplainError('この手はまだ解析が終わっていません。少し待ってからもう一度押してください。'); return; }
    setExplaining(explainNode.id);
    try {
      const text = await explainMove({ apiKey: geminiApiKey, model: geminiModel, facts });
      setExplanation({ nodeId: explainNode.id, text });
    } catch (e) {
      setExplainError(e instanceof Error ? e.message : String(e));
    } finally {
      setExplaining(null);
    }
  };

  const markers: BoardMarker[] = candidates.map((m, i) => ({
    x: m.x,
    y: m.y,
    label: candidateLetter(i),
    fill: i === 0 ? '#2f5bd3' : '#3f9a63',
    textColor: '#fff',
  }));
  const lastMove = currentNode.move && !isPass(currentNode.move) ? currentNode.move : null;
  const shownExplanation = explanation && explainNode && explanation.nodeId === explainNode.id ? explanation.text : null;

  return (
    <>
      <Header
        title={title}
        left={<button type="button" className="sensei-back" onClick={onBack}>‹ 戻る</button>}
        right={<span className="sensei-muted">{anchorIndex}手目</span>}
      />
      <div className="sensei-game">
        <div className="sensei-board-wrap">
          <SenseiBoard board={board} lastMove={lastMove} markers={markers} onTap={tryMove} />
        </div>
        <div className="sensei-side">
          <div className="sensei-nav-buttons">
            <button type="button" aria-label="最初へ" onClick={() => goTo(line[0])}>«</button>
            <button type="button" className="is-mistake" disabled={!prevMistake} onClick={() => goTo(prevMistake && line[prevMistake.moveNumber - 1])}>前の悪手</button>
            <button type="button" aria-label="1手戻る" onClick={() => useGameStore.getState().navigateBack()}>‹</button>
            <button type="button" aria-label="1手進む" onClick={() => goTo(onMain ? line[anchorIndex + 1] : currentNode.children[0])}>›</button>
            <button type="button" className="is-mistake" disabled={!nextMistake} onClick={() => goTo(nextMistake && line[nextMistake.moveNumber - 1])}>次の悪手</button>
            <button type="button" aria-label="最後へ" onClick={() => goTo(line[line.length - 1])}>»</button>
          </div>

          {!onMain && (
            <div className="sensei-trial">
              <strong>試し打ち中</strong>
              <span className="text-sm">AIが応手</span>
              <Switch checked={autoReply} onChange={setAutoReply} label="AIが自動で応手" />
              <button type="button" className="sensei-primary" onClick={() => goTo(anchor)}>実戦に戻る</button>
            </div>
          )}

          <div className="sensei-card sensei-stack">
            <div className="sensei-verdict">
              <span className="sensei-muted">{onMain ? '次の一手' : 'あなたの試し打ち'}</span>
              {judged ? <Verdict verdict={judged} /> : <span className="sensei-muted">終局</span>}
            </div>
            {replyMove && replyMove.x >= 0 && <div className="sensei-muted">AIの応手: {pointLabel(replyMove.x, replyMove.y)}</div>}
            {typeof humanProb === 'number' && humanProb >= 0 && (
              <div className="sensei-muted">{rankLabel(playerRank)}の人がこの手を打つ確率: {(humanProb * 100).toFixed(1)}%</div>
            )}
            {candidates.length > 0 && (
              <div className="sensei-candidates">
                {candidates.map((m, i) => (
                  <button key={`${m.x}-${m.y}`} type="button" onClick={() => tryMove(m.x, m.y)}>
                    <b>{candidateLetter(i)}</b>{i === 0 ? '最善' : `−${Math.max(0, m.pointsLost).toFixed(1)}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ScoreGraph series={series} verdicts={verdicts} currentMove={Math.max(0, anchorIndex)} onSelect={(n) => goTo(line[Math.min(n, line.length - 1)])} />
          <p className="sensei-muted">
            {isGameAnalysisRunning ? `対局を解析中… ${done} / ${total}` : `悪手・敗着 ${mistakes.length}手`}
            {result ? ` · ${resultLabel(result)}` : ''}
          </p>

          <div className="sensei-card sensei-stack">
            <div className="sensei-row">
              <strong>AIに聞く</strong>
              <button type="button" className="sensei-secondary" disabled={!explainNode || !!explaining} onClick={() => void ask()}>
                {explaining ? <>考え中 <span className="sensei-spinner" aria-hidden /></> : 'この手を解説'}
              </button>
            </div>
            {shownExplanation && <p className="sensei-explain">{shownExplanation}</p>}
            {explainError && (
              <p className="sensei-muted">
                {explainError}
                {!geminiApiKey && <> <button type="button" className="sensei-ghost" onClick={onOpenSettings}>設定を開く</button></>}
              </p>
            )}
          </div>

          <div className="sensei-toolbar">
            <button type="button" className="sensei-secondary" disabled={candidates.length === 0} onClick={() => onAddProblem(currentNode)}>問題集に追加</button>
            <button type="button" className="sensei-secondary" onClick={() => onPlayFromHere(currentNode)}>この局面からAIと対局</button>
          </div>

          <div className="sensei-card sensei-stack">
            <div className="flex flex-col gap-2">
              <span>打ち手の級位</span>
              <RankPicker value={playerRank} onChange={onPlayerRankChange} />
            </div>
            <div className="sensei-row">
              <span>読みの深さ</span>
              <Segmented
                options={DEPTHS}
                value={(DEPTHS.find((d) => d.value === katagoVisits)?.value ?? 1000) as Depth}
                onChange={(v) => { useGameStore.getState().updateSettings({ katagoVisits: v }); refreshAnalysis(); }}
                label="読みの深さ"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const Verdict: React.FC<{ verdict: MoveVerdict }> = ({ verdict }) => {
  if (verdict.quality === null) return <span className="sensei-muted">{verdict.moveNumber}手目 · 解析中…</span>;
  const label = verdict.quality === 'best' ? 'AIの一手' : MOVE_QUALITY_LABEL[verdict.quality];
  return (
    <>
      <span className="font-bold">{verdict.moveNumber}手目</span>
      <span className="sensei-badge" style={{ background: QUALITY_COLOR[verdict.quality] }}>{label}</span>
      {verdict.quality !== 'best' && <span className="sensei-loss">−{verdict.pointsLost!.toFixed(1)}目</span>}
    </>
  );
};
