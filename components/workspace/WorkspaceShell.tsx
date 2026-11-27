'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronDown, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Mail, Search, FilePlus2, Pencil, Save, Undo2, Ban, Copy,
  FileText, Printer, CircleHelp, Calculator as CalcIcon, LogOut, UserRoundCog, Star, Plus, PanelLeftClose, PanelLeftOpen, ListFilter, List,
} from 'lucide-react';
import { menuFor, leafFor, DEFAULT_FAVOURITES, type MenuNode } from '@/components/workspace/menu';
import { canOpen, screenOf } from '@/components/layout/navigation';
import { ToolbarProvider, useToolbarState, type ToolAction } from '@/components/workspace/toolbar';
import { Calculator, MsgBoxProvider } from '@/components/workspace/controls';

// The Prodexa workspace: a navy app bar (logo, module menu, company and financial year, tools, user), a command bar
// for the open document, a Favourites rail on the left, and the screen itself.

export interface ShellUser { name?: string; email?: string; role?: string }

/** Indian financial year (April to March) containing the date, e.g. "FY 2026-27" */
export function financialYear(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `FY ${y}-${String(y + 1).slice(2)}`;
}

export default function WorkspaceShell(props: { user: ShellUser | null; company: string; children: ReactNode }) {
  return (
    <ToolbarProvider>
      <MsgBoxProvider>
        <Suspense fallback={null}><Shell {...props} /></Suspense>
      </MsgBoxProvider>
    </ToolbarProvider>
  );
}

function Shell({ user, company, children }: { user: ShellUser | null; company: string; children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();
  const role = user?.role || 'VIEWER';
  const menu = useMemo(() => menuFor(role), [role]);
  const current = leafFor(menu, pathname, search);
  const [calc, setCalc] = useState(false);

  const signOut = useCallback(async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    window.location.href = '/login';
  }, []);

  // Screens rebuilt on the workspace components use its look; screens not yet rebuilt keep their own inside it.
  const newScreen = pathname === '/dashboard' || pathname.startsWith('/dashboard/transactions/') || pathname.startsWith('/dashboard/masters/') || pathname === '/dashboard/inventory/items';
  // a screen the role may not open (typed or bookmarked URL) is refused here as well as hidden from the menu
  const screen = screenOf(pathname);
  const allowed = !screen || canOpen(role, screen);

  return (
    <div className="px-app">
      <AppBar menu={menu} currentModule={current?.module} currentHref={current?.href} company={company} user={user} onCalc={() => setCalc(true)} onSignOut={signOut} />
      <CommandBar />
      <div className="px-body">
        <Favourites role={role} email={user?.email || 'user'} current={current} />
        <main className={`px-workspace ${newScreen ? '' : 'px-workspace--legacy erp-shell erp-main'}`}>
          {role === 'VIEWER' && !newScreen && (
            <div className="message-strip message-strip--info mb-4"><strong>Read-only view.</strong> You can see every department; changes, approvals and personal data are restricted.</div>)}
          {/* a new key per screen and tab, so opening another tab of a screen from the menu starts it fresh (a document id in the URL does not) */}
          <div key={`${pathname}?${params.get('tab') || ''}`} className={newScreen ? 'contents' : ''}>
            {allowed ? children : <div className="px-error">Your role ({role.replace(/_/g, ' ')}) cannot open this screen. Choose one from the menu.</div>}
          </div>
        </main>
      </div>
      {calc && <Calculator onClose={() => setCalc(false)} />}
    </div>
  );
}

// ---------- App bar ----------

