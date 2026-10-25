import { useState } from 'react';
import type { PortalState } from '../dashboard/usePortal';
import { Dialog } from '../../components/Dialog';
import { LeaveReportForm } from './LeaveReportForm';
import { LeaveRequestForm } from './LeaveRequestForm';
import { LeaveRequestsList } from './LeaveRequestsList';
import { AvailabilityCalendar } from './AvailabilityCalendar';
import { api } from '../../api';

type HolidaysProps = Pick<PortalState, 'busy' | 'data' | 'reportPeriod' | 'setReportPeriod' | 'reportYear' | 'setReportYear' | 'reportMonth' | 'setReportMonth' | 'runAction' | 'downloadLeaveReport'>;

export function HolidaysPage(props: HolidaysProps) {
  const { busy, data, runAction } = props;
  const [activeDialog, setActiveDialog] = useState<'report' | 'leave' | null>(null);
  const closeDialog = () => setActiveDialog(null);

  return (
    <div className="page-grid two-col">
      <div className="holidays-actions span-2">
        <button type="button" className="ghost-btn" disabled={busy} onClick={() => setActiveDialog('report')}>Download leave report</button>
        <button type="button" className="primary-btn" disabled={busy} onClick={() => setActiveDialog('leave')}>Record leave</button>
      </div>
      {activeDialog === 'report' && (
        <Dialog busy={busy} onClose={closeDialog} titleId="leave-report-title" closeLabel="Close leave report">
          <h3 id="leave-report-title">Download leave report</h3>
          <p className="section-subtitle">Export everyone's leave taken and annual remaining balance as a CSV file.</p>
          <LeaveReportForm {...props} onComplete={closeDialog} />
        </Dialog>
      )}
      {activeDialog === 'leave' && (
        <Dialog busy={busy} onClose={closeDialog} titleId="record-leave-title" closeLabel="Close leave form">
          <h3 id="record-leave-title">Record leave</h3>
          <p className="section-subtitle">Leave is recorded immediately and deducted from your balance. No approval is needed.</p>
          <LeaveRequestForm busy={busy} onSubmit={async (payload) => {
            const saved = await runAction(
              () => api('/leave/requests', { method: 'POST', body: JSON.stringify(payload) }),
              'Leave recorded and balance updated.'
            );
            if (saved) closeDialog();
            return saved;
          }} />
        </Dialog>
      )}
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
