import { useState } from 'react';

export function LeaveRequestForm({ onSubmit, busy }: { onSubmit: (payload: { startDate: string; endDate: string; note: string }) => Promise<boolean>; busy: boolean }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  return (
    <form className="form-stack" onSubmit={async (e) => {
      e.preventDefault();
      if (await onSubmit({ startDate, endDate, note })) setNote('');
    }}>
      <label>Start date<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></label>
      <label>End date<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required /></label>
      <textarea placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="primary-btn" disabled={busy}>Record leave immediately</button>
    </form>
  );
}
