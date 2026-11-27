import Link from 'next/link';

// Accounts are created by an administrator (each one carries a role that decides what the person can do),
// so there is no self sign-up. This page says how to get access instead of pretending to register anyone.
export default function RegisterPage() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-card__brand"><img src="/images/prodexa_logo.png" alt="" /><span>Prodexa ERP</span></div>
        <h1>Request access</h1>
        <p>Prodexa accounts are set up by your administrator, who also assigns your role (for example Sales, Supply Chain, Production, Quality or Finance).</p>
        <div className="space-y-3 text-sm">
          <p>To get an account, send your administrator:</p>
          <ul className="list-disc space-y-1 pl-5 text-[var(--erp-muted)]">
            <li>your name and work email</li>
            <li>your department and the work you need to do in Prodexa</li>
          </ul>
          <p>You will receive your sign-in details once the account is created.</p>
        </div>
        <div className="auth-card__footer">Already have an account? <Link href="/login">Sign in</Link></div>
      </div>
      <p className="auth-note">© {new Date().getFullYear()} Prodexa ERP</p>
    </main>
  );
}
