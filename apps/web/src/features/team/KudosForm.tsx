import { useState } from 'react';
import type { User } from '../../types';

export function KudosForm({ users, currentUser, onSubmit }: { users: User[]; currentUser: User; onSubmit: (payload: { toId: string; message: string }) => void }) {
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
