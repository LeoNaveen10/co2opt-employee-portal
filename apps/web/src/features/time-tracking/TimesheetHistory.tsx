import { useState } from 'react';
import type { Timesheet } from './useTimesheet';
import { WeeklyTimesheet } from './WeeklyTimesheet';
import { weekLabel, dateLabel, addDays, duration, localDate, currentWeek, type Entry, type Ticket } from './types';
export function TimesheetHistory({ sheet, onCell, onAdd, onDelete }: { sheet: Timesheet; onCell: (entries: Entry[], ticket: Ticket, date: string) => void; onAdd: (ticket?: Ticket, date?: string) => void; onDelete: (entries: Entry[]) => void }) {
  const connected = sheet.status?.connection?.status === 'connected';
  const [error, setError] = useState('');
  async function retry(id: string, start: string) {
    try { setError(''); await sheet.mutate(`/time-tracking/operations/${id}/retry`, 'POST'); await sheet.loadWeek(start); }
    catch (problem) { setError((problem as Error).message); }
  }
  return <section className="timesheet-history" aria-label="Weekly time history">
    {sheet.weeks.map(week => {
      const open = sheet.expanded.has(week.start);
      return <section className="card time-week" id={`week-${week.start}`} key={week.start}>
        <div className="week-header"><h3 className="week-heading"><button className="week-toggle" title={`${dateLabel(week.start, { month: 'short', day: 'numeric', year: 'numeric' })} ? ${dateLabel(week.end, { month: 'short', day: 'numeric', year: 'numeric' })}`} aria-expanded={open} aria-controls={`week-detail-${week.start}`} onClick={() => sheet.toggle(week.start)}><svg className={`week-chevron${open ? ' is-open' : ''}`} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg><span className="week-title">{weekLabel(week.start)}</span><span className="week-days">{Array.from({ length: 5 }, (_, index) => {
          const date = addDays(week.start, index + 1);
          const tracked = week.trackedDates?.includes(date) || false;
          const label = dateLabel(date, { weekday: 'long', month: 'short', day: 'numeric' }) + ': ' + (week.loading || week.error || week.totalSeconds === null ? 'Not loaded' : tracked ? 'Time tracked' : 'No time tracked');
          return <span key={date} role="img" aria-label={label} title={label} className={`week-day-dot${tracked ? ' is-tracked' : ''}`} />;
        })}</span><span className="week-total">{week.loading ? 'Loading…' : week.totalSeconds === null ? 'Unavailable' : duration(week.totalSeconds)}</span></button></h3><button type="button" className="week-add" aria-label={`Add time for ${weekLabel(week.start)}`} title={`Add time for ${weekLabel(week.start)}`} disabled={!connected} onClick={() => onAdd(undefined, week.start === currentWeek() ? localDate() : week.start)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v10M7 12h10" /></svg></button></div>
        {(!!week.pendingCount || week.error) && <div className="week-meta">{!!week.pendingCount && <small>{week.pendingCount} requests need attention</small>}{week.error && <button className="ghost-btn small" disabled={week.loading} onClick={() => void sheet.loadWeek(week.start, true)}>Retry</button>}</div>}
        {week.pendingCreations?.map(op => <div className="mini-card" key={op.id}><strong>{op.ticketKey}</strong> · {op.date} · {duration(op.durationSeconds)} · {op.status === 'pending' || op.status === 'processing' ? 'Posting to Jira…' : 'Not saved'}<small className="time-request-note">This request is excluded from totals until Jira confirms success.</small>{op.error && <p className="time-error">{op.error}</p>}{['failed', 'reconcile', 'paused'].includes(op.status) && <button className="ghost-btn small" disabled={!connected} onClick={() => void retry(op.id, week.start)}>Retry</button>}</div>)}
        {open && <div id={`week-detail-${week.start}`}><WeeklyTimesheet week={week} connected={connected} onCell={onCell} onAdd={onAdd} onDelete={onDelete} /></div>}
      </section>;
    })}
    {error && <p role="alert" className="time-error">{error}</p>}
    {sheet.error && <p role="alert" className="time-error">{sheet.error} <button className="ghost-btn small" onClick={() => void sheet.loadBatch(sheet.cursor || undefined)}>Retry history</button></p>}
    <button className="ghost-btn load-weeks" disabled={sheet.loadingMore || !sheet.cursor} onClick={() => void sheet.loadBatch(sheet.cursor!)}>{sheet.loadingMore ? 'Loading history…' : 'Load More'}</button>
  </section>;
}
