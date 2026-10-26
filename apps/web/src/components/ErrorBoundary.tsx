import { Component, type ReactNode } from 'react';
import { report } from '../monitoring';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { report('react.render_failed'); }
  render() {
    return this.state.failed ? <main role="alert"><h1>Something went wrong</h1><p>Please reload the portal to try again.</p><button onClick={() => window.location.reload()}>Reload</button></main> : this.props.children;
  }
}
