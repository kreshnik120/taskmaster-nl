/**
 * Centrale Logger Utility
 * 
 * Onderdrukt console.log/warn in productie, behalve errors.
 * Debug mode kan worden ingeschakeld via browser console: __enableDebug()
 */

const isDev = import.meta.env.DEV;

const getIsDebugMode = (): boolean => {
  try {
    return localStorage.getItem('lovable_debug') === 'true';
  } catch {
    return false;
  }
};

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const shouldLog = (level: LogLevel): boolean => {
  // Errors worden altijd gelogd
  if (level === 'error') return true;
  
  // In development: altijd loggen
  if (isDev) return true;
  
  // In productie: alleen loggen als debug mode aan staat
  return getIsDebugMode();
};

interface ScopedLogger {
  debug: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export const logger = {
  /**
   * Debug logging - alleen in development of debug mode
   */
  debug: (...args: unknown[]): void => {
    if (shouldLog('debug')) {
      console.log('[DEBUG]', ...args);
    }
  },
  
  /**
   * Standaard logging - alleen in development of debug mode
   */
  log: (...args: unknown[]): void => {
    if (shouldLog('info')) {
      console.log(...args);
    }
  },
  
  /**
   * Warning logging - alleen in development of debug mode
   */
  warn: (...args: unknown[]): void => {
    if (shouldLog('warn')) {
      console.warn(...args);
    }
  },
  
  /**
   * Error logging - ALTIJD actief
   */
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
  
  /**
   * Maak een scoped logger met prefix
   * @example const log = logger.create('ChatWidget');
   */
  create: (prefix: string): ScopedLogger => ({
    debug: (...args: unknown[]) => {
      if (shouldLog('debug')) {
        console.log(`[${prefix}]`, ...args);
      }
    },
    log: (...args: unknown[]) => {
      if (shouldLog('info')) {
        console.log(`[${prefix}]`, ...args);
      }
    },
    warn: (...args: unknown[]) => {
      if (shouldLog('warn')) {
        console.warn(`[${prefix}]`, ...args);
      }
    },
    error: (...args: unknown[]) => {
      console.error(`[${prefix}]`, ...args);
    },
  }),
};

/**
 * Schakel debug mode in (werkt ook in productie)
 */
export const enableDebugMode = (): void => {
  try {
    localStorage.setItem('lovable_debug', 'true');
    console.log('🔧 Debug mode enabled. Logs are now visible.');
  } catch {
    console.log('🔧 Could not enable debug mode (localStorage unavailable)');
  }
};

/**
 * Schakel debug mode uit
 */
export const disableDebugMode = (): void => {
  try {
    localStorage.removeItem('lovable_debug');
    console.log('🔧 Debug mode disabled.');
  } catch {
    console.log('🔧 Could not disable debug mode');
  }
};

// Expose voor browser console
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__enableDebug = enableDebugMode;
  (window as unknown as Record<string, unknown>).__disableDebug = disableDebugMode;
  (window as unknown as Record<string, unknown>).__isDebugMode = getIsDebugMode;
}

export default logger;
