import { useState, useEffect } from 'react';

export type BackgroundOption = 'default' | 'solid-light' | 'solid-dark' | 'gradient' | 'pattern';

const STORAGE_KEY = 'whatsapp-background';

export function useWhatsAppBackground() {
  const [background, setBackground] = useState<BackgroundOption>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(STORAGE_KEY) as BackgroundOption) || 'default';
    }
    return 'default';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, background);
  }, [background]);

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
