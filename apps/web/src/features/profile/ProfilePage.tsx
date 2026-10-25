import type { PortalState } from '../dashboard/usePortal';
import { ProfileForm } from '../profile/ProfileForm';
import { api } from '../../api';

export function ProfilePage({ user, runAction }: Omit<Pick<PortalState, 'user' | 'runAction'>, 'user'> & { user: NonNullable<PortalState['user']> }) {
  return (
        <div className="page-grid two-col">
          <section className="card">
            <h3>Personal details</h3>
            <ProfileForm user={user} onSubmit={(payload) => runAction(() => api('/users/me', { method: 'PATCH', body: JSON.stringify(payload) }), 'Profile updated.')} />
          </section>
        </div>
  );
}