function AppBar({ menu, currentModule, currentHref, company, user, onCalc, onSignOut }: {
  menu: MenuNode[]; currentModule?: string; currentHref?: string; company: string; user: ShellUser | null; onCalc: () => void; onSignOut: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, []);
  const go = (href: string) => { setOpen(null); router.push(href); };
  const name = user?.name || 'User';
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <header ref={ref} className="px-appbar">
      <Link href="/dashboard" className="px-brand" title="Start page">
        <Image src="/images/prodexa_logo.png" alt="" width={28} height={28} />
        <span>Prod<b>e</b>xa</span>
      </Link>
      <nav className="px-modules" aria-label="Modules">
        {menu.map(m => (
          <button key={m.label} className={`px-module ${open === m.label ? 'is-open' : ''} ${currentModule === m.label ? 'is-active' : ''}`}
            aria-expanded={open === m.label}
            onClick={e => { const x = e.currentTarget.getBoundingClientRect().left; setLeft(x); setOpen(o => (o === m.label ? null : m.label)); }}
            onMouseEnter={e => { if (open && open !== m.label && open !== '__user') { setLeft(e.currentTarget.getBoundingClientRect().left); setOpen(m.label); } }}>
            {m.label}<ChevronDown />
          </button>))}
      </nav>
      {/* the drop-down sits under the app bar, lined up with its module button */}
      {open && open !== '__user' && <ModuleDrop node={menu.find(m => m.label === open)} left={left} currentHref={currentHref} onGo={go} />}
      {open === '__user' && (
        <div className="px-drop" style={{ right: 8 }}>
          <div className="px-drop__head">{name}</div>
          <div style={{ padding: '0 10px 8px', color: 'var(--px-muted)', fontSize: 12 }}>{user?.email}<br />{(user?.role || '').replace(/_/g, ' ')}</div>
          <div className="px-drop__sep" />
          <button className="px-drop__item" onClick={onSignOut}><UserRoundCog className="h-4 w-4" />Switch user</button>
          <button className="px-drop__item" onClick={onSignOut}><LogOut className="h-4 w-4" />Sign out</button>
        </div>)}
      <div className="px-appbar__right">
        <span className="px-chip" title="Company">{company}</span>
        <span className="px-chip" title="Financial year">{financialYear()}</span>
        <button className="px-iconbtn" onClick={onCalc} title="Calculator" aria-label="Calculator"><CalcIcon /></button>
        <button className="px-iconbtn" onClick={() => window.open('/docs', '_blank')} title="Help" aria-label="Help"><CircleHelp /></button>
        <button className="px-avatar" onClick={() => setOpen(o => (o === '__user' ? null : '__user'))} title={name} aria-label="User menu">{initials || 'U'}</button>
      </div>
    </header>
  );
}

function ModuleDrop({ node, left, currentHref, onGo }: { node?: MenuNode; left: number; currentHref?: string; onGo: (href: string) => void }) {
  if (!node?.children) return null;
  const item = (it: MenuNode, i: number) => it.sep
    ? <div key={`s${i}`} className="px-drop__sep" />
    : it.children
      ? <div key={it.label}><div className="px-drop__head">{it.label}</div>{it.children.map(item)}</div>
      : <button key={it.href} className={`px-drop__item ${it.href === currentHref ? 'is-current' : ''}`} onClick={() => it.href && onGo(it.href)}>{it.label}</button>;
  return <div className="px-drop" style={{ left }} role="menu" aria-label={node.label}>{node.children.map(item)}</div>;
}

// ---------- Command bar (only while a document screen is open) ----------

const KEYS: Record<string, ToolAction> = { 'ctrl+home': 'first', 'ctrl+pageup': 'prev', 'ctrl+pagedown': 'next', 'ctrl+end': 'last', f3: 'locate', f4: 'list', 'ctrl+n': 'new', 'ctrl+e': 'edit', 'ctrl+s': 'save', escape: 'cancel', 'ctrl+p': 'print' };

