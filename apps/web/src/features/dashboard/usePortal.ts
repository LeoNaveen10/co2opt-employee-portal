import { useEffect, useState } from 'react';
import { api, apiDownload, AUTH_EXPIRED_EVENT } from '../../api';
import { daysUntilCelebration } from '../../celebrations';
import { getTakenDays } from '../leave/getTakenDays';
import type { Kudos, LeaveRequest, LeaveSummary, Recommendation, User } from '../../types';
import type { DashboardData, TabKey } from './types';

const initialData: DashboardData = {
  users: [],
  leaveSummary: [],
  leaveRequests: [],
  calendarLeaves: [],
  recommendations: [],
  kudos: [],
  celebrations: { birthdays: [], anniversaries: [] }
};

export function usePortal() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [data, setData] = useState<DashboardData>(initialData);
  const [recommendationOpen, setRecommendationOpen] = useState(false);
  const [editingRecommendation, setEditingRecommendation] = useState<Recommendation | null>(null);
  const [reportPeriod, setReportPeriod] = useState<'month' | 'year'>('month');
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);

  useEffect(() => {
    const handleExpiredSession = () => {
      setUser(null);
      setData(initialData);
      setEditingRecommendation(null);
      setRecommendationOpen(false);
      setActiveTab('home');
      setMessage('Your session has expired. Please sign in again.');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpiredSession);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpiredSession);
  }, []);

  async function bootstrap() {
    setLoading(true);
    try {
      const me = await api<{ user: User | null }>('/auth/me');
      setUser(me.user);
      if (me.user) {
        await loadDashboard();
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadDashboard() {
    const [users, leaveSummary, leaveRequests, calendar, recommendations, kudos, celebrations] = await Promise.all([
      api<{ users: User[] }>('/users'),
      api<{ summary: LeaveSummary[] }>('/leave/summary'),
      api<{ requests: LeaveRequest[] }>('/leave/requests'),
      api<{ leaves: LeaveRequest[] }>('/calendar'),
      api<{ items: Recommendation[] }>('/recommendations'),
      api<{ items: Kudos[] }>('/kudos'),
      api<{ birthdays: User[]; anniversaries: User[] }>('/celebrations')
    ]);
    setData({
      users: users.users,
      leaveSummary: leaveSummary.summary,
      leaveRequests: leaveRequests.requests,
      calendarLeaves: calendar.leaves,
      recommendations: recommendations.items,
      kudos: kudos.items,
      celebrations
    });
  }

  useEffect(() => {
    void bootstrap();
  }, []);

  async function handleAuth(endpoint: '/auth/login' | '/auth/signup', payload: Record<string, unknown>) {
    setBusy(true);
    setMessage('');
    try {
      const response = await api<{ user: User }>(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      setUser(response.user);
      await loadDashboard();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
    setData(initialData);
    setActiveTab('home');
  }

  async function runAction<T>(work: () => Promise<T>, successMessage: string) {
    setBusy(true);
    setMessage('');
    try {
      await work();
      await loadDashboard();
      setMessage(successMessage);
      return true;
    } catch (error) {
      setMessage((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function deleteRecommendation(id: string) {
    if (!window.confirm('Delete this recommendation?')) return;
    const deleted = await runAction(
      () => api(`/recommendations/${id}`, { method: 'DELETE' }),
      'Recommendation deleted.'
    );
    if (deleted && editingRecommendation?.id === id) setEditingRecommendation(null);
  }

  async function downloadLeaveReport() {
    setBusy(true);
    setMessage('');
    try {
      const params = new URLSearchParams({ period: reportPeriod, year: String(reportYear) });
      if (reportPeriod === 'month') params.set('month', String(reportMonth));
      const { blob, filename } = await apiDownload(`/leave/report?${params}`);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
      setMessage('Leave report downloaded.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const myLeave = data.leaveSummary.find((item) => item.userId === user?.id);
  const leaveTaken = myLeave?.taken ?? getTakenDays(user?.id ?? '', data.leaveRequests);
  const leaveRemaining = Math.max((myLeave?.allocation ?? 23) - leaveTaken, 0);
  const upcoming = (people: User[], field: 'birthday' | 'joinedOn') => people
    .map((person) => ({ person, days: daysUntilCelebration(person[field], field === 'joinedOn') }))
    .filter((entry) => entry.days !== null && entry.days <= 15)
    .sort((a, b) => a.days! - b.days!)
    .map((entry) => entry.person);
  const upcomingBirthdays = upcoming(data.celebrations.birthdays, 'birthday');
  const upcomingAnniversaries = upcoming(data.celebrations.anniversaries, 'joinedOn');

  return { user, loading, busy, message, activeTab, setActiveTab, data, recommendationOpen, setRecommendationOpen, editingRecommendation, setEditingRecommendation, setMessage, reportPeriod, setReportPeriod, reportYear, setReportYear, reportMonth, setReportMonth, handleAuth, logout, runAction, deleteRecommendation, downloadLeaveReport, leaveTaken, leaveRemaining, upcomingBirthdays, upcomingAnniversaries };
}

export type PortalState = ReturnType<typeof usePortal>;
