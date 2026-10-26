import { addDays, localDate, dateLabel, duration, type Week, type Entry, type Ticket } from './types';
export function WeeklyTimesheet({ week, connected, onCell, onAdd, onDelete }: { week: Week; connected: boolean; onCell: (entries: Entry[], ticket: Ticket, date: string) => void; onAdd: (ticket?: Ticket, date?: string) => void; onDelete: (entries: Entry[]) => void }) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(week.start, i));
  const entries = week.entries || [];
  const tickets = [...new Map(entries.map(e => [e.issueId, { id: e.issueId, key: e.ticketKey, summary: e.summary }])).values()];
  const confirmed = (entry: Entry, date: string) => entry.confirmed && localDate(entry.confirmed.started) === date ? entry.confirmed.durationSeconds : 0;
  const totals = dates.map(date => entries.reduce((sum, e) => sum + confirmed(e, date), 0));
  return <>
    {week.error && <p role="alert" className="time-error">{week.error} {week.entries && 'Showing cached entries; totals may be stale.'}</p>}
    {week.loading && <p role="status">Loading this week…</p>}
    <div className="table-wrap time-table-wrap" role="region" aria-label={`Timesheet starting ${week.start}`} tabIndex={0}>
      <table className="time-table"><caption>Saved worklogs</caption>
        <thead><tr><th scope="col">Jira ticket</th>{dates.map(date => <th scope="col" key={date} className={week.holidays.includes(date) ? 'holiday-day' : ''}><span>{dateLabel(date, { weekday: 'short' })}</span><time dateTime={date}>{dateLabel(date)}</time>{week.holidays.includes(date) && <small className="holiday-note">On Leave</small>}</th>)}<th scope="col">Total</th></tr></thead>
        <tbody>{tickets.map(ticket => {
          const issueEntries = entries.filter(e => e.issueId === ticket.id);
          return <tr key={ticket.id}><th scope="row"><div className="time-ticket-label"><a className="time-ticket-title" href={issueEntries[0].ticketUrl} target="_blank" rel="noreferrer" title={ticket.summary}>{ticket.summary}</a><a className="time-ticket-key" href={issueEntries[0].ticketUrl} target="_blank" rel="noreferrer">{ticket.key}</a></div></th>{dates.map(date => {
            const cell = issueEntries.filter(e => [e.confirmed, e.desired].some(v => v && localDate(v.started) === date));
            const total = cell.reduce((sum, e) => sum + confirmed(e, date), 0);
            const pending = cell.some(e => e.state !== 'synced');
            return <td key={date} className={week.holidays.includes(date) ? 'holiday-day' : ''}><button type="button" className={`time-cell${pending ? ' has-pending' : ''}`} disabled={!cell.length && (!connected || date > localDate())} aria-label={`${ticket.key}, ${date}, ${duration(total)}${pending ? ', pending or failed changes' : ''}${week.holidays.includes(date) ? ', holiday, time not needed' : ''}`} onClick={() => cell.length ? onCell(cell, ticket, date) : onAdd(ticket, date)}>{total ? duration(total) : cell.length ? '0h' : '—'}{pending && <small>Sync details</small>}</button></td>;
          })}<td><div className="time-row-total"><strong>{duration(dates.reduce((sum, date) => sum + issueEntries.reduce((n, e) => n + confirmed(e, date), 0), 0))}</strong><button type="button" className="time-row-delete" aria-label={`Delete ${ticket.key} entries for this week`} title="Delete this week's entries" disabled={!connected || issueEntries.some(e => e.state !== 'synced')} onClick={() => onDelete(issueEntries)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg></button></div></td></tr>;
        })}
        {!tickets.length && <tr><td colSpan={9}>{week.loading ? 'Fetching entries…' : week.error ? 'Logged time is unavailable until this week refreshes successfully.' : 'No time logged this week.'}</td></tr>}</tbody>
        <tfoot><tr><th scope="row">Daily total{week.error && <small>Cached · unverified</small>}</th>{totals.map((total, i) => <td key={dates[i]}>{week.entries ? duration(total) : '—'}</td>)}<td><strong>{week.entries ? duration(totals.reduce((sum, n) => sum + n, 0)) : '—'}</strong></td></tr></tfoot>
      </table>
    </div>
  </>;
}
