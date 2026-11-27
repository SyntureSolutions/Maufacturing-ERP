'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Sign-in failed.');
        setIsLoading(false);
        return;
      }
      window.location.href = '/dashboard';
    } catch {
      setError('Could not reach the server. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-card__brand"><img src="/images/prodexa_logo.png" alt="" /><span>Prodexa ERP</span></div>
        <h1>Sign in</h1>
        <p>Use your company account.</p>

        <form onSubmit={handleSubmit}>
          {error && <Alert ok={false}>{error}</Alert>}
          <label className="lbl">Email
            <input className="input" type="email" autoComplete="username" required autoFocus value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="lbl">Password
            <span className="relative block">
              <input className="input !pr-10" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-2 top-1/2 mt-[.15rem] -translate-y-1/2 p-1 text-[var(--erp-muted)] hover:text-[var(--erp-ink)]" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>
          <button type="submit" className="btn btn-primary" disabled={isLoading}>
            {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</> : 'Sign in'}
          </button>
          <p className="auth-note">Forgot your password? Ask your administrator to reset it.</p>
        </form>

        <div className="auth-card__footer">No account yet? <a href="/register">Request access</a></div>
      </div>
      <p className="auth-note">© {new Date().getFullYear()} Prodexa ERP</p>
    </main>
  );
}
