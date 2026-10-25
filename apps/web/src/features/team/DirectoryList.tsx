import type { User } from '../../types';

export function DirectoryList({ users }: { users: User[] }) {
  return (
    <div className="grid-cards">
      {users.map((user) => <div key={user.id} className="mini-card"><strong>{user.name}</strong><p>{user.email}</p><span className="chip">{user.role}</span></div>)}
    </div>
  );
}
