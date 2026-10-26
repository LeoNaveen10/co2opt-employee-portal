import { useState } from 'react';
import { JiraConnectionPanel } from './JiraConnectionPanel';
import { TimesheetHistory } from './TimesheetHistory';
import { TimeEntryDialog, type EntryDraft } from './TimeEntryDialog';
import { TimeEntryList } from './TimeEntryList';
import { DeleteTimeDialog } from './DeleteTimeDialog';
import { useTimesheet } from './useTimesheet';
import { localDate, type Ticket, type Entry } from './types';
export function TimeTrackingPage() {
  const sheet = useTimesheet();
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [deleting, setDeleting] = useState<Entry[] | null>(null);
  const [cell, setCell] = useState<{ ids: string[]; ticket: Ticket; date: string } | null>(null);
  const entries = cell ? [...new Map(sheet.weeks.flatMap(w => w.entries || []).filter(e => cell.ids.includes(e.id)).map(e => [e.id, e])).values()] : [];
  const add = (ticket?: Ticket, date?: string) => { setCell(null); setDraft({ ticket, date }); };
  return <main className="time-tracking">
    <header className="time-page-header"><div><h2>Time tracking</h2><p>Log work against your Jira tickets, one week at a time.</p></div><button className="ghost-btn" onClick={sheet.thisWeek}>This Week</button></header>
    <JiraConnectionPanel sheet={sheet} />
    <TimesheetHistory sheet={sheet} onAdd={add} onCell={(items, ticket, date) => setCell({ ids: items.map(e => e.id), ticket, date })} onDelete={setDeleting} />
    {deleting && <DeleteTimeDialog entries={deleting} sheet={sheet} onClose={() => setDeleting(null)} />}
    {draft && <TimeEntryDialog draft={draft} sheet={sheet} onClose={() => setDraft(null)} onSaved={sheet.refreshLoaded} />}
    {cell && <TimeEntryList entries={entries} date={cell.date} sheet={sheet} onClose={() => setCell(null)} onEdit={entry => { setCell(null); setDraft({ entry }); }} onAdd={() => add(cell.ticket, cell.date || localDate())} />}
  </main>;
}
