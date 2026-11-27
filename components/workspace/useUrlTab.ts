'use client';

import { useEffect } from 'react';

/** Opens the tab named in ?tab= when the screen loads (the menu bar uses it to open a screen on one of its tabs). */
export function useUrlTab<T extends string>(allowed: readonly T[], setTab: (t: T) => void) {
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t && (allowed as readonly string[]).includes(t)) setTab(t as T);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
