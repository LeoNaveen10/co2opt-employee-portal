import type { User, LeaveSummary, LeaveRequest, Recommendation, Kudos } from '../../types';

export type DashboardData = {
  users: User[];
  leaveSummary: LeaveSummary[];
  leaveRequests: LeaveRequest[];
  calendarLeaves: LeaveRequest[];
  recommendations: Recommendation[];
  kudos: Kudos[];
  celebrations: { birthdays: User[]; anniversaries: User[] };
};

export type TabKey = 'home' | 'holidays' | 'discover' | 'team' | 'me';
