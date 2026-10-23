import { useEffect, useState } from 'react';
import { api } from './api';
import type { Kudos, LeaveRequest, LeaveSummary, Recommendation, RecommendationSearchResult, User } from './types';

type DashboardData = {
  users: User[];
  leaveSummary: LeaveSummary[];
  leaveRequests: LeaveRequest[];
  calendarLeaves: LeaveRequest[];
  recommendations: Recommendation[];
  kudos: Kudos[];
  celebrations: { birthdays: User[]; anniversaries: User[] };
};

type TabKey = 'home' | 'holidays' | 'discover' | 'team' | 'me';

const initialData: DashboardData = {
  users: [],
  leaveSummary: [],
  leaveRequests: [],
  calendarLeaves: [],
  recommendations: [],
  kudos: [],
  celebrations: { birthdays: [], anniversaries: [] }
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [data, setData] = useState<DashboardData>(initialData);
  const [editingRecommendation, setEditingRecommendation] = useState<Recommendation | null>(null);

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

  if (loading) return <div className="splash">Loading the fun zone...</div>;
  if (!user) return <AuthScreen onSubmit={handleAuth} busy={busy} message={message} />;

  const myLeave = data.leaveSummary.find((item) => item.userId === user.id);
  const leaveTaken = myLeave?.taken ?? getTakenDays(user.id, data.leaveRequests);
  const leaveRemaining = Math.max((myLeave?.allocation ?? 23) - leaveTaken, 0);
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
              <StatBubble label="Leave taken" value={String(leaveTaken)} />
              <StatBubble label="Leave remaining" value={String(leaveRemaining)} />
              <StatBubble label="Recommendations" value={String(data.recommendations.length)} />
            </div>
          </section>
          <section className="card">
            <h3>Leave leaderboard</h3>
            <LeaveSummaryTable summary={data.leaveSummary} requests={data.leaveRequests} />
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
        </div>
      )}

      {activeTab === 'holidays' && (
        <div className="page-grid two-col">
          <section className="card">
            <h3>Everyone's leave counts</h3>
            <LeaveSummaryTable summary={data.leaveSummary} requests={data.leaveRequests} />
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
      )}

      {activeTab === 'discover' && (
        <div className="page-grid two-col">
          <section className="card">
            <h3>{editingRecommendation ? 'Edit recommendation' : 'Add recommendation'}</h3>
            <p className="section-subtitle">Share a movie, series, book, or song with the team.</p>
            <RecommendationForm
              key={editingRecommendation?.id ?? 'new-recommendation'}
              recommendation={editingRecommendation}
              busy={busy}
              onCancel={() => setEditingRecommendation(null)}
              onSubmit={async (payload) => {
                const recommendationId = editingRecommendation?.id;
                const saved = await runAction(
                  () => api(recommendationId ? `/recommendations/${recommendationId}` : '/recommendations', {
                    method: recommendationId ? 'PATCH' : 'POST',
                    body: JSON.stringify(payload)
                  }),
                  recommendationId ? 'Recommendation updated.' : 'Recommendation added!'
                );
                if (saved) setEditingRecommendation(null);
                return saved;
              }}
            />
          </section>
          <section className="card span-2">
            <h3>Movies, series and books 🍿📚</h3>
            <p className="section-subtitle">Everyone can like and rate these picks from 1 to 5 stars.</p>
            <RecommendationGrid
              items={data.recommendations.filter((item) => item.type !== 'MUSIC')}
              currentUser={user}
              busy={busy}
              onEdit={setEditingRecommendation}
              onDelete={(id) => void deleteRecommendation(id)}
              onLike={(id) => runAction(() => api(`/recommendations/${id}/like`, { method: 'POST' }), 'Reaction updated.')}
              onRate={(id, score) => runAction(() => api(`/recommendations/${id}/rate`, { method: 'POST', body: JSON.stringify({ score }) }), 'Rating saved.')}
            />
          </section>
          <section className="card span-2 gradient-c">
            <h3>Shared music corner 🎧</h3>
            <p className="section-subtitle">Drop songs, albums, or playlists and rate other people's music picks.</p>
            <RecommendationGrid
              items={data.recommendations.filter((item) => item.type === 'MUSIC')}
              currentUser={user}
              busy={busy}
              onEdit={setEditingRecommendation}
              onDelete={(id) => void deleteRecommendation(id)}
              onLike={(id) => runAction(() => api(`/recommendations/${id}/like`, { method: 'POST' }), 'Reaction updated.')}
              onRate={(id, score) => runAction(() => api(`/recommendations/${id}/rate`, { method: 'POST', body: JSON.stringify({ score }) }), 'Rating saved.')}
            />
          </section>
        </div>
      )}

      {activeTab === 'team' && (
        <div className="page-grid two-col">
          <section className="card">
            <h3>Send kudos</h3>
            <p className="section-subtitle">Anyone can send shout-outs to anyone else on the team.</p>
            <KudosForm users={data.users} currentUser={user} onSubmit={(payload) => runAction(() => api('/kudos', { method: 'POST', body: JSON.stringify(payload) }), 'Kudos delivered!')} />
          </section>
          <section className="card span-2">
            <h3>Kudos wall 💌</h3>
            <p className="section-subtitle">Public appreciation, team love, and small wins all belong here.</p>
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
              <li>Leave is recorded immediately without an approval step.</li>
              <li>You can see everyone's leave allocation, taken days and remaining balance.</li>
              <li>Leave counts skip weekends.</li>
              <li>Half-day support is intentionally disabled.</li>
              <li>Music and kudos keep the place alive.</li>
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
        <p className="auth-tagline">Bright. Chaotic. Very internal. Slightly unprofessional. Very fun.</p>
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

function getTakenDays(userId: string, requests: LeaveRequest[]) {
  const year = new Date().getUTCFullYear().toString();
  return requests
    .filter((leave) => leave.employeeId === userId && leave.status !== 'REJECTED' && leave.startDate.startsWith(`${year}-`))
    .reduce((sum, leave) => sum + leave.days, 0);
}

function LeaveSummaryTable({ summary, requests }: { summary: LeaveSummary[]; requests: LeaveRequest[] }) {
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

function LeaveRequestForm({ onSubmit, busy }: { onSubmit: (payload: { startDate: string; endDate: string; note: string }) => void; busy: boolean }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  return (
    <form className="form-stack" onSubmit={(e) => { e.preventDefault(); onSubmit({ startDate, endDate, note }); setNote(''); }}>
      <label>Start date<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></label>
      <label>End date<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required /></label>
      <textarea placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="primary-btn" disabled={busy}>Record leave immediately</button>
    </form>
  );
}

function LeaveRequestsList({ requests }: { requests: LeaveRequest[] }) {
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

function AvailabilityCalendar({ leaves }: { leaves: LeaveRequest[] }) {
  const month = new Date();
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
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
      <p className="section-subtitle">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
      <div className="calendar-legend">
        <span className="tag away">Leave taken / booked</span>
      </div>
      <div className="calendar-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day} className="calendar-head">{day}</div>)}
        {Array.from({ length: firstDay.getDay() }).map((_, idx) => <div key={`pad-${idx}`} className="calendar-cell muted" />)}
        {days.map((date) => {
          const iso = localISODate(date);
          const dayLeaves = leaves.filter((leave) => iso >= leave.startDate && iso <= leave.endDate);
          return (
            <div key={iso} className="calendar-cell">
              <div className="calendar-date">{date.getDate()}</div>
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

function RecommendationForm({ recommendation, busy, onSubmit, onCancel }: {
  recommendation: Recommendation | null;
  busy: boolean;
  onSubmit: (payload: { type: string; title: string; url: string; imageUrl: string; note: string }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [type, setType] = useState(recommendation?.type ?? 'MOVIE');
  const [title, setTitle] = useState(recommendation?.title ?? '');
  const [url, setUrl] = useState(recommendation?.url ?? '');
  const [imageUrl, setImageUrl] = useState(recommendation?.imageUrl ?? '');
  const [note, setNote] = useState(recommendation?.note ?? '');
  const [searchResults, setSearchResults] = useState<RecommendationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState('');

  async function searchCatalog() {
    if (title.trim().length < 2) {
      setSearchError('Enter at least 2 characters to search.');
      return;
    }
    setSearching(true);
    setSearchError('');
    setHasSearched(false);
    try {
      const response = await api<{ results: RecommendationSearchResult[] }>(
        `/recommendations/search?type=${encodeURIComponent(type)}&term=${encodeURIComponent(title.trim())}`
      );
      setSearchResults(response.results);
      setHasSearched(true);
    } catch (error) {
      setSearchError((error as Error).message);
    } finally {
      setSearching(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={async (e) => {
      e.preventDefault();
      const saved = await onSubmit({ type, title, url, imageUrl, note });
      if (saved && !recommendation) {
        setTitle('');
        setUrl('');
        setImageUrl('');
        setNote('');
        setSearchResults([]);
        setHasSearched(false);
      }
    }}>
      <select value={type} onChange={(e) => { setType(e.target.value); setImageUrl(''); setSearchResults([]); setHasSearched(false); setSearchError(''); }}>
        <option value="MOVIE">Movie</option>
        <option value="SERIES">Series</option>
        <option value="BOOK">Book</option>
        <option value="MUSIC">Music</option>
      </select>
      <label>
        Title
        <input placeholder="Search by title" value={title} onChange={(e) => { setTitle(e.target.value); setImageUrl(''); setUrl(''); setSearchResults([]); setHasSearched(false); }} required />
      </label>
      {type !== 'BOOK' ? (
        <div className="catalog-search">
          <button type="button" className="ghost-btn" onClick={() => void searchCatalog()} disabled={busy || searching}>
            {searching ? 'Searching…' : 'Find artwork'}
          </button>
          {searchError ? <p className="catalog-error" role="alert">{searchError}</p> : null}
          {searchResults.length ? (
            <div className="catalog-results" aria-label="Artwork search results">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  className="catalog-result"
                  onClick={() => {
                    setTitle(result.title);
                    setUrl(result.url ?? '');
                    setImageUrl(result.imageUrl);
                    setSearchResults([]);
                  }}
                >
                  <img src={result.imageUrl} alt="" />
                  <span><strong>{result.title}</strong>{result.artist ? <small>{result.artist}</small> : null}</span>
                </button>
              ))}
            </div>
          ) : null}
          {hasSearched && !searchResults.length && !searchError ? (
            <p className="meta-line">
              Apple Search has no artwork listing for this title yet. Try an image URL below, or{' '}
              <a href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(title)}`} target="_blank" rel="noreferrer">search the web for artwork</a>.
            </p>
          ) : null}
          {imageUrl ? <p className="meta-line">Artwork selected from Apple Search.</p> : null}
        </div>
      ) : null}
      <input placeholder="Optional link" value={url} onChange={(e) => setUrl(e.target.value)} />
      <input type="url" placeholder="Optional artwork image URL (HTTPS)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
      <textarea placeholder="Why recommend this?" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="inline-actions">
        <button className="primary-btn" disabled={busy}>{recommendation ? 'Save changes' : 'Share recommendation'}</button>
        {recommendation ? <button type="button" className="ghost-btn" disabled={busy} onClick={onCancel}>Cancel edit</button> : null}
      </div>
    </form>
  );
}

function RecommendationGrid({ items, currentUser, busy, onEdit, onDelete, onLike, onRate }: {
  items: Recommendation[];
  currentUser: User;
  busy: boolean;
  onEdit: (item: Recommendation) => void;
  onDelete: (id: string) => void;
  onLike: (id: string) => void;
  onRate: (id: string, score: number) => void;
}) {
  return (
    <div className="grid-cards roomy-grid">
      {items.map((item) => {
        const myRating = item.ratings.find((rating) => rating.userId === currentUser.id)?.score ?? 0;
        const average = item.ratings.length ? (item.ratings.reduce((sum, entry) => sum + entry.score, 0) / item.ratings.length).toFixed(1) : '—';
        const liked = item.likes.some((like) => like.userId === currentUser.id);
        return (
          <article key={item.id} className="rec-card">
            <div className="card-top-row">
              <span className="chip bright">{item.type}</span>
              <span className="rating-pill">⭐ {average} / 5{item.ratings.length ? ` • ${item.ratings.length} rating${item.ratings.length > 1 ? 's' : ''}` : ''}</span>
            </div>
            {item.author.id === currentUser.id ? (
              <div className="record-actions">
                <button className="ghost-btn small" disabled={busy} onClick={() => onEdit(item)}>Edit</button>
                <button className="ghost-btn small" disabled={busy} onClick={() => onDelete(item.id)}>Delete</button>
              </div>
            ) : null}
            {item.imageUrl ? <img className="rec-artwork" src={item.imageUrl} alt={`Artwork for ${item.title}`} loading="lazy" /> : null}
            <h4>{item.title}</h4>
            <p className="meta-line">Shared by {item.author.name}</p>
            {item.note ? <p>{item.note}</p> : null}
            {item.url ? <a href={item.url} target="_blank" rel="noreferrer">Open link ↗</a> : null}
            <div className="inline-actions wrap reaction-row">
              <button className={liked ? 'primary-btn small' : 'ghost-btn small'} onClick={() => onLike(item.id)}>{liked ? 'Liked 💚' : 'Like'}</button>
              <span>{item.likes.length} likes</span>
              <span>Your rating: <strong>{myRating || '—'}</strong></span>
            </div>
            <div className="rate-box">
              <div className="rate-box-header">
                <strong>Rate this pick</strong>
                <span>Tap a star to rate</span>
              </div>
              <div className="rating-row roomy-rating-row">
                {[1, 2, 3, 4, 5].map((score) => (
                  <button key={score} className={myRating >= score ? 'star active' : 'star'} onClick={() => onRate(item.id, score)} aria-label={`Rate ${item.title} ${score} star${score > 1 ? 's' : ''}`}>★</button>
                ))}
              </div>
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
  const teammates = users.filter((u) => u.id !== currentUser.id);
  return (
    <form className="form-stack" onSubmit={(e) => { e.preventDefault(); onSubmit({ toId, message }); setMessage(''); }}>
      <p className="section-subtitle">
        {teammates.length ? 'Reload the portal after new teammates are added to refresh this list.' : 'Teammates will appear here as they join the portal. Reload the portal to refresh this list.'}
      </p>
      <select value={toId} onChange={(e) => setToId(e.target.value)} required>
        <option value="">Choose a teammate</option>
        {teammates.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      <textarea placeholder="Say something nice" value={message} onChange={(e) => setMessage(e.target.value)} required />
      <button className="primary-btn">Send kudos</button>
    </form>
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