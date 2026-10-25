import { usePortal } from './features/dashboard/usePortal';
import type { TabKey } from './features/dashboard/types';
import { AuthScreen } from './features/auth/AuthScreen';
import { HomePage } from './features/dashboard/HomePage';
import { HolidaysPage } from './features/leave/HolidaysPage';
import { DiscoverPage } from './features/recommendations/DiscoverPage';
import { TeamPage } from './features/team/TeamPage';
import { ProfilePage } from './features/profile/ProfilePage';

function App() {
  const portal = usePortal();
  const { user, loading, busy, activeTab, setActiveTab, logout, handleAuth } = portal;

  if (loading) return <div className="splash">Loading the fun zone...</div>;
  if (!user) return <AuthScreen onSubmit={handleAuth} busy={busy} />;

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
          <button type="button" className="user-pill profile-button" onClick={() => setActiveTab('me')} aria-label="Open my profile">
            <span>{user.name}</span>
            <strong>{user.role}</strong>
          </button>
          <button className="ghost-btn" disabled={busy} onClick={() => void logout()}>Log out</button>
        </div>
      </header>

      <nav className="nav-tabs">
        {[
          ['home', 'Home'],
          ['holidays', 'Holidays'],
          ['discover', 'Discover'],
          ['team', 'Team']
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

      {activeTab === 'home' && <HomePage {...portal} user={user} />}

      {activeTab === 'holidays' && <HolidaysPage {...portal} />}

      {activeTab === 'discover' && <DiscoverPage {...portal} user={user} />}

      {activeTab === 'team' && <TeamPage {...portal} user={user} />}

      {activeTab === 'me' && <ProfilePage {...portal} user={user} />}
    </div>
  );
}

export default App;
