import { useState, useEffect, useCallback } from 'react';

export type BackgroundOption = 'default' | 'solid-light' | 'solid-dark' | 'gradient' | 'pattern';

const STORAGE_KEY = 'whatsapp-background';
const SYNC_EVENT = 'whatsapp-background-change';

export function useWhatsAppBackground() {
  const [background, setBackgroundState] = useState<BackgroundOption>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(STORAGE_KEY) as BackgroundOption) || 'default';
    }
    return 'default';
  });

  // Wrapper function that updates localStorage AND dispatches sync event
  const setBackground = useCallback((newBackground: BackgroundOption) => {
    setBackgroundState(newBackground);
    localStorage.setItem(STORAGE_KEY, newBackground);
    // Dispatch custom event for same-tab synchronization
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: newBackground }));
  }, []);

  // Listen for changes from other hook instances
  useEffect(() => {
    const handleSync = (event: CustomEvent<BackgroundOption>) => {
      setBackgroundState(event.detail);
    };

    window.addEventListener(SYNC_EVENT, handleSync as EventListener);
    return () => {
      window.removeEventListener(SYNC_EVENT, handleSync as EventListener);
    };
  }, []);

  return { background, setBackground };
}

// Background class mappings for use in components
export const backgroundClasses: Record<BackgroundOption, string> = {
  'default': 'bg-[#e5ddd5] dark:bg-slate-900',
  'solid-light': 'bg-gray-100 dark:bg-slate-900',
  'solid-dark': 'bg-gray-300 dark:bg-slate-800',
  'gradient': 'bg-gradient-to-b from-gray-100 to-gray-200 dark:from-slate-900 dark:to-slate-800',
  'pattern': 'bg-[#e5ddd5] dark:bg-slate-900 bg-chat-pattern',
};
