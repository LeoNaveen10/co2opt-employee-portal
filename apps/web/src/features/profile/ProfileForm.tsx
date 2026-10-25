import { useState } from 'react';
import type { User } from '../../types';

export function ProfileForm({ user, onSubmit }: { user: User; onSubmit: (payload: { birthday: string | null; joinedOn: string | null; showBirthday: boolean }) => void }) {
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
