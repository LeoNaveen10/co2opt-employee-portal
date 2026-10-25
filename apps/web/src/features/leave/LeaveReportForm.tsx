import type { PortalState } from '../dashboard/usePortal';

export function LeaveReportForm({ busy, reportPeriod, setReportPeriod, reportYear, setReportYear, reportMonth, setReportMonth, downloadLeaveReport, onComplete }: Pick<PortalState, 'busy' | 'reportPeriod' | 'setReportPeriod' | 'reportYear' | 'setReportYear' | 'reportMonth' | 'setReportMonth' | 'downloadLeaveReport'> & { onComplete: () => void }) {
  return (
            <form className="form-stack" onSubmit={async (event) => {
              event.preventDefault();
              if (await downloadLeaveReport()) onComplete();
            }}>
              <label>
                Report period
                <select value={reportPeriod} onChange={(event) => setReportPeriod(event.target.value as 'month' | 'year')}>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </select>
              </label>
              {reportPeriod === 'month' ? (
                <label>
                  Month
                  <select value={reportMonth} onChange={(event) => setReportMonth(Number(event.target.value))}>
                    {Array.from({ length: 12 }, (_, index) => (
                      <option key={index + 1} value={index + 1}>
                        {new Date(2000, index, 1).toLocaleString(undefined, { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label>
                Year
                <input type="number" min="2000" max="2100" required value={reportYear} onChange={(event) => setReportYear(Number(event.target.value))} />
              </label>
              <button className="primary-btn" disabled={busy}>Download CSV</button>
            </form>
  );
}
