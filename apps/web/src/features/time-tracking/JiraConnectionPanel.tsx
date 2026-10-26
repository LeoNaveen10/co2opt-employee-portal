import { useState } from 'react';
import type { Timesheet } from './useTimesheet';
export function JiraConnectionPanel({ sheet }: { sheet: Timesheet }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const { status } = sheet;
  async function change(action: string) {
    setBusy(true); setError('');
    try {
      const result = await sheet.mutate(`/jira/${action}`, 'POST') as { url?: string };
      if (result.url) { window.location.assign(result.url); return; }
      await sheet.refreshLoaded();
    } catch (problem) { setError((problem as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="card jira-panel" aria-label="Jira connection">
    <div><h3>Jira connection</h3>
      {!status ? <p role="status">Loading connection…</p> : !status.configured ? <p>Jira setup is needed. Ask your administrator to configure the approved site and OAuth integration.</p> : status.connection ? <><p><strong>{status.connection.displayName}</strong> · <a href={status.connection.siteUrl} target="_blank" rel="noreferrer">{status.connection.siteUrl}</a></p><span className="tag">{status.connection.status === 'connected' ? 'Connected' : 'Reconnect needed'}</span></> : <p>Connect your Jira account to find tickets and sync your own worklogs.</p>}
      {error && <p role="alert" className="time-error">{error}</p>}
    </div>
    <div className="inline-actions"><button className="primary-btn" disabled={busy || !status?.configured} onClick={() => void change('connect')}>{status?.connection ? 'Reconnect Jira' : 'Connect Jira'}</button>
      {status?.connection?.status !== 'disconnected' && status?.connection && <button className="ghost-btn" disabled={busy} onClick={() => void change('disconnect')}>Disconnect</button>}
    </div>
  </section>;
}
