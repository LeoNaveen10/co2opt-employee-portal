import { useRef, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import type { Timesheet } from './useTimesheet';
import { duration, localDate, type Entry } from './types';
export function TimeEntryList({ entries, date, sheet, onClose, onEdit, onAdd }: { entries: Entry[]; date: string; sheet: Timesheet; onClose: () => void; onEdit: (entry: Entry) => void; onAdd: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [deleting, setDeleting] = useState<Entry | null>(null);
  const deleteId = useRef(crypto.randomUUID());
  const connected = sheet.status?.connection?.status === 'connected';
  async function change(entry: Entry, action: string) {
    setBusy(true); setError('');
    try {
      await sheet.mutate(`/time-tracking/entries/${entry.id}${action === 'delete' ? '' : `/${action}`}`, action === 'delete' ? 'DELETE' : 'POST', action === 'delete' ? { version: entry.version, clientOperationId: deleteId.current } : {});
      setDeleting(null); await sheet.refreshLoaded();
    } catch (problem) { setError((problem as Error).message); } finally { setBusy(false); }
  }
  return <Dialog busy={busy} onClose={onClose} titleId="time-list-title"><h3 id="time-list-title">Time entries · {date}</h3>
    {error && <p role="alert" className="time-error">{error}</p>}
    {deleting ? <div><p>Delete <strong>{deleting.ticketKey}</strong> on <strong>{localDate(deleting.confirmed!.started)}</strong> for <strong>{duration(deleting.confirmed!.durationSeconds)}</strong>?</p><p>The entry stays pending until Jira confirms removal.</p><div className="inline-actions"><button className="primary-btn" disabled={busy} onClick={() => void change(deleting, 'delete')}>Confirm deletion</button><button className="ghost-btn" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button></div></div> : <>
      <div className="stack-list">{entries.length ? entries.map(entry => <article className="mini-card" key={entry.id}>
        <a href={entry.ticketUrl} target="_blank" rel="noreferrer"><strong>{entry.ticketKey}</strong></a> · <span className={`tag sync-${entry.state}`}>{entry.state === 'pending-delete' ? 'Pending deletion' : entry.state}</span>
        {entry.confirmed && <p>Saved: {localDate(entry.confirmed.started)} · {duration(entry.confirmed.durationSeconds)}</p>}
        {entry.desired && entry.state !== 'synced' && <p>Pending: {localDate(entry.desired.started)} · {duration(entry.desired.durationSeconds)}</p>}
        <p className="time-description">{(entry.desired || entry.confirmed)?.description}</p>
        {entry.error && <p className="time-error">{entry.error}</p>}
        <div className="inline-actions"><button className="ghost-btn small" disabled={busy || !connected || entry.state !== 'synced'} onClick={() => onEdit(entry)}>Edit</button><button className="ghost-btn small" disabled={busy || !connected || entry.state !== 'synced'} onClick={() => { deleteId.current = crypto.randomUUID(); setDeleting(entry); }}>Delete</button>
          {entry.state === 'failed' && <><button className="ghost-btn small" disabled={busy || !connected} onClick={() => void change(entry, 'retry')}>Retry sync</button><button className="ghost-btn small" disabled={busy || !connected} onClick={() => void change(entry, 'discard')}>Discard pending change</button>{entry.error?.includes('changed in Jira') && <button className="ghost-btn small" disabled={busy || !connected} onClick={() => void change(entry, 'reload')}>Load changed Jira entry</button>}</>}
          {entry.state.startsWith('pending') && <button className="ghost-btn small" disabled={busy || !connected} onClick={() => void change(entry, 'retry')}>Resume / retry</button>}
        </div>
      </article>) : <p>No entries remain in this cell.</p>}</div>
      <button className="primary-btn" disabled={busy || !connected || date > localDate()} onClick={onAdd}>Add another entry</button>
    </>}
  </Dialog>;
}
