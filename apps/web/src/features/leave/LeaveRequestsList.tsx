import type { LeaveRequest } from '../../types';

export function LeaveRequestsList({ requests }: { requests: LeaveRequest[] }) {
  return (
    <div className="grid-cards">
      {requests.map((item) => (
        <article key={item.id} className="mini-card">
          <h4>{item.employee.name} • {item.days} day(s)</h4>
          <p>{item.startDate} → {item.endDate}</p>
          {item.note ? <p>Note: {item.note}</p> : null}
        </article>
      ))}
    </div>
  );
}
