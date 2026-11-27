'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// The command bar belongs to whichever document screen is open: the screen registers what New, Edit, Save, Cancel,
// Copy, Cancel document, Print, Preview, E-mail, Find, List and the record navigator do, and the shell draws the buttons
// (disabled when the screen has no such action) and handles the keyboard shortcuts.

export type ToolAction = 'first' | 'prev' | 'next' | 'last' | 'email' | 'locate' | 'new' | 'edit' | 'save' | 'cancel' | 'delete' | 'copy' | 'preview' | 'print' | 'list';
export type DocMode = 'view' | 'edit' | 'new';

export interface DocToolbar {
  mode: DocMode;
  actions: Partial<Record<ToolAction, (() => void) | false | undefined>>;
  /** Where the open document sits in the list, e.g. "3 of 12" (shown between the navigator arrows) */
  position?: string;
  /** What the delete command is called on this screen (default: Cancel document) */
  deleteLabel?: string;
  /** Jump to a document by its number (the search box at the right of the command bar) */
  findByNumber?: (number: string) => void;
  /** The screen is showing its list of documents, not one document (the List button shows pressed) */
  listing?: boolean;
}

interface Ctx {
  /** "mode|action,action|f|position" – changes only when what the command bar shows changes */
  shape: string;
  setShape: (s: string) => void;
  active: React.MutableRefObject<DocToolbar | null>;
  setActive: (t: DocToolbar | null) => void;
}

const ToolbarCtx = createContext<Ctx | null>(null);

export function ToolbarProvider({ children }: { children: ReactNode }) {
  const [shape, setShape] = useState('');
  const active = useRef<DocToolbar | null>(null);
  const setActive = useCallback((t: DocToolbar | null) => { active.current = t; }, []);
  return <ToolbarCtx.Provider value={{ shape, setShape, active, setActive }}>{children}</ToolbarCtx.Provider>;
}

const shapeOf = (t: DocToolbar) => {
  const actions = (Object.keys(t.actions) as ToolAction[]).filter(k => typeof t.actions[k] === 'function').sort().join(',');
  return [t.mode, actions, t.findByNumber ? 'f' : '', t.position || '', t.deleteLabel || '', t.listing ? 'l' : ''].join('|');
};

/** Called by a document screen on every render; the command bar always runs the latest handlers. */
export function useDocToolbar(t: DocToolbar) {
  const ctx = useContext(ToolbarCtx);
  const shape = shapeOf(t);
  const setActive = ctx?.setActive;
  const setShape = ctx?.setShape;
  useEffect(() => { setActive?.(t); });
  useEffect(() => { setShape?.(shape); }, [setShape, shape]);
  useEffect(() => () => { setActive?.(null); setShape?.(''); }, [setActive, setShape]);
}

/** What the shell's command bar needs: the current mode, which actions exist, and a way to run one. */
export function useToolbarState() {
  const ctx = useContext(ToolbarCtx);
  const [mode = '', list = '', find = '', position = '', deleteLabel = '', listing = ''] = (ctx?.shape || '').split('|');
  const available = new Set(list ? list.split(',') : []);
  return {
    mode: (mode || null) as DocMode | null,
    has: (a: ToolAction) => available.has(a),
    run: (a: ToolAction) => { const fn = ctx?.active.current?.actions[a]; if (typeof fn === 'function') fn(); },
    canFind: find === 'f',
    position,
    deleteLabel: deleteLabel || 'Cancel document',
    listing: listing === 'l',
    find: (no: string) => ctx?.active.current?.findByNumber?.(no),
  };
}
