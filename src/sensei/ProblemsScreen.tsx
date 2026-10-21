import React, { useState } from 'react';
import { SenseiBoard, type BoardMarker } from './SenseiBoard';
import { candidateLabel, candidateShade } from './reviewModel';
import { isCorrect, nextProblem, type Problem } from './problems';
import { Dialog, Header } from './ui';

type Props = {
  problems: readonly Problem[];
  onAttempt: (id: string, correct: boolean) => void;
  onDelete: (id: string) => void;
};

type Attempt = { problemId: string; x: number; y: number; correct: boolean };

/** "次の一手" practice: positions saved from reviews, answered by tapping the board. */
export const ProblemsScreen: React.FC<Props> = ({ problems, onAttempt, onDelete }) => {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const problem = problems.find((p) => p.id === currentId) ?? null;
  const solvedCount = problems.filter((p) => p.solved > 0).length;

  const start = () => {
    const next = nextProblem(problems.filter((p) => p.id !== currentId)) ?? nextProblem(problems);
    setCurrentId(next?.id ?? null);
    setAttempt(null);
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
                  <div className="sensei-muted">問題集</div>
                  <div className="sensei-big">{problems.length}問</div>
                </div>
                <div className="sensei-muted">正解済み {solvedCount}問</div>
              </div>
              <button type="button" className="sensei-primary sensei-block" onClick={start}>練習を始める</button>
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
        left={<button type="button" className="sensei-back" onClick={() => setCurrentId(null)}>‹ 一覧</button>}
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
              setAttempt({ problemId: problem.id, x, y, correct });
              onAttempt(problem.id, correct);
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
            <button type="button" className="sensei-primary" onClick={start}>次の問題</button>
          </div>
          <p className="sensei-muted text-center">挑戦 {problem.attempts}回 · 正解 {problem.solved}回</p>
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
