import type { DashboardData } from '../dashboard/types';

export function CelebrationsList({ celebrations }: { celebrations: DashboardData['celebrations'] }) {
  return (
    <div className="grid-cards">
      {celebrations.birthdays.map((user) => <div key={user.id} className="mini-card"><strong>{user.name}</strong><p>Birthday: {user.birthday}</p></div>)}
      {celebrations.anniversaries.map((user) => <div key={`${user.id}-a`} className="mini-card"><strong>{user.name}</strong><p>Joined: {user.joinedOn}</p></div>)}
    </div>
  );
}
