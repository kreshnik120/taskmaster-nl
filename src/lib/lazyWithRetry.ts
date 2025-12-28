import { lazy, ComponentType } from 'react';
import { logger } from '@/lib/logger';

const log = logger.create('LazyWithRetry');

/**
 * Wrapper for React.lazy that handles chunk loading errors by automatically reloading
 * when a dynamically imported module fails to load (common after deployments)
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  componentImport: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await componentImport();
    } catch (error) {
      // Check if this is a chunk loading error
      if (
        error instanceof Error &&
        (error.message.includes('Failed to fetch dynamically imported module') ||
         error.message.includes('Loading chunk') ||
         error.message.includes('Loading CSS chunk'))
      ) {
        log.warn('🔄 Chunk loading failed, reloading page for latest version...');
        
        // Give user brief notice before reload
        window.location.reload();
        
        // Return empty component while reloading (won't actually render)
        return { default: (() => null) as unknown as T };
      }
      
      // Re-throw other errors
      throw error;
    }
  });
}