function CommandBar() {
  const tb = useToolbarState();
  const [no, setNo] = useState('');
  const editing = tb.mode === 'edit' || tb.mode === 'new';

  const tbRef = useRef(tb);
  useEffect(() => { tbRef.current = tb; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.px-overlay')) return;
      const action = KEYS[`${e.ctrlKey || e.metaKey ? 'ctrl+' : ''}${e.key.toLowerCase()}`];
      if (!action || !tbRef.current.has(action)) return;
      const ed = tbRef.current.mode === 'edit' || tbRef.current.mode === 'new';
      if (action === 'cancel' && !ed) return;
      e.preventDefault();
      tbRef.current.run(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!tb.mode) return null;
  const cmd = (action: ToolAction, label: string, Icon: any, hint?: string, primary?: boolean) => (
    <button key={action} className={`px-cmd ${primary ? 'px-cmd--primary' : ''}`} disabled={!tb.has(action)} onClick={() => tb.run(action)} title={hint ? `${label} (${hint})` : label}>
      <Icon />{label}
    </button>);

  return (
    <div className="px-commandbar" role="toolbar" aria-label="Document commands">
      <div className="px-cmdgroup">
        {editing
          ? <>{cmd('save', 'Save', Save, 'Ctrl+S', true)}{cmd('cancel', 'Discard', Undo2, 'Esc')}</>
          : <>{cmd('new', 'New', FilePlus2, 'Ctrl+N', true)}{cmd('edit', 'Edit', Pencil, 'Ctrl+E')}</>}
      </div>
      {!editing && <div className="px-cmdgroup">{cmd('copy', 'Duplicate', Copy)}{cmd('delete', tb.deleteLabel, Ban)}</div>}
      {!editing && (tb.has('print') || tb.has('preview') || tb.has('email')) && <div className="px-cmdgroup">{cmd('print', 'Print', Printer, 'Ctrl+P')}{cmd('preview', 'Preview', FileText)}{cmd('email', 'E-mail', Mail)}</div>}
      {!editing && (
        <div className="px-cmdbar__right">
          <div className="px-nav" aria-label="Move between documents">
            <button className="px-cmd" disabled={!tb.has('first')} onClick={() => tb.run('first')} title="Oldest (Ctrl+Home)" aria-label="Oldest"><ChevronsLeft /></button>
            <button className="px-cmd" disabled={!tb.has('prev')} onClick={() => tb.run('prev')} title="Previous (Ctrl+PgUp)" aria-label="Previous"><ChevronLeft /></button>
            <span className="px-nav__pos">{tb.position}</span>
            <button className="px-cmd" disabled={!tb.has('next')} onClick={() => tb.run('next')} title="Next (Ctrl+PgDn)" aria-label="Next"><ChevronRight /></button>
            <button className="px-cmd" disabled={!tb.has('last')} onClick={() => tb.run('last')} title="Newest (Ctrl+End)" aria-label="Newest"><ChevronsRight /></button>
          </div>
          <form className="px-find" onSubmit={e => { e.preventDefault(); if (no.trim()) tb.find(no.trim()); }}>
            <input value={no} onChange={e => setNo(e.target.value)} placeholder="Go to doc no." aria-label="Go to document number" disabled={!tb.canFind} />
            <button type="submit" disabled={!tb.canFind} title="Go" aria-label="Go to document"><Search className="h-4 w-4" /></button>
          </form>
          {cmd('locate', 'Browse', ListFilter, 'F3')}
          <button className={`px-cmd ${tb.listing ? 'is-pressed' : ''}`} disabled={!tb.has('list')} aria-pressed={tb.listing} onClick={() => tb.run('list')} title={tb.listing ? 'Back to the open document (F4)' : 'List of all documents (F4)'}><List />List</button>
        </div>)}
    </div>
  );
}

// ---------- Favourites rail ----------

interface Favourite { label: string; href: string }

function Favourites({ role, email, current }: { role: string; email: string; current: { label: string; href: string } | null }) {
  const key = `prodexa.favourites.${email}`;
  const [collapsed, setCollapsed] = useState(false);
  const [list, setList] = useState<Favourite[] | null>(null);
  const pathname = usePathname();
  const tab = useSearchParams().get('tab');

  // favourites are kept in the browser, so they are read after the first render (the server cannot see them)
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      setList(Array.isArray(saved) ? saved : DEFAULT_FAVOURITES);
      setCollapsed(localStorage.getItem('prodexa.favourites.collapsed') === '1');
    } catch { setList(DEFAULT_FAVOURITES); }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [key]);
  const save = (l: Favourite[]) => { setList(l); try { localStorage.setItem(key, JSON.stringify(l)); } catch {} };
  const toggle = () => setCollapsed(c => { try { localStorage.setItem('prodexa.favourites.collapsed', c ? '0' : '1'); } catch {} return !c; });
  const here = pathname + (tab ? `?tab=${tab}` : '');
  const canAdd = !!list && pathname !== '/dashboard' && !list.some(f => f.href === here);
  const add = () => { if (canAdd) save([...(list || []), { label: current?.label || pathname.split('/').pop() || 'Screen', href: here }]); };
  const shown = (list || []).filter(f => canOpen(role, f.href.split('?')[0]));

  if (collapsed) return (
    <aside className="px-rail is-collapsed" aria-label="Favourites">
      <button className="px-rail__toggle" onClick={toggle} title="Show favourites" aria-label="Show favourites"><PanelLeftOpen className="h-5 w-5" /></button>
    </aside>);
  return (
    <aside className="px-rail" aria-label="Favourites">
      <div className="px-rail__head"><Star />Favourites<button className="px-rail__toggle" onClick={toggle} title="Hide favourites" aria-label="Hide favourites"><PanelLeftClose className="h-4 w-4" /></button></div>
      {shown.map(f => (
        <Link key={f.href} href={f.href} className={`px-fav ${f.href === here ? 'is-current' : ''}`}>
          <span className="px-fav__dot" />{f.label}
          <button className="px-fav__x" aria-label={`Remove ${f.label}`} title="Remove"
            onClick={e => { e.preventDefault(); e.stopPropagation(); save((list || []).filter(x => x.href !== f.href)); }}>×</button>
        </Link>))}
      <button className="px-rail__add" onClick={add} disabled={!canAdd} title="Add the open screen to favourites"><Plus />Add this screen</button>
    </aside>
  );
}
