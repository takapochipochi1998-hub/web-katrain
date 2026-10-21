import { useSyncExternalStore } from 'react';

/** Phone layouts: below the width where the tab bar moves to the side. */
const QUERY = '(max-width: 899px)';

const subscribe = (onChange: () => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};

const getSnapshot = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches;

export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
