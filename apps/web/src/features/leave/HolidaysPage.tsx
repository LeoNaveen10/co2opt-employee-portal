import type { PortalState } from '../dashboard/usePortal';
import { LeaveSummaryTable } from '../leave/LeaveSummaryTable';
import { LeaveRequestForm } from '../leave/LeaveRequestForm';
import { LeaveRequestsList } from '../leave/LeaveRequestsList';
import { AvailabilityCalendar } from '../leave/AvailabilityCalendar';
import { api } from '../../api';

export function HolidaysPage({ busy, data, reportPeriod, setReportPeriod, reportYear, setReportYear, reportMonth, setReportMonth, runAction, downloadLeaveReport }: Pick<PortalState, 'busy' | 'data' | 'reportPeriod' | 'setReportPeriod' | 'reportYear' | 'setReportYear' | 'reportMonth' | 'setReportMonth' | 'runAction' | 'downloadLeaveReport'>) {
  return (
        <div className="page-grid two-col">
          <section className="card">
            <h3>Everyone's leave counts</h3>
            <LeaveSummaryTable summary={data.leaveSummary} requests={data.leaveRequests} />
          </section>
          <section className="card">
            <h3>Download leave report</h3>
            <p className="section-subtitle">Export everyone's leave taken and annual remaining balance as a CSV file.</p>
            <div className="form-stack">
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
                <input type="number" min="2000" max="2100" value={reportYear} onChange={(event) => setReportYear(Number(event.target.value))} />
              </label>
              <button className="primary-btn" onClick={() => void downloadLeaveReport()} disabled={busy}>Download CSV</button>
            </div>
          </section>
          <section className="card">
            <h3>Record leave</h3>
            <p className="section-subtitle">Leave is recorded immediately and deducted from your balance. No approval is needed.</p>
            <LeaveRequestForm onSubmit={(payload) => runAction(() => api('/leave/requests', { method: 'POST', body: JSON.stringify(payload) }), 'Leave recorded and balance updated.')} busy={busy} />
          </section>
          <section className="card span-2">
            <h3>Leave records</h3>
            <p className="section-subtitle">Leave records are permanent and cannot be edited or deleted after they are added.</p>
            <LeaveRequestsList requests={data.leaveRequests} />
          </section>
          <section className="card span-2">
            <h3>Team availability calendar</h3>
            <AvailabilityCalendar leaves={data.calendarLeaves} />
          </section>
        </div>
  );
}
