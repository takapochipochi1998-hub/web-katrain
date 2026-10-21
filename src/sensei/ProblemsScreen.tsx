import React, { useState } from 'react';
import { SenseiBoard, type BoardMarker } from './SenseiBoard';
import { candidateLabel, candidateShade } from './reviewModel';
import { isCorrect, isDue, nextDueAt, nextProblem, type Problem } from './problems';
import { Dialog, Header } from './ui';

type Props = {
  problems: readonly Problem[];
  onAttempt: (id: string, correct: boolean) => void;
  onDelete: (id: string) => void;
};

type Attempt = { problemId: string; x: number; y: number; correct: boolean; at: number };

/** "次の一手" practice: positions saved from reviews, answered by tapping the board. */
export const ProblemsScreen: React.FC<Props> = ({ problems, onAttempt, onDelete }) => {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Only the first answer to a showing counts toward the schedule; "もう一度" is free.
  const [graded, setGraded] = useState<ReadonlySet<string>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());

  const problem = problems.find((p) => p.id === currentId) ?? null;
  const dueCount = problems.filter((p) => isDue(p, now)).length;
  const upcoming = nextDueAt(problems);

  /** The next due problem, or (ahead) the one due soonest; back to the list when none. */
  const start = (ahead = false) => {
    const t = Date.now();
    setNow(t);
    const rest = problems.filter((p) => p.id !== currentId);
    const next = nextProblem(rest, t, ahead);
    setCurrentId(next?.id ?? null);
    setAttempt(null);
    setGraded(new Set());
  };

  if (!problem) {
    return (
      <>
        <Header title="次の一手" />
        <div className="sensei-page">
          {problems.length === 0 ? (
            <p className="sensei-empty">問題はまだありません。<br />検討画面の「問題集に追加」で、悪手の局面を問題にできます。</p>
          ) : (
            <div className="sensei-card sensei-stack">
              <div className="flex items-end justify-between">
                <div>
                  <div className="sensei-muted">今日の復習</div>
                  <div className="sensei-big">{dueCount}問</div>
                </div>
                <div className="sensei-muted text-right">全{problems.length}問</div>
              </div>
              {dueCount > 0 ? (
                <button type="button" className="sensei-primary sensei-block" onClick={() => start()}>復習を始める</button>
              ) : (
                <>
                  <p className="sensei-muted">今日の分は終わりました。{upcoming ? `次は${dueLabel(upcoming, now)}です。` : ''}</p>
                  <button type="button" className="sensei-secondary sensei-block" onClick={() => start(true)}>前倒しで解く</button>
                </>
              )}
              <p className="sensei-muted text-xs">正解した問題は 1日後・3日後・…と間隔を広げて、間違えた問題は10分後にもう一度出します（Anki と同じ考え方）。</p>
            </div>
          )}
        </div>
      </>
    );
  }

  const answered = attempt && attempt.problemId === problem.id ? attempt : null;
  const markers: BoardMarker[] = answered
    ? [
        ...problem.answers.map((a, i) => { const shade = candidateShade(i === 0 ? 0 : 0.5); return { x: a.x, y: a.y, label: candidateLabel(i), fill: shade.fill, textColor: shade.text }; }),
        ...(problem.played && !isCorrect(problem, problem.played.x, problem.played.y)
          ? [{ x: problem.played.x, y: problem.played.y, label: '実', fill: '#d97b20', textColor: '#fff' }]
          : []),
        ...(answered.correct ? [] : [{ x: answered.x, y: answered.y, label: '×', fill: '#d2333f', textColor: '#fff' }]),
      ]
    : [];

  return (
    <>
      <Header
        title="次の一手"
        left={<button type="button" className="sensei-back" aria-label="一覧に戻る" onClick={() => { setNow(Date.now()); setCurrentId(null); }}>‹</button>}
        right={<button type="button" className="sensei-ghost" onClick={() => setConfirmDelete(true)}>削除</button>}
      />
      <div className="sensei-game">
        <div className="sensei-board-wrap">
          <SenseiBoard
            board={problem.board}
            markers={markers}
            disabled={!!answered}
            dragPlayer={answered ? null : problem.toPlay}
            onTap={(x, y) => {
              if (problem.board[y]?.[x]) return;
              const correct = isCorrect(problem, x, y);
              setAttempt({ problemId: problem.id, x, y, correct, at: Date.now() });
              if (!graded.has(problem.id)) {
                setGraded(new Set([...graded, problem.id]));
                onAttempt(problem.id, correct);
              }
            }}
          />
        </div>
        <div className="sensei-side">
          <div className="sensei-status">
            {answered
              ? answered.correct ? '正解です！' : '残念、不正解です'
              : `${problem.toPlay === 'black' ? '黒' : '白'}番です。最善の一手は？`}
          </div>
          {answered && (
            <p className="sensei-muted text-center">
              1 がAIの最善手{problem.answers.length > 1 ? `、${problem.answers.slice(1).map((_, i) => candidateLabel(i + 1)).join('・')} もほぼ同じ価値` : ''}です。
              {problem.played && !isCorrect(problem, problem.played.x, problem.played.y) ? '「実」は実戦で打った手です。' : ''}
            </p>
          )}
          <div className="sensei-actions">
            <button type="button" className="sensei-secondary" disabled={!answered} onClick={() => setAttempt(null)}>もう一度</button>
            <button type="button" className="sensei-primary" onClick={() => start()}>次の問題</button>
          </div>
          <p className="sensei-muted text-center">
            挑戦 {problem.attempts}回 · 正解 {problem.solved}回
            {answered && problem.dueAt ? ` · 次の復習: ${dueLabel(problem.dueAt, answered.at)}` : ''}
          </p>
        </div>
      </div>
      {confirmDelete && (
        <Dialog title="この問題を削除しますか？" onClose={() => setConfirmDelete(false)}>
          <div className="sensei-actions">
            <button type="button" className="sensei-secondary" onClick={() => setConfirmDelete(false)}>やめる</button>
            <button type="button" className="sensei-danger" onClick={() => { onDelete(problem.id); setConfirmDelete(false); setCurrentId(null); }}>削除する</button>
          </div>
        </Dialog>
      )}
    </>
  );
};

/** "10分後", "明日", "3日後". */
function dueLabel(at: number, now: number): string {
  const minutes = Math.max(0, Math.round((at - now) / 60000));
  if (minutes < 60) return minutes <= 1 ? 'すぐ' : `${minutes}分後`;
  const days = Math.round((at - now) / 86400000);
  if (days < 1) return `${Math.round(minutes / 60)}時間後`;
  return days === 1 ? '明日' : `${days}日後`;
}
