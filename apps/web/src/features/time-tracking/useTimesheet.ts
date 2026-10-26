import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { addDays, currentWeek, type Week, type ConnectionStatus } from './types';
function blank(start: string): Week { return { start, end: addDays(start, 6), totalSeconds: null, lastRefreshed: null, error: null, holidays: [], loading: true }; }
export function useTimesheet() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [weeks, setWeeks] = useState<Week[]>(() => Array.from({ length: 5 }, (_, i) => blank(addDays(currentWeek(), -7 * i))));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([currentWeek()]));
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true), batchBusy = useRef(false);
  const detailRequests = useRef(new Set<string>());
  async function loadStatus() { const result = await api<ConnectionStatus>('/jira/status'); if (alive.current) setStatus(result); return result; }
  async function loadWeek(start: string, force = false) {
    if (detailRequests.current.has(start)) return;
    detailRequests.current.add(start);
    setWeeks(old => old.map(w => w.start === start ? { ...w, loading: true } : w));
    try {
      const result = await api<Week>(`/time-tracking/week/${start}${force ? '?refresh=1' : ''}`);
      if (alive.current) setWeeks(old => old.map(w => w.start === start ? result : w));
    } catch (problem) {
      if (alive.current) setWeeks(old => old.map(w => w.start === start ? { ...w, totalSeconds: null, loading: false, error: (problem as Error).message } : w));
    } finally { detailRequests.current.delete(start); }
  }
  async function loadBatch(next?: string) {
    if (batchBusy.current) return;
    batchBusy.current = true; setLoadingMore(true); setError('');
    try {
      const result = await api<{ weeks: Week[]; cursor: string }>(`/time-tracking/history${next ? `?cursor=${next}` : ''}`);
      if (alive.current) {
        setWeeks(old => {
          const map = new Map(old.map(w => [w.start, w]));
          result.weeks.forEach(w => map.set(w.start, { ...map.get(w.start), ...w, loading: false }));
          return [...map.values()].sort((a, b) => b.start.localeCompare(a.start));
        });
        setCursor(result.cursor);
      }
    } catch (problem) {
      if (alive.current) { setError((problem as Error).message); setWeeks(old => old.map(w => ({ ...w, loading: false }))); }
    } finally { batchBusy.current = false; if (alive.current) setLoadingMore(false); }
  }
  useEffect(() => {
    alive.current = true;
    void loadStatus().then(() => loadBatch()).then(() => loadWeek(currentWeek())).catch(problem => { if (alive.current) { setError(problem.message); setWeeks(old => old.map(w => ({ ...w, loading: false }))); } });
    return () => { alive.current = false; };
  }, []);
  const hasPending = weeks.some(w => (w.pendingCount || 0) > 0 || w.entries?.some(e => e.state.startsWith('pending')));
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => { weeks.filter(w => w.entries?.some(e => e.state.startsWith('pending')) || w.pendingCreations?.some(op => ['pending', 'processing'].includes(op.status))).forEach(w => void loadWeek(w.start)); }, 5000);
    return () => clearInterval(timer);
  }, [hasPending, weeks]);
  function toggle(start: string) {
    setExpanded(old => { const next = new Set(old); if (next.has(start)) next.delete(start); else next.add(start); return next; });
    if (!expanded.has(start)) void loadWeek(start);
  }
  async function mutate(path: string, method: string, body: object = {}) {
    if (!status?.csrf) throw new Error('Reload time tracking before making changes.');
    return api(path, { method, headers: { 'X-Time-CSRF': status.csrf }, body: JSON.stringify(body) });
  }
  async function refreshLoaded() { await Promise.all(weeks.map(w => loadWeek(w.start, true))); await loadStatus(); }
  return { status, weeks, expanded, cursor, loadingMore, error, loadStatus, loadBatch, loadWeek, toggle, mutate, refreshLoaded,
    thisWeek() { setExpanded(old => new Set([...old, currentWeek()])); void loadWeek(currentWeek()); requestAnimationFrame(() => document.getElementById(`week-${currentWeek()}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })); } };
}
export type Timesheet = ReturnType<typeof useTimesheet>;
