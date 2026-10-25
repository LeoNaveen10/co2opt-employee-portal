import type { PortalState } from '../dashboard/usePortal';
import { KudosForm } from '../team/KudosForm';
import { CelebrationsList } from '../team/CelebrationsList';
import { DirectoryList } from '../team/DirectoryList';
import { api } from '../../api';

export function TeamPage({ user, message, data, runAction }: Omit<Pick<PortalState, 'user' | 'message' | 'data' | 'runAction'>, 'user'> & { user: NonNullable<PortalState['user']> }) {
  return (
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
  );
}
