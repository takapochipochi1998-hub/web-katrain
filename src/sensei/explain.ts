/**
 * "AIに聞く": the facts about one move are worked out here from KataGo's
 * analysis, and the language model is only asked to put them into words.
 * Language models misread Go positions, so nothing the model says should be
 * something it had to read on the board itself.
 */
import type { GameNode } from '../types';
import { MOVE_QUALITY_LABEL } from './moveQuality';
import { gtpLineLabel, pointLabel } from './coords';
import { judgeMove } from './reviewModel';

export type MoveFacts = {
  boardSize: number;
  moveNumber: number;
  color: '黒' | '白';
  played: string;
  quality: string | null;
  pointsLost: number | null;
  scoreBefore: number | null; // Black's lead
  scoreAfter: number | null;
  best: string | null;
  bestLine: string;
  playedLine: string;
  otherGoodMoves: string[];
  /** Points that changed hands by the move, from the territory estimate. */
  ownershipSwing: { toMover: number; toOpponent: number };
  /** The mover's stones the estimate now gives to the opponent: likely to die. */
  endangeredStones: string[];
};

const roundLead = (v: number | undefined | null) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

/** Facts for the move that led to `node`; null when the move or its analysis is missing. */
export function factsForMove(node: GameNode): MoveFacts | null {
  const move = node.move;
  const parent = node.parent;
  if (!move || !parent || move.x < 0) return null;
  const size = node.gameState.board.length;
  const verdict = judgeMove(node, node.gameState.moveHistory.length);
  const before = parent.analysis;
  const after = node.analysis;
  if (!before) return null;

  const mover = move.player;
  const sign = mover === 'black' ? 1 : -1;
  const best = before.moves.find((m) => m.x >= 0) ?? null;
  const playedCandidate = before.moves.find((m) => m.x === move.x && m.y === move.y);

  let toMover = 0;
  let toOpponent = 0;
  const endangered: string[] = [];
  if (before.territory?.length && after?.territory?.length) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const delta = ((after.territory[y]?.[x] ?? 0) - (before.territory[y]?.[x] ?? 0)) * sign;
        if (delta > 0.6) toMover++;
        if (delta < -0.6) toOpponent++;
        const own = (after.territory[y]?.[x] ?? 0) * sign;
        if (node.gameState.board[y]?.[x] === mover && own < -0.6) endangered.push(pointLabel(x, y));
      }
    }
  }

  return {
    boardSize: size,
    moveNumber: verdict?.moveNumber ?? node.gameState.moveHistory.length,
    color: mover === 'black' ? '黒' : '白',
    played: pointLabel(move.x, move.y),
    quality: verdict?.quality ? MOVE_QUALITY_LABEL[verdict.quality] : null,
    pointsLost: verdict?.pointsLost === null || verdict?.pointsLost === undefined ? null : Math.round(verdict.pointsLost * 10) / 10,
    scoreBefore: roundLead(before.rootScoreLead),
    scoreAfter: roundLead(after?.rootScoreLead),
    best: best ? pointLabel(best.x, best.y) : null,
    bestLine: gtpLineLabel(best?.pv, size, mover),
    playedLine: gtpLineLabel(playedCandidate?.pv, size, mover),
    otherGoodMoves: before.moves
      .filter((m) => m.x >= 0 && m !== best && Math.max(0, m.pointsLost) <= 1)
      .slice(0, 3)
      .map((m) => pointLabel(m.x, m.y)),
    ownershipSwing: { toMover, toOpponent },
    endangeredStones: endangered.slice(0, 12),
  };
}

const lead = (v: number | null) => (v === null ? '不明' : v >= 0 ? `黒が${v}目リード` : `白が${-v}目リード`);

export function factsToText(f: MoveFacts): string {
  const lines = [
    `盤の大きさ: ${f.boardSize}路`,
    `${f.moveNumber}手目 ${f.color}: ${f.played}`,
    `評価: ${f.quality ?? '未解析'}${f.pointsLost !== null ? `（最善手と比べて約${Math.max(0, f.pointsLost)}目の損）` : ''}`,
    `形勢: 打つ前 ${lead(f.scoreBefore)} → 打った後 ${lead(f.scoreAfter)}`,
    `AIの最善手: ${f.best ?? '不明'}`,
    f.bestLine && `最善手の読み筋: ${f.bestLine}`,
    f.playedLine && `実戦の手を打った場合のAIの読み筋: ${f.playedLine}`,
    f.otherGoodMoves.length > 0 && `ほかに良い手: ${f.otherGoodMoves.join('、')}`,
    `地の予測の変化: ${f.color}に移った点 ${f.ownershipSwing.toMover}、相手に移った点 ${f.ownershipSwing.toOpponent}`,
    f.endangeredStones.length > 0 && `この手の後、取られそうになった${f.color}の石: ${f.endangeredStones.join('、')}`,
  ];
  return lines.filter(Boolean).join('\n');
}

export const EXPLAIN_SYSTEM_PROMPT = [
  'あなたは級位者に教える囲碁の先生です。',
  '渡される「事実」はKataGoの解析から計算したものです。盤面を自分で読まず、事実だけに基づいて説明してください。',
  '事実にないこと（石の生死、手筋の名前、定石の名前）は断定しないでください。読み筋から確実に言える場合だけ「〜の筋」と述べてよい。',
  '構成: 1文目で手の良し悪しを言い切る。続けて、なぜ損なのか（または良いのか）を読み筋と地の変化から説明し、最後に最善手の狙いを一言で述べる。',
  '3〜5文、です・ます調、座標は「4の三」の形式で書く。',
].join('\n');

/** Slow "thinking" models can take minutes; better to say so than to spin. */
export const EXPLAIN_TIMEOUT_MS = 30_000;

export type ExplainRequest = { apiKey: string; model: string; facts: MoveFacts; question?: string };

/** Ask Gemini to put the facts into words. Throws with a readable message on failure. */
export async function explainMove({ apiKey, model, facts, question }: ExplainRequest, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (!apiKey) throw new Error('GeminiのAPIキーが設定されていません（設定画面で入力してください）。');
  const user = `事実:\n${factsToText(facts)}${question ? `\n\n質問: ${question}` : ''}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXPLAIN_TIMEOUT_MS);
  const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    signal: controller.signal,
    // The key goes in a header, never in the URL.
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: EXPLAIN_SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
    }),
  }).catch((e: unknown) => {
    throw new Error(controller.signal.aborted
      ? `Geminiから${EXPLAIN_TIMEOUT_MS / 1000}秒以内に返事がありませんでした。時間をおくか、設定で別のモデルを試してください。`
      : `Geminiに接続できませんでした（${e instanceof Error ? e.message : String(e)}）。通信状態を確認してください。`);
  }).finally(() => clearTimeout(timer));
  const body = (await res.json().catch(() => null)) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(`Geminiの呼び出しに失敗しました（${res.status}）: ${body?.error?.message ?? '不明なエラー'}`);
  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
  if (!text) throw new Error('Geminiから解説が返ってきませんでした。');
  return text;
}
