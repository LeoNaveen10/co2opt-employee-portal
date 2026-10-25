import type { LeaveRequest } from '../../types';

export function getTakenDays(userId: string, requests: LeaveRequest[]) {
  const year = new Date().getUTCFullYear().toString();
  return requests
    .filter((leave) => leave.employeeId === userId && leave.status !== 'REJECTED' && leave.startDate.startsWith(`${year}-`))
    .reduce((sum, leave) => sum + leave.days, 0);
}
