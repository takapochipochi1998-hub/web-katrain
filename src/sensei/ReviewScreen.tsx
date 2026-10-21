import React, { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { GameNode, Player } from '../types';
import { SenseiBoard, type BoardMarker } from './SenseiBoard';
import { ScoreGraph } from './ScoreGraph';
import { MOVE_QUALITY_LABEL, type MoveQuality } from './moveQuality';
import {
  branchPoint,
  candidateLabel,
  candidateShade,
  shadeSteps,
  isMistake,
  isOnMainLine,
  judgeLine,
  judgeMove,
  mainLine,
  scoreSeries,
  type MoveVerdict,
} from './reviewModel';
import { resultLabel } from './gameResult';
import { explainMove, factsForMove } from './explain';
import { Header, NavMenu, Segmented, Switch, type NavTarget } from './ui';
import { useNarrow } from './useNarrow';
import { RankPicker } from './RankPicker';
import { readLocalStorage, writeLocalStorage } from '../utils/storage';

const TERRITORY_KEY = 'web-katrain:sensei-show-territory:v1';
import { humanProfileFor, type Rank } from './rankLadder';

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

let lastReviewedRoot: GameNode | null = null;

type Props = {
  /** The player's rank, for "how often would a player of my rank play this?" */
  playerRank: Rank;
  onPlayerRankChange: (rank: Rank) => void;
  geminiApiKey: string;
  geminiModel: string;
  onNavigate: (target: NavTarget) => void;
  onAddProblem: (node: GameNode) => void;
  onPlayFromHere: (node: GameNode) => void;
  onOpenSettings: () => void;
  /** The player's colour in a game against the bot; mistakes are then only theirs. */
  humanColor?: Player | null;
};

/** Reviewing a finished game: mistakes, candidates, the score graph and try-outs. */
export const ReviewScreen: React.FC<Props> = ({ playerRank, onPlayerRankChange, geminiApiKey, geminiModel, onNavigate, onAddProblem, onPlayFromHere, onOpenSettings, humanColor }) => {
  const rootNode = useGameStore((s) => s.rootNode);
  const currentNode = useGameStore((s) => s.currentNode);
  const board = useGameStore((s) => s.board);
  const isGameAnalysisRunning = useGameStore((s) => s.isGameAnalysisRunning);
  const done = useGameStore((s) => s.gameAnalysisDone);
  const total = useGameStore((s) => s.gameAnalysisTotal);
  const analysisData = useGameStore((s) => s.analysisData);
  const treeVersion = useGameStore((s) => s.treeVersion);
  const katagoVisits = useGameStore((s) => s.settings.katagoVisits);

  const narrow = useNarrow();
  const [showTerritory, setShowTerritory] = useState(() => readLocalStorage(TERRITORY_KEY) === '1');
  const toggleTerritory = (on: boolean) => { setShowTerritory(on); writeLocalStorage(TERRITORY_KEY, on ? '1' : '0'); };
  const [explanation, setExplanation] = useState<{ nodeId: string; text: string } | null>(null);
  const [explaining, setExplaining] = useState<string | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);

  // Set the store up for reviewing once: no bot, live analysis on, a quick pass over the game.
  useEffect(() => {
    const store = useGameStore.getState();
    useGameStore.setState({ isAiPlaying: false, aiColor: null });
    if (!store.isAnalysisMode) store.toggleAnalysisMode();
    // Coming back to the same game keeps the place; a different game opens where it ended.
    if (lastReviewedRoot !== store.rootNode) {
      const line = mainLine(store.rootNode);
      store.jumpToNode(line[line.length - 1]!);
    }
    lastReviewedRoot = store.rootNode;
  }, []);

  // "打ち手の級位": read each position with the human net at the player's rank too.
  // Changing it wipes every analysis in the tree (web-katrain treats it as an
  // engine change), so the quick pass is started after it, never before.
  useEffect(() => {
    const store = useGameStore.getState();
    const profile = humanProfileFor(playerRank);
    const patch: Partial<typeof store.settings> = {};
    if (!store.settings.humanSlEnabled || store.settings.humanSlProfile !== profile) Object.assign(patch, { humanSlEnabled: true, humanSlProfile: profile });
    // A depth set elsewhere (not one of the three here) would show one choice and use another.
    if (!DEPTHS.some((d) => d.value === store.settings.katagoVisits)) patch.katagoVisits = 1000;
    if (Object.keys(patch).length > 0) store.updateSettings(patch);
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
  // Moves on the board now, try-outs included.
  let moveDepth = 0;
  for (let n = currentNode; n.parent; n = n.parent) moveDepth++;
  const anchor = branchPoint(currentNode);
  const anchorIndex = line.indexOf(anchor);
  const result = line[line.length - 1]?.endState ?? rootNode.properties?.RE?.[0] ?? null;

  // The move being judged: the next game move on the main line, otherwise the
  // latest try-out move.
  const judged: MoveVerdict | null = onMain
    ? verdicts.find((v) => v.moveNumber === anchorIndex + 1) ?? null
    : judgeMove(currentNode, currentNode.gameState.moveHistory.length);
  // The node whose move "AIに聞く" explains.
  const explainNode = onMain ? line[anchorIndex + 1] : currentNode;
  const judgedMove = onMain ? line[anchorIndex + 1]?.move : currentNode.move;

  // analysisData is the live (still deepening) analysis of the current node.
  const analysis = analysisData ?? currentNode.analysis ?? null;
  // Moves the search barely looked at have unreliable values; leave them out.
  const rootVisits = analysis?.rootVisits ?? 0;
  const lossOf = (m: { relativePointsLost?: number; pointsLost: number }) => Math.max(0, m.relativePointsLost ?? m.pointsLost);
  // Losses are against the engine's best move, a pass included; numbered from the smallest loss up.
  const allMoves = analysis?.moves ?? [];
  const bestIsPass = allMoves[0]?.x === -1 && allMoves[0].y === -1;
  const candidates = allMoves
    .filter((m, i) => m.x >= 0 && (i === 0 || m.visits >= Math.max(2, rootVisits * 0.01)))
    .sort((a, b) => lossOf(a) - lossOf(b) || (b === allMoves[0] ? 1 : 0) - (a === allMoves[0] ? 1 : 0))
    // In a try-out, the reply is the player's to choose: the opponent's best three.
    .slice(0, onMain ? 10 : 3);
  const isBest = (m: (typeof candidates)[number]) => m === allMoves[0];
  const steps = shadeSteps(candidates.map(lossOf));

  // Replaying the game's own move just steps forward; anything else is a try-out.
  const tryMove = (x: number, y: number) => useGameStore.getState().playMove(x, y);

  const goTo = (node: GameNode | undefined) => { if (node) useGameStore.getState().jumpToNode(node); };
  const mistakes = verdicts.filter((v) => isMistake(v) && (!humanColor || v.player === humanColor));
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

  const markers: BoardMarker[] = candidates.map((m, i) => {
    const shade = candidateShade(steps[i]!);
    return { x: m.x, y: m.y, label: candidateLabel(i), fill: shade.fill, textColor: shade.text };
  });
  // The move actually played next, ringed in its verdict's colour.
  const played = onMain && judgedMove && judgedMove.x >= 0 && !(judged?.quality === 'best') ? judgedMove : null;
  if (played) {
    const ring = judged?.quality ? QUALITY_COLOR[judged.quality] : '#d2333f';
    const hit = markers.find((m) => m.x === played.x && m.y === played.y);
    if (hit) hit.ring = ring;
    else markers.push({ x: played.x, y: played.y, ring });
  }
  const lastMove = currentNode.move && !isPass(currentNode.move) ? currentNode.move : null;
  // Expected territory: points each side is likely to own, counting stones expected to die.
  const territory = showTerritory ? analysis?.territory ?? null : null;
  let blackArea = 0;
  let whiteArea = 0;
  territory?.forEach((row, y) => row.forEach((v, x) => {
    const stone = board[y]?.[x];
    if (v > 0.5 && stone !== 'black') blackArea++;
    if (v < -0.5 && stone !== 'white') whiteArea++;
  }));
  const lead = analysis?.rootScoreLead;
  const shownExplanation = explanation && explainNode && explanation.nodeId === explainNode.id ? explanation.text : null;

  return (
    <>
      <Header
        title="検討"
        left={<NavMenu onNavigate={onNavigate} />}
        right={<span className="sensei-muted">{moveDepth}手目</span>}
      />
      <div className="sensei-game">
        <div className="sensei-board-wrap">
          <SenseiBoard board={board} lastMove={lastMove} markers={markers} territory={territory} dragPlayer={currentNode.gameState.currentPlayer} showCoords={!narrow} onTap={tryMove} />
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

          <div className="sensei-row">
            <span>
              地を表示
              {/* Always one line here, so turning it on does not move what is below. */}
              <span className="sensei-muted block">
                {territory
                  ? <>目安: 黒 {blackArea}目 · 白 {whiteArea}目{typeof lead === 'number' ? ` · 形勢 ${lead >= 0 ? '黒' : '白'}+${Math.abs(lead).toFixed(1)}目` : ''}</>
                  : 'AIが見込む陣地を盤に表示'}
              </span>
            </span>
            <Switch checked={showTerritory} onChange={toggleTerritory} label="地を表示" />
          </div>

          <div className="sensei-card sensei-stack">
            <div className="sensei-verdict">
              <span className="sensei-muted">{onMain ? '次の一手' : '試し打ち'}</span>
              {judged ? <Verdict verdict={judged} /> : <span className="sensei-muted">終局</span>}
              {!onMain && <button type="button" className="sensei-primary sensei-compact sensei-verdict-back" onClick={() => goTo(anchor)}>実戦に戻る</button>}
            </div>
            {/* Fixed height, however many candidates there are, so taps below never shift. */}
            <div className="sensei-candidates">
                {bestIsPass && candidates.length === 0 && <span className="sensei-muted">AIの最善はパスです</span>}
                {candidates.map((m, i) => {
                  const shade = candidateShade(steps[i]!);
                  return (
                    <button key={`${m.x}-${m.y}`} type="button" className={isBest(m) ? 'is-best' : ''} onClick={() => tryMove(m.x, m.y)}>
                      <b style={{ background: shade.fill, color: shade.text }}>{candidateLabel(i)}</b>
                      {isBest(m) ? '最善' : `−${lossOf(m).toFixed(1)}目`}
                    </button>
                  );
                })}
            </div>
          </div>

          <ScoreGraph series={series} verdicts={humanColor ? verdicts.filter((v) => v.player === humanColor) : verdicts} currentMove={Math.max(0, anchorIndex)} onSelect={(n) => goTo(line[Math.min(n, line.length - 1)])} />
          <p className="sensei-muted">
            {isGameAnalysisRunning ? `対局を解析中… ${done} / ${total}` : `${humanColor ? 'あなたの' : ''}悪手・敗着 ${mistakes.length}手`}
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
              <span>この局面から対局するときのAIの級位</span>
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
