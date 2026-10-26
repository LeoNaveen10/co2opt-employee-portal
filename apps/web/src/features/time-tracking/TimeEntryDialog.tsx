import { useRef, useState, type FormEvent } from 'react';
import { Dialog } from '../../components/Dialog';
import { TicketSearch } from './TicketSearch';
import { localDate, duration, previewDuration, type Entry, type Ticket } from './types';
import type { Timesheet } from './useTimesheet';
export type EntryDraft = { entry?: Entry; ticket?: Ticket; date?: string };
export function TimeEntryDialog({ draft, sheet, onClose, onSaved }: { draft: EntryDraft; sheet: Timesheet; onClose: () => void; onSaved: (date: string) => Promise<void> }) {
  const snapshot = draft.entry?.confirmed;
  const [ticket, setTicket] = useState<Ticket | null>(draft.ticket || null), [date, setDate] = useState(snapshot ? localDate(snapshot.started) : draft.date || localDate()), [spent, setSpent] = useState(snapshot ? duration(snapshot.durationSeconds) : '1h'), [description, setDescription] = useState(snapshot?.description || ''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const operationId = useRef(crypto.randomUUID());
  const preview = previewDuration(spent);
  const holiday = sheet.weeks.some(w => w.holidays.includes(date));
  function adjustTime(direction: number) {
    const normalized = preview || '1h';
    const hours = Number(/(\d+)h/.exec(normalized)?.[1] || 0), minutes = Number(/(\d+)m/.exec(normalized)?.[1] || 0);
    setSpent(duration(Math.max(60, Math.min(86400, (hours * 60 + minutes + direction * 30) * 60))));
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!preview || (!ticket && !draft.entry) || busy) return;
    setBusy(true); setError('');
    try {
      await sheet.mutate(`/time-tracking/entries${draft.entry ? `/${draft.entry.id}` : ''}`, draft.entry ? 'PUT' : 'POST', { clientOperationId: operationId.current, ...(draft.entry ? { version: draft.entry.version } : { issueId: ticket!.id }), date, duration: spent, description });
      await onSaved(date); onClose();
    } catch (problem) { setError((problem as Error).message); } finally { setBusy(false); }
  }
  return <Dialog busy={busy} onClose={onClose} titleId="time-entry-title"><h3 id="time-entry-title">{draft.entry ? 'Edit time' : 'Add time'}</h3>
    <form className="form-stack" onSubmit={event => void save(event)}>
      <div className="time-form-row"><div><label htmlFor="entry-duration">Time</label><div className="time-duration-control"><button type="button" aria-label="Decrease time by 30 minutes" disabled={busy} onClick={() => adjustTime(-1)}>−</button><input id="entry-duration" required value={spent} onChange={e => setSpent(e.target.value)} placeholder="1h 30m or 1:30" aria-describedby="time-preview" maxLength={50} /><button type="button" aria-label="Increase time by 30 minutes" disabled={busy} onClick={() => adjustTime(1)}>+</button></div></div><label>Date<input required type="date" max={localDate()} value={date} onChange={e => setDate(e.target.value)} /></label></div>
      {holiday && <p className="holiday-note" role="status">Holiday — time not needed. You can still record work actually done.</p>}
      <small id="time-preview">{preview ? `Will log ${preview}` : 'Use whole minutes, from 1m to 24h.'}</small>
      {draft.entry ? <p><strong>{draft.entry.ticketKey}</strong> · {draft.entry.summary}</p> : <TicketSearch value={ticket} onChange={setTicket} />}
      <label>Work description (optional)<textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={10000} /></label>
      <small>Time is saved to your timesheet only after Jira confirms it.</small>
      {error && <p role="alert" className="time-error">{error}</p>}
      <div className="inline-actions"><button type="submit" className="primary-btn" disabled={busy || !preview || (!ticket && !draft.entry)}>{busy ? 'Posting to Jira…' : draft.entry ? 'Save changes' : 'Add Time'}</button><button type="button" className="ghost-btn" disabled={busy} onClick={onClose}>Cancel</button></div>
    </form>
  </Dialog>;
}
