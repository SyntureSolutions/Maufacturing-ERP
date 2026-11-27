import type { ReactNode } from 'react';

// Shared page chrome. Visual rules live in app/globals.css (.page-header, .alert, ...).

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div className="page-header__title">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Alert({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div role={ok ? 'status' : 'alert'} className={`alert ${ok ? 'alert-ok' : 'alert-err'}`}>
      <span aria-hidden className="mt-px">{ok ? '✓' : '!'}</span>
      <span>{children}</span>
    </div>
  );
}
