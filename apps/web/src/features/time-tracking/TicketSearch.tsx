import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import type { Ticket } from './types';
export function TicketSearch({ value, onChange }: { value: Ticket | null; onChange: (ticket: Ticket | null) => void }) {
  const [query, setQuery] = useState(''), [tickets, setTickets] = useState<Ticket[]>([]), [cursor, setCursor] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const latestQuery = useRef(query);
  latestQuery.current = query;
  useEffect(() => {
    let cancelled = false;
    setTickets([]); setCursor(null); setError(''); setMessage('');
    if (!query.trim() || value) { setBusy(false); return; }
    setBusy(true);
    const timer = setTimeout(() => {
      void api<{ tickets: Ticket[]; cursor: string | null; message?: string }>(`/jira/tickets?q=${encodeURIComponent(query.trim())}`).then(result => { if (!cancelled) { setTickets(result.tickets); setCursor(result.cursor); setMessage(result.message || ''); } }).catch(problem => { if (!cancelled) setError(problem.message); }).finally(() => { if (!cancelled) setBusy(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, value]);
  async function more() {
    const requestedQuery = query;
    setBusy(true); setError('');
    try { const result = await api<{ tickets: Ticket[]; cursor: string | null }>(`/jira/tickets?q=${encodeURIComponent(query.trim())}&cursor=${encodeURIComponent(cursor!)}`); if (latestQuery.current === requestedQuery) { setTickets(old => [...new Map([...old, ...result.tickets].map(t => [t.id, t])).values()]); setCursor(result.cursor); } }
    catch (problem) { if (latestQuery.current === requestedQuery) setError((problem as Error).message); } finally { if (latestQuery.current === requestedQuery) setBusy(false); }
  }
  return <div className="catalog-search">
    {value ? <div className="mini-card"><strong>{value.key}</strong> {value.summary} <button type="button" className="ghost-btn small" onClick={() => onChange(null)}>Change ticket</button></div> : <>
      <label>Jira ticket<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Ticket key, number, URL, or title" autoComplete="off" maxLength={500} /></label>
      {busy && <span role="status">Searching Jira…</span>}
      {error && <p role="alert" className="time-error">{error}</p>}
      {!busy && !error && query.trim() && !tickets.length && <p role="status">{message || 'No accessible tickets found. Check the ticket key, project configuration, and Jira permissions.'}</p>}
      <div className="catalog-results" aria-label="Ticket results">{tickets.map(ticket => <button type="button" className="catalog-result" key={ticket.id} onClick={() => onChange(ticket)}><span><strong>{ticket.key} · {ticket.summary}</strong><small>{ticket.project}</small></span></button>)}</div>
      {cursor && <button type="button" className="ghost-btn small" disabled={busy} onClick={() => void more()}>More tickets</button>}
    </>}
  </div>;
}
