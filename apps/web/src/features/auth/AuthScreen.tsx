import { useState, useEffect } from 'react';
import { api } from '../../api';

export function AuthScreen({ onSubmit, busy, message }: { onSubmit: (endpoint: '/auth/login' | '/auth/signup', payload: Record<string, unknown>) => Promise<void>; busy: boolean; message: string }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [birthday, setBirthday] = useState('');
  const [joinedOn, setJoinedOn] = useState('');
  const normalizedEmail = email.trim().toLowerCase();
  const [emailCheck, setEmailCheck] = useState<{ email: string; allowed?: boolean; error?: string } | null>(null);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const currentCheck = emailCheck?.email === normalizedEmail ? emailCheck : null;
  const allowed = currentCheck?.allowed === true;
  const emailFeedback = !normalizedEmail ? '' : !validEmail ? 'Enter a valid email' : currentCheck?.error || (currentCheck?.allowed === false ? 'Email not whitelisted' : !allowed ? 'Checking email?' : '');
  const canSubmit = allowed && password.length >= 8 && (mode === 'login' || (name.trim().length > 0 && role.trim().length > 0)) && !busy;

  useEffect(() => {
    if (!validEmail) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void api<{ allowed: boolean }>('/auth/check-email', { method: 'POST', body: JSON.stringify({ email: normalizedEmail }) })
        .then((result) => { if (!cancelled) setEmailCheck({ email: normalizedEmail, allowed: result.allowed }); })
        .catch(() => { if (!cancelled) setEmailCheck({ email: normalizedEmail, error: 'Unable to check email. Try again.' }); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [normalizedEmail, validEmail]);

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <img src="/co2opt-logo.jpg" alt="CO2OPT logo" className="auth-logo" />
        <h1>CO2OPT Employee Portal</h1>
        <p className="auth-tagline">Bright. Chaotic. Very internal. Slightly unprofessional. Very fun.</p>
        <div className="switch-row">
          <button className={mode === 'login' ? 'nav-btn active' : 'nav-btn'} onClick={() => setMode('login')}>Login</button>
          <button className={mode === 'signup' ? 'nav-btn active' : 'nav-btn'} onClick={() => setMode('signup')}>Sign up</button>
        </div>
        <form className="form-stack" onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          if (mode === 'login') {
            void onSubmit('/auth/login', { email: normalizedEmail, password });
          } else {
            void onSubmit('/auth/signup', { email: normalizedEmail, password, name, role, birthday: birthday || null, joinedOn: joinedOn || null });
          }
        }}>
          <label className="auth-email-field" htmlFor="auth-email">
            <span className="auth-email-label">Email <span id="auth-email-feedback" className="auth-email-feedback" role="status">{emailFeedback}</span></span>
            <input id="auth-email" type="email" required autoComplete="email" placeholder="you@co2opt.com" value={email} aria-describedby="auth-email-feedback" aria-invalid={currentCheck?.allowed === false || (!!normalizedEmail && !validEmail)} onChange={(e) => { setEmail(e.target.value); setEmailCheck(null); }} />
          </label>
          <input required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {mode === 'signup' ? (
            <>
              <div className="auth-date-fields"><input aria-label="Full name" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required /><input aria-label="Job role" placeholder="Your role / job title" value={role} onChange={(e) => setRole(e.target.value)} maxLength={100} required /></div>
              <div className="auth-date-fields">
                <label>Birthday<input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} /></label>
                <label>Joined company<input type="date" value={joinedOn} onChange={(e) => setJoinedOn(e.target.value)} /></label>
              </div>
            </>
          ) : null}
          <button className="primary-btn" disabled={!canSubmit}>{busy ? 'Working...' : mode === 'login' ? 'Login' : 'Sign up'}</button>
        </form>
        {message ? <div className="message-banner">{message}</div> : null}
      </div>
    </div>
  );
}
