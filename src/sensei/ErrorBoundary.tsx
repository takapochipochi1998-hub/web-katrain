import React from 'react';
import { errorText, log } from './log';

type Props = { children: React.ReactNode; onReset: () => void };
type State = { error: unknown };

/** Shows what broke instead of a blank screen, and records it in the log. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    log('crash', { error: errorText(error).slice(0, 800), component: info.componentStack?.split('\n').slice(0, 4).join(' | ') });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="sensei-page sensei-stack">
        <h2 className="text-lg font-bold">画面の表示に失敗しました</h2>
        <p className="sensei-muted">内容はログに記録しました。設定の「ログをコピー」から送ってください。</p>
        <pre className="sensei-log">{errorText(this.state.error)}</pre>
        <button type="button" className="sensei-primary" onClick={() => { this.setState({ error: null }); this.props.onReset(); }}>
          対局のトップへ戻る
        </button>
      </div>
    );
  }
}
