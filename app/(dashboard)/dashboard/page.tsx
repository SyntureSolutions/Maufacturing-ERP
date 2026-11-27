import Link from 'next/link';
import { Fragment } from 'react';
import { getSession } from '@/lib/auth';
import { FLOWS } from '@/components/workspace/menu';
import { canOpen } from '@/components/layout/navigation';

// Start page: the three business flows as step chains. Each step opens the screen where that document is made;
// steps a role may not open are shown greyed so the whole flow still reads end to end.
export default async function StartPage() {
  const session = await getSession();
  const role = session?.user?.role || 'VIEWER';
  const first = (session?.user?.name || '').split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <div className="px-start">
      <div className="px-start__hello">
        <div>
          <h1>{greeting}{first ? `, ${first}` : ''}</h1>
          <p>Pick a step to open it, or use the menu above. Your favourite screens are on the left.</p>
        </div>
      </div>
      {FLOWS.map(flow => (
        <section key={flow.title} className="px-lane">
          <h2>{flow.title}</h2>
          <div className="px-steps">
            {flow.steps.map((s, i) => {
              const ok = canOpen(role, s.href.split('?')[0]);
              return (
                <Fragment key={s.label}>
                  {i > 0 && <span className="px-arrow" aria-hidden>→</span>}
                  {ok
                    ? <Link href={s.href} className="px-step"><span className="px-step__n">{i + 1}</span>{s.label}</Link>
                    : <span className="px-step" style={{ opacity: .45 }} title="Not available for your role"><span className="px-step__n">{i + 1}</span>{s.label}</span>}
                </Fragment>);
            })}
          </div>
        </section>))}
    </div>
  );
}
