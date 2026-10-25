import type { PortalState } from '../dashboard/usePortal';
import { StatBubble } from '../dashboard/StatBubble';
import { LeaveSummaryTable } from '../leave/LeaveSummaryTable';

export function HomePage({ user, message, setActiveTab, data, leaveTaken, leaveRemaining, upcomingBirthdays, upcomingAnniversaries }: Omit<Pick<PortalState, 'user' | 'message' | 'setActiveTab' | 'data' | 'leaveTaken' | 'leaveRemaining' | 'upcomingBirthdays' | 'upcomingAnniversaries'>, 'user'> & { user: NonNullable<PortalState['user']> }) {
  return (
        <div className="page-grid">
          <section className="card hero-card gradient-a">
            <div>
              <h2>Welcome back, {user.name}! 🎉</h2>
              <p>This is your colorful little team playground.</p>
            </div>
            <div className="hero-stats">
              <StatBubble label="Leave taken" value={String(leaveTaken)} />
              <StatBubble label="Leave remaining" value={String(leaveRemaining)} />
              <StatBubble label="Recommendations" value={String(data.recommendations.length)} onClick={() => setActiveTab('discover')} />
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
            )) : null}
            {upcomingAnniversaries.map((person) => (
              <div key={`${person.id}-anniv`} className="mini-card"><strong>{person.name}</strong> — Joined: {person.joinedOn}</div>
            ))}
            {!upcomingBirthdays.length && !upcomingAnniversaries.length ? <p>No birthdays or anniversaries in the next 15 days.</p> : null}
          </section>
        </div>
  );
}
