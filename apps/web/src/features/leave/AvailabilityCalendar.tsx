import { useState } from 'react';
import type { LeaveRequest } from '../../types';

export function AvailabilityCalendar({ leaves }: { leaves: LeaveRequest[] }) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const year = visibleMonth.getFullYear();
  const monthIndex = visibleMonth.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const days: Date[] = [];
  for (let day = 1; day <= lastDay.getDate(); day += 1) days.push(new Date(year, monthIndex, day));
  function localISODate(date: Date) {
    const monthPart = String(date.getMonth() + 1).padStart(2, '0');
    const dayPart = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${monthPart}-${dayPart}`;
  }

  return (
    <div>
      <div className="calendar-controls">
        <button className="ghost-btn small" aria-label="Previous month" onClick={() => setVisibleMonth(new Date(year, monthIndex - 1, 1))}>← Previous</button>
        <h4>{visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h4>
        <button className="ghost-btn small" aria-label="Next month" onClick={() => setVisibleMonth(new Date(year, monthIndex + 1, 1))}>Next →</button>
      </div>
      <div className="calendar-legend">
        <span className="tag away">Leave taken</span>
        <span className="tag weekend">Weekend</span>
      </div>
      <div className="calendar-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
          <div key={day} className={`calendar-head${index === 0 || index === 6 ? ' weekend' : ''}`}>{day}</div>
        ))}
        {Array.from({ length: firstDay.getDay() }).map((_, idx) => <div key={`pad-${idx}`} className="calendar-cell muted" />)}
        {days.map((date) => {
          const iso = localISODate(date);
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const dayLeaves = leaves.filter((leave) => iso >= leave.startDate && iso <= leave.endDate);
          return (
            <div key={iso} className={`calendar-cell${isWeekend ? ' weekend' : ''}`}>
              <time className="calendar-date" dateTime={iso} aria-label={date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}>{String(date.getDate()).padStart(2, '0')}</time>
              {dayLeaves.slice(0, 3).map((leave) => (
                <span key={leave.id} className="tag away">{leave.employee.name}</span>
              ))}
              {dayLeaves.length > 3 ? <span className="tag">+{dayLeaves.length - 3} more</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
