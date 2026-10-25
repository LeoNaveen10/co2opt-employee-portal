import type { LeaveRequest, LeaveSummary } from '../../types';
import { getTakenDays } from './getTakenDays';

export function LeaveSummaryTable({ summary, requests }: { summary: LeaveSummary[]; requests: LeaveRequest[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Name</th><th>Allocation</th><th>Taken</th><th>Remaining</th></tr>
        </thead>
        <tbody>
          {summary.map((row) => {
            const taken = row.taken ?? getTakenDays(row.userId, requests);
            return (
              <tr key={row.userId}>
                <td>{row.name}</td>
                <td>{row.allocation}</td>
                <td>{taken}</td>
                <td><strong>{Math.max(row.allocation - taken, 0)}</strong></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
