import { useRef, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import type { Timesheet } from './useTimesheet';
import { duration, localDate, type Entry } from './types';

export function DeleteTimeDialog({ entries, sheet, onClose }: { entries: Entry[]; sheet: Timesheet; onClose: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const operations = useRef(new Map(entries.map(entry => [entry.id, crypto.randomUUID()])));
  const requested = useRef(new Set<string>());
  const total = entries.reduce((sum, entry) => sum + (entry.confirmed?.durationSeconds || 0), 0);
  async function remove() {
    setBusy(true); setError('');
    try {
      for (const entry of entries) {
        if (requested.current.has(entry.id)) continue;
        await sheet.mutate(`/time-tracking/entries/${entry.id}`, 'DELETE', { version: entry.version, clientOperationId: operations.current.get(entry.id) });
        requested.current.add(entry.id);
      }
      await sheet.refreshLoaded(); onClose();
    } catch (problem) {
      setError(`${(problem as Error).message}${requested.current.size ? ` ${requested.current.size} deletion requests have already been sent.` : ''}`);
      await sheet.refreshLoaded().catch(() => {});
    } finally { setBusy(false); }
  }
  return <Dialog busy={busy} onClose={onClose} titleId="delete-time-title">
    <h3 id="delete-time-title">Delete time for {entries[0].ticketKey}?</h3>
    <p>Delete {entries.length === 1 ? 'this entry' : `these ${entries.length} entries`} from this week's row? Total: <strong>{duration(total)}</strong>.</p>
    <ul>{entries.map(entry => <li key={entry.id}>{localDate(entry.confirmed!.started)} · {duration(entry.confirmed!.durationSeconds)}</li>)}</ul>
    {error && <p role="alert" className="time-error">{error}</p>}
    <div className="inline-actions"><button className="primary-btn" disabled={busy} onClick={() => void remove()}>{busy ? 'Deleting…' : 'Confirm deletion'}</button><button className="ghost-btn" disabled={busy} onClick={onClose}>Cancel</button></div>
  </Dialog>;
}
