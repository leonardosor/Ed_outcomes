'use client';

import { useSyncExternalStore } from 'react';

export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'ed-outcomes-theme';
const MEDIA = '(prefers-color-scheme: dark)';

function read(): ResolvedTheme {
  const forced = document.documentElement.getAttribute('data-theme');
  if (forced === 'dark' || forced === 'light') return forced;
  return window.matchMedia(MEDIA).matches ? 'dark' : 'light';
}

function subscribe(cb: () => void): () => void {
  const mq = window.matchMedia(MEDIA);
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  mq.addEventListener('change', cb);
  return () => {
    obs.disconnect();
    mq.removeEventListener('change', cb);
  };
}

/** Current effective theme (forced attribute, else system preference). */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, read, () => 'light');
}

export function setTheme(theme: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage unavailable — theme still applies for this page view */
  }
}

/** Inline script for <head>: applies a saved theme before first paint. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export const MAP_STYLE: Record<ResolvedTheme, string> = {
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};
