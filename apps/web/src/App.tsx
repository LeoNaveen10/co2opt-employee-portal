import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { Holiday, Kudos, LeaveRequest, LeaveSummary, Poll, Recommendation, User, WheelPreset } from './types';

type DashboardData = {
  users: User[];
  leaveSummary: LeaveSummary[];
  leaveRequests: LeaveRequest[];
  approvedCalendar: LeaveRequest[];
  holidays: Holiday[];
  recommendations: Recommendation[];
  kudos: Kudos[];
  polls: Poll[];
  wheelPresets: WheelPreset[];
  celebrations: { birthdays: User[]; anniversaries: User[] };
};

type TabKey = 'home' | 'holidays' | 'discover' | 'team' | 'me';

const initialData: DashboardData = {
  users: [],
  leaveSummary: [],
  leaveRequests: [],
  approvedCalendar: [],
  holidays: [],
  recommendations: [],
  kudos: [],
  polls: [],
  wheelPresets: [],
  celebrations: { birthdays: [], anniversaries: [] }
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [data, setData] = useState<DashboardData>(initialData);

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
    const [users, leaveSummary, leaveRequests, calendar, recommendations, kudos, polls, wheelPresets, celebrations, holidays] = await Promise.all([
      api<{ users: User[] }>('/users'),
      api<{ summary: LeaveSummary[] }>('/leave/summary'),
      api<{ requests: LeaveRequest[] }>('/leave/requests'),
      api<{ approved: LeaveRequest[] }>('/calendar'),
      api<{ items: Recommendation[] }>('/recommendations'),
      api<{ items: Kudos[] }>('/kudos'),
      api<{ polls: Poll[] }>('/polls'),
      api<{ presets: WheelPreset[] }>('/wheel-presets'),
      api<{ birthdays: User[]; anniversaries: User[] }>('/celebrations'),
      api<{ holidays: Holiday[] }>('/public-holidays')
    ]);
    setData({
      users: users.users,
      leaveSummary: leaveSummary.summary,
      leaveRequests: leaveRequests.requests,
      approvedCalendar: calendar.approved,
      holidays: holidays.holidays,
      recommendations: recommendations.items,
      kudos: kudos.items,
      polls: polls.polls,
      wheelPresets: wheelPresets.presets,
      celebrations
    });
  }

  useEffect(() => {
    void bootstrap();
  }, []);

  async function handleAuth(endpoint: '/auth/login' | '/auth/activate', payload: Record<string, unknown>) {
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
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="splash">Loading the fun zone...</div>;
  if (!user) return <AuthScreen onSubmit={handleAuth} busy={busy} message={message} />;

  const pendingApprovals = data.leaveRequests.filter((leave) => leave.status === 'PENDING').length;
  const myLeave = data.leaveSummary.find((item) => item.userId === user.id);
  const upcomingBirthdays = data.celebrations.birthdays.slice(0, 3);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img src="/co2opt-logo.jpg" alt="CO2OPT logo" className="logo" />
          <div>
            <h1>CO2OPT Employee Portal</h1>
            <p>chaotic good edition ✨</p>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="user-pill">
            <span>{user.name}</span>
            <strong>{user.role}</strong>
          </div>
          <button className="ghost-btn" onClick={logout}>Log out</button>
        </div>
      </header>

      <nav className="nav-tabs">
        {[
          ['home', 'Home'],
          ['holidays', 'Holidays'],
          ['discover', 'Discover'],
          ['team', 'Team'],
          ['me', 'Me']
        ].map(([key, label]) => (
          <button
            key={key}
            className={activeTab === key ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setActiveTab(key as TabKey)}
          >
            {label}
          </button>
        ))}
      </nav>

      {message ? <div className="message-banner">{message}</div> : null}

      {activeTab === 'home' && (
        <div className="page-grid">
          <section className="card hero-card gradient-a">
            <div>
              <h2>Welcome back, {user.name}! 🎉</h2>
              <p>This is your colorful little team playground.</p>
            </div>
            <div className="hero-stats">
              <StatBubble label="Leave left" value={String(myLeave?.remaining ?? 23)} />
              <StatBubble label="Pending approvals" value={String(pendingApprovals)} />
              <StatBubble label="Recommendations" value={String(data.recommendations.length)} />
            </div>
          </section>
          <section className="card">
            <h3>Leave leaderboard</h3>
            <LeaveSummaryTable summary={data.leaveSummary} />
          </section>
          <section className="card gradient-b">
            <h3>Shout-outs lately 💚</h3>
            <div className="stack-list">
              {data.kudos.slice(0, 4).map((item) => (
                <div key={item.id} className="mini-card">
                  <strong>{item.from.name}</strong> → <strong>{item.to.name}</strong>
                  <p>{item.message}</p>
                </div>
              ))}
              {data.kudos.length === 0 && <p>No kudos yet. Start the sweetness.</p>}
            </div>
          </section>
          <section className="card gradient-c">
            <h3>Birthdays & anniversaries 🎂</h3>
            {upcomingBirthdays.length ? upcomingBirthdays.map((person) => (
              <div key={person.id} className="mini-card"><strong>{person.name}</strong> — Birthday: {person.birthday}</div>
            )) : <p>Add birthdays from the Me tab.</p>}
            {data.celebrations.anniversaries.slice(0, 3).map((person) => (
              <div key={`${person.id}-anniv`} className="mini-card"><strong>{person.name}</strong> — Joined: {person.joinedOn}</div>
            ))}
          </section>
          <section className="card gradient-d">
            <h3>This week's polls 🗳️</h3>
            {data.polls.slice(0, 2).map((poll) => <PollPreview key={poll.id} poll={poll} />)}
            {data.polls.length === 0 && <p>No polls yet. Ask something random.</p>}
          </section>
        </div>
      )}

      {activeTab === 'holidays' && (
        <div className="page-grid two-col">
          <section className="card">
            <h3>Everyone's leave counts</h3>
            <LeaveSummaryTable summary={data.leaveSummary} />
          </section>
          <section className="card">
            <h3>Request leave</h3>
            <LeaveRequestForm onSubmit={(payload) => runAction(() => api('/leave/requests', { method: 'POST', body: JSON.stringify(payload) }), 'Leave request submitted.')} busy={busy} />
          </section>
          <section className="card span-2">
            <h3>Approval queue & leave history</h3>
            <LeaveRequestsList
              requests={data.leaveRequests}
              currentUser={user}
              onDecision={(id, decision) => runAction(() => api(`/leave/requests/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision }) }), `Request ${decision.toLowerCase()}.`)}
            />
          </section>
          <section className="card span-2">
            <h3>Team availability calendar</h3>
            <AvailabilityCalendar approvedLeaves={data.approvedCalendar} holidays={data.holidays} />
          </section>
          <section className="card span-2">
            <h3>Company public holidays</h3>
            <HolidayList holidays={data.holidays} />
            {user.role === 'ADMIN' ? (
              <HolidayForm onSubmit={(payload) => runAction(() => api('/public-holidays', { method: 'POST', body: JSON.stringify(payload) }), 'Holiday saved.')} />
            ) : null}
          </section>
        </div>
      )}

      {activeTab === 'discover' && (
        <div className="page-grid two-col">
          <section className="card">
            <h3>Add recommendation</h3>
            <RecommendationForm onSubmit={(payload) => runAction(() => api('/recommendations', { method: 'POST', body: JSON.stringify(payload) }), 'Recommendation added!')} />
          </section>
          <section className="card span-2">
            <h3>Movies, series and books 🍿📚</h3>
            <RecommendationGrid
              items={data.recommendations.filter((item) => item.type !== 'MUSIC')}
              currentUser={user}
              onLike={(id) => runAction(() => api(`/recommendations/${id}/like`, { method: 'POST' }), 'Reaction updated.')}
              onRate={(id, score) => runAction(() => api(`/recommendations/${id}/rate`, { method: 'POST', body: JSON.stringify({ score }) }), 'Rating saved.')}
            />
          </section>
          <section className="card span-2 gradient-c">
            <h3>Shared music corner 🎧</h3>
            <RecommendationGrid
              items={data.recommendations.filter((item) => item.type === 'MUSIC')}
              currentUser={user}
              onLike={(id) => runAction(() => api(`/recommendations/${id}/like`, { method: 'POST' }), 'Reaction updated.')}
              onRate={(id, score) => runAction(() => api(`/recommendations/${id}/rate`, { method: 'POST', body: JSON.stringify({ score }) }), 'Rating saved.')}
            />
          </section>
          <section className="card">
            <h3>Create a poll</h3>
            <PollForm onSubmit={(payload) => runAction(() => api('/polls', { method: 'POST', body: JSON.stringify(payload) }), 'Poll created.')} />
          </section>
          <section className="card span-2">
            <h3>Weekly polls</h3>
            <PollList polls={data.polls} currentUser={user} onVote={(id, optionIndex) => runAction(() => api(`/polls/${id}/vote`, { method: 'POST', body: JSON.stringify({ optionIndex }) }), 'Vote submitted.')} />
          </section>
          <section className="card">
            <h3>Save a decision wheel</h3>
            <WheelForm onSubmit={(payload) => runAction(() => api('/wheel-presets', { method: 'POST', body: JSON.stringify(payload) }), 'Wheel preset saved.')} />
          </section>
          <section className="card span-2 gradient-d">
            <h3>Decision wheel 🎡</h3>
            <DecisionWheel presets={data.wheelPresets} />
          </section>
        </div>
      )}

      {activeTab === 'team' && (
        <div className="page-grid two-col">
          <section className="card">
            <h3>Send kudos</h3>
            <KudosForm users={data.users} currentUser={user} onSubmit={(payload) => runAction(() => api('/kudos', { method: 'POST', body: JSON.stringify(payload) }), 'Kudos delivered!')} />
          </section>
          <section className="card span-2">
            <h3>Kudos wall 💌</h3>
            <div className="grid-cards">
              {data.kudos.map((item) => (
                <article key={item.id} className="kudos-card">
                  <div className="emoji-strip">✨ 💚 🎉 🙌</div>
                  <h4>{item.from.name} → {item.to.name}</h4>
                  <p>{item.message}</p>
                </article>
              ))}
              {data.kudos.length === 0 && <p>No kudos yet. Be the first human confetti machine.</p>}
            </div>
          </section>
          <section className="card span-2">
            <h3>Birthdays & anniversaries</h3>
            <CelebrationsList celebrations={data.celebrations} />
          </section>
          <section className="card span-2">
            <h3>Team directory</h3>
            <DirectoryList users={data.users} />
          </section>
        </div>
      )}

      {activeTab === 'me' && (
        <div className="page-grid two-col">
          <section className="card">
            <h3>Personal details</h3>
            <ProfileForm user={user} onSubmit={(payload) => runAction(() => api('/users/me', { method: 'PATCH', body: JSON.stringify(payload) }), 'Profile updated.')} />
          </section>
          <section className="card gradient-b">
            <h3>Your portal vibe</h3>
            <ul className="feature-list">
              <li>You can see everyone's leave balance because this is a fun zone.</li>
              <li>Leave counts skip weekends and configured company public holidays.</li>
              <li>Half-day support is intentionally disabled.</li>
              <li>Music, polls, kudos and the decision wheel keep the place alive.</li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function AuthScreen({ onSubmit, busy, message }: { onSubmit: (endpoint: '/auth/login' | '/auth/activate', payload: Record<string, unknown>) => Promise<void>; busy: boolean; message: string }) {
  const [mode, setMode] = useState<'login' | 'activate'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [birthday, setBirthday] = useState('');
  const [joinedOn, setJoinedOn] = useState('');

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <img src="/co2opt-logo.jpg" alt="CO2OPT logo" className="auth-logo" />
        <h1>CO2OPT Employee Portal</h1>
        <p>Bright. Chaotic. Very internal. Slightly unprofessional. Very fun.</p>
        <div className="switch-row">
          <button className={mode === 'login' ? 'nav-btn active' : 'nav-btn'} onClick={() => setMode('login')}>Login</button>
          <button className={mode === 'activate' ? 'nav-btn active' : 'nav-btn'} onClick={() => setMode('activate')}>Activate account</button>
        </div>
        <form className="form-stack" onSubmit={(event) => {
          event.preventDefault();
          if (mode === 'login') {
            void onSubmit('/auth/login', { email, password });
          } else {
            void onSubmit('/auth/activate', { email, password, inviteToken, birthday: birthday || null, joinedOn: joinedOn || null });
          }
        }}>
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {mode === 'activate' ? (
            <>
              <input placeholder="Invite token" value={inviteToken} onChange={(e) => setInviteToken(e.target.value)} />
              <label>Birthday<input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} /></label>
              <label>Joined company<input type="date" value={joinedOn} onChange={(e) => setJoinedOn(e.target.value)} /></label>
            </>
          ) : null}
          <button className="primary-btn" disabled={busy}>{busy ? 'Working...' : mode === 'login' ? 'Login' : 'Activate'}</button>
        </form>
        {message ? <div className="message-banner">{message}</div> : null}
      </div>
    </div>
  );
}

function StatBubble({ label, value }: { label: string; value: string }) {
  return <div className="stat-bubble"><strong>{value}</strong><span>{label}</span></div>;
}

function LeaveSummaryTable({ summary }: { summary: LeaveSummary[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Name</th><th>Role</th><th>Allocation</th><th>Approved</th><th>Pending</th><th>Remaining</th></tr>
        </thead>
        <tbody>
          {summary.map((row) => (
            <tr key={row.userId}>
              <td>{row.name}</td>
              <td>{row.role}</td>
              <td>{row.allocation}</td>
              <td>{row.approved}</td>
              <td>{row.pending}</td>
              <td><strong>{row.remaining}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeaveRequestForm({ onSubmit, busy }: { onSubmit: (payload: { startDate: string; endDate: string; note: string }) => void; busy: boolean }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  return (
    <form className="form-stack" onSubmit={(e) => { e.preventDefault(); onSubmit({ startDate, endDate, note }); setNote(''); }}>
      <label>Start date<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></label>
      <label>End date<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required /></label>
      <textarea placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="primary-btn" disabled={busy}>Submit leave request</button>
    </form>
  );
}

function LeaveRequestsList({ requests, currentUser, onDecision }: { requests: LeaveRequest[]; currentUser: User; onDecision: (id: string, decision: 'APPROVED' | 'REJECTED') => void }) {
  return (
    <div className="grid-cards">
      {requests.map((item) => (
        <article key={item.id} className="mini-card">
          <h4>{item.employee.name} • {item.days} day(s)</h4>
          <p>{item.startDate} → {item.endDate}</p>
          <p>Status: <strong>{item.status}</strong></p>
          {item.note ? <p>Note: {item.note}</p> : null}
          {['MANAGER', 'ADMIN'].includes(currentUser.role) && item.status === 'PENDING' && currentUser.id !== item.employeeId ? (
            <div className="inline-actions">
              <button className="primary-btn small" onClick={() => onDecision(item.id, 'APPROVED')}>Approve</button>
              <button className="ghost-btn small" onClick={() => onDecision(item.id, 'REJECTED')}>Reject</button>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function AvailabilityCalendar({ approvedLeaves, holidays }: { approvedLeaves: LeaveRequest[]; holidays: Holiday[] }) {
  const month = new Date();
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const days: Date[] = [];
  for (let day = 1; day <= lastDay.getDate(); day += 1) days.push(new Date(year, monthIndex, day));
  const holidayMap = new Map(holidays.map((item) => [item.date, item.name]));

  function awayNames(date: Date) {
    const iso = date.toISOString().slice(0, 10);
    return approvedLeaves.filter((leave) => iso >= leave.startDate && iso <= leave.endDate).map((leave) => leave.employee.name);
  }

  return (
    <div>
      <div className="calendar-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day} className="calendar-head">{day}</div>)}
        {Array.from({ length: firstDay.getDay() }).map((_, idx) => <div key={`pad-${idx}`} className="calendar-cell muted" />)}
        {days.map((date) => {
          const iso = date.toISOString().slice(0, 10);
          const names = awayNames(date);
          const holidayName = holidayMap.get(iso);
          return (
            <div key={iso} className={`calendar-cell ${holidayName ? 'holiday-cell' : ''}`}>
              <div className="calendar-date">{date.getDate()}</div>
              {holidayName ? <span className="tag holiday">{holidayName}</span> : null}
              {names.slice(0, 3).map((name) => <span key={name} className="tag away">{name}</span>)}
              {names.length > 3 ? <span className="tag away">+{names.length - 3} more</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HolidayList({ holidays }: { holidays: Holiday[] }) {
  return <div className="chip-row">{holidays.map((holiday) => <span key={holiday.date} className="chip">{holiday.date} • {holiday.name}</span>)}</div>;
}

function HolidayForm({ onSubmit }: { onSubmit: (payload: { date: string; name: string }) => void }) {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  return (
    <form className="inline-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ date, name }); setDate(''); setName(''); }}>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      <input placeholder="Holiday name" value={name} onChange={(e) => setName(e.target.value)} required />
      <button className="primary-btn small">Save</button>
    </form>
  );
}

function RecommendationForm({ onSubmit }: { onSubmit: (payload: { type: string; title: string; url: string; note: string }) => void }) {
  const [type, setType] = useState('MOVIE');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  return (
    <form className="form-stack" onSubmit={(e) => { e.preventDefault(); onSubmit({ type, title, url, note }); setTitle(''); setUrl(''); setNote(''); }}>
      <select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="MOVIE">Movie</option>
        <option value="SERIES">Series</option>
        <option value="BOOK">Book</option>
        <option value="MUSIC">Music</option>
      </select>
      <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <input placeholder="Optional link" value={url} onChange={(e) => setUrl(e.target.value)} />
      <textarea placeholder="Why recommend this?" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="primary-btn">Share recommendation</button>
    </form>
  );
}

function RecommendationGrid({ items, currentUser, onLike, onRate }: { items: Recommendation[]; currentUser: User; onLike: (id: string) => void; onRate: (id: string, score: number) => void }) {
  return (
    <div className="grid-cards">
      {items.map((item) => {
        const myRating = item.ratings.find((rating) => rating.userId === currentUser.id)?.score ?? 0;
        const average = item.ratings.length ? (item.ratings.reduce((sum, entry) => sum + entry.score, 0) / item.ratings.length).toFixed(1) : '—';
        const liked = item.likes.some((like) => like.userId === currentUser.id);
        return (
          <article key={item.id} className="rec-card">
            <span className="chip bright">{item.type}</span>
            <h4>{item.title}</h4>
            <p>by {item.author.name}</p>
            {item.note ? <p>{item.note}</p> : null}
            {item.url ? <a href={item.url} target="_blank" rel="noreferrer">Open link ↗</a> : null}
            <div className="inline-actions wrap">
              <button className={liked ? 'primary-btn small' : 'ghost-btn small'} onClick={() => onLike(item.id)}>{liked ? 'Liked 💚' : 'Like'}</button>
              <span>{item.likes.length} likes</span>
              <span>Avg rating: {average}</span>
            </div>
            <div className="rating-row">
              {[1, 2, 3, 4, 5].map((score) => (
                <button key={score} className={myRating >= score ? 'star active' : 'star'} onClick={() => onRate(item.id, score)}>★</button>
              ))}
            </div>
          </article>
        );
      })}
      {items.length === 0 && <p>Nothing here yet. Add the first one.</p>}
    </div>
  );
}

function KudosForm({ users, currentUser, onSubmit }: { users: User[]; currentUser: User; onSubmit: (payload: { toId: string; message: string }) => void }) {
  const [toId, setToId] = useState('');
  const [message, setMessage] = useState('');
  return (
    <form className="form-stack" onSubmit={(e) => { e.preventDefault(); onSubmit({ toId, message }); setMessage(''); }}>
      <select value={toId} onChange={(e) => setToId(e.target.value)} required>
        <option value="">Choose a teammate</option>
        {users.filter((u) => u.id !== currentUser.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      <textarea placeholder="Say something nice" value={message} onChange={(e) => setMessage(e.target.value)} required />
      <button className="primary-btn">Send kudos</button>
    </form>
  );
}

function PollForm({ onSubmit }: { onSubmit: (payload: { question: string; options: string[]; closesAt: string }) => void }) {
  const [question, setQuestion] = useState('');
  const [rawOptions, setRawOptions] = useState('Option 1\nOption 2');
  const [closesAt, setClosesAt] = useState('');
  return (
    <form className="form-stack" onSubmit={(e) => { e.preventDefault(); onSubmit({ question, options: rawOptions.split('\n').map((x) => x.trim()).filter(Boolean), closesAt }); setQuestion(''); }}>
      <input placeholder="Question" value={question} onChange={(e) => setQuestion(e.target.value)} required />
      <textarea placeholder="One option per line" value={rawOptions} onChange={(e) => setRawOptions(e.target.value)} required />
      <label>Close date<input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} required /></label>
      <button className="primary-btn">Create poll</button>
    </form>
  );
}

function PollPreview({ poll }: { poll: Poll }) {
  const options = JSON.parse(poll.optionsJson) as string[];
  return <div className="mini-card"><strong>{poll.question}</strong><p>{options.join(' • ')}</p></div>;
}

function PollList({ polls, currentUser, onVote }: { polls: Poll[]; currentUser: User; onVote: (id: string, optionIndex: number) => void }) {
  return (
    <div className="stack-list">
      {polls.map((poll) => {
        const options = JSON.parse(poll.optionsJson) as string[];
        const total = poll.votes.length || 1;
        const myVote = poll.votes.find((vote) => vote.userId === currentUser.id)?.optionIndex;
        const closed = new Date(poll.closesAt) < new Date();
        return (
          <article key={poll.id} className="poll-card">
            <h4>{poll.question}</h4>
            <p>by {poll.creator.name}</p>
            {options.map((option, index) => {
              const count = poll.votes.filter((vote) => vote.optionIndex === index).length;
              const percentage = Math.round((count / total) * 100);
              return (
                <div key={option} className="poll-option">
                  <button className={myVote === index ? 'primary-btn small' : 'ghost-btn small'} disabled={closed} onClick={() => onVote(poll.id, index)}>{option}</button>
                  <div className="poll-bar"><span style={{ width: `${percentage}%` }} /></div>
                  <small>{count} votes • {percentage}%</small>
                </div>
              );
            })}
          </article>
        );
      })}
      {polls.length === 0 && <p>No polls yet.</p>}
    </div>
  );
}

function WheelForm({ onSubmit }: { onSubmit: (payload: { name: string; options: string[] }) => void }) {
  const [name, setName] = useState('Friday plan');
  const [options, setOptions] = useState('Movie\nGame\nMeme review');
  return (
    <form className="form-stack" onSubmit={(e) => { e.preventDefault(); onSubmit({ name, options: options.split('\n').map((x) => x.trim()).filter(Boolean) }); }}>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <textarea value={options} onChange={(e) => setOptions(e.target.value)} />
      <button className="primary-btn">Save preset</button>
    </form>
  );
}

function DecisionWheel({ presets }: { presets: WheelPreset[] }) {
  const [selectedId, setSelectedId] = useState('');
  const [rotation, setRotation] = useState(0);
  const [winner, setWinner] = useState('');
  const selected = presets.find((preset) => preset.id === selectedId) ?? presets[0];
  const options = useMemo(() => selected ? JSON.parse(selected.optionsJson) as string[] : ['Coffee', 'Tea'], [selected]);
  const segmentAngle = 360 / options.length;

  function spin() {
    const winnerIndex = Math.floor(Math.random() * options.length);
    const extraTurns = 6 * 360;
    const stopAngle = 360 - (winnerIndex * segmentAngle + segmentAngle / 2);
    setRotation((prev) => prev + extraTurns + stopAngle);
    setWinner(options[winnerIndex]);
  }

  return (
    <div className="wheel-layout">
      <div>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
        </select>
        <button className="primary-btn" onClick={spin}>Spin the wheel!</button>
        {winner ? <p className="winner-banner">Winner: <strong>{winner}</strong> 🥳</p> : <p>Save a preset and spin.</p>}
      </div>
      <div className="wheel-stage">
        <div className="wheel-pointer">▼</div>
        <div className="wheel" style={{ transform: `rotate(${rotation}deg)` }}>
          {options.map((option, index) => {
            const angle = index * segmentAngle;
            return (
              <div key={option} className="wheel-segment" style={{ transform: `rotate(${angle}deg) skewY(${90 - segmentAngle}deg)` }}>
                <span style={{ transform: `skewY(-${90 - segmentAngle}deg) rotate(${segmentAngle / 2}deg)` }}>{option}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CelebrationsList({ celebrations }: { celebrations: DashboardData['celebrations'] }) {
  return (
    <div className="grid-cards">
      {celebrations.birthdays.map((user) => <div key={user.id} className="mini-card"><strong>{user.name}</strong><p>Birthday: {user.birthday}</p></div>)}
      {celebrations.anniversaries.map((user) => <div key={`${user.id}-a`} className="mini-card"><strong>{user.name}</strong><p>Joined: {user.joinedOn}</p></div>)}
    </div>
  );
}

function DirectoryList({ users }: { users: User[] }) {
  return (
    <div className="grid-cards">
      {users.map((user) => <div key={user.id} className="mini-card"><strong>{user.name}</strong><p>{user.email}</p><span className="chip">{user.role}</span></div>)}
    </div>
  );
}

function ProfileForm({ user, onSubmit }: { user: User; onSubmit: (payload: { birthday: string | null; joinedOn: string | null; showBirthday: boolean }) => void }) {
  const [birthday, setBirthday] = useState(user.birthday ?? '');
  const [joinedOn, setJoinedOn] = useState(user.joinedOn ?? '');
  const [showBirthday, setShowBirthday] = useState(user.showBirthday);
  return (
    <form className="form-stack" onSubmit={(e) => { e.preventDefault(); onSubmit({ birthday: birthday || null, joinedOn: joinedOn || null, showBirthday }); }}>
      <input value={user.name} disabled />
      <input value={user.email} disabled />
      <label>Birthday<input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} /></label>
      <label>Joined on<input type="date" value={joinedOn} onChange={(e) => setJoinedOn(e.target.value)} /></label>
      <label className="checkbox-row"><input type="checkbox" checked={showBirthday} onChange={(e) => setShowBirthday(e.target.checked)} /> Show birthday to the team</label>
      <button className="primary-btn">Save profile</button>
    </form>
  );
}

export default App;