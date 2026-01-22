import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

const log = logger.create('FirecrawlAPI');

export interface ScrapeOptions {
  formats?: ('markdown' | 'html' | 'rawHtml' | 'links' | 'screenshot')[];
  onlyMainContent?: boolean;
  waitFor?: number;
}

export interface ScrapeResponse {
  success: boolean;
  data?: {
    markdown?: string;
    html?: string;
    links?: string[];
    screenshot?: string;
    metadata?: {
      title?: string;
      description?: string;
      language?: string;
      sourceURL?: string;
    };
  };
  error?: string;
}

export interface EnrichResponse {
  success: boolean;
  organizationId?: string;
  organizationName?: string;
  websiteUrl?: string;
  detectedWebsite?: string; // Auto-detected website URL
  emailSource?: string; // Where email was found: "homepage" | "/contact" | etc.
  extracted?: {
    emails: string[];
    phones: string[];
    addresses: string[];
    logoUrl: string | null;
    sectors: string[];
    description: string | null;
  };
  updatedFields?: string[];
  error?: string;
}

export interface BatchEnrichResult {
  success: number;
  failed: number;
  timedOut: number;
  websitesDetected: number; // NEW: count of auto-detected websites
  results: EnrichResponse[];
  failedOrganizations: { id: string; name: string; error: string }[];
}

/**
 * Firecrawl API client for web scraping and organization enrichment
 */
export const firecrawlApi = {
  /**
   * Scrape a single URL and extract content
   */
  async scrape(url: string, options?: ScrapeOptions): Promise<ScrapeResponse> {
    try {
      const { data, error } = await supabase.functions.invoke('firecrawl-scrape', {
        body: { 
          url, 
          formats: options?.formats || ['markdown'],
          onlyMainContent: options?.onlyMainContent ?? true,
          waitFor: options?.waitFor,
        },
      });

      if (error) {
        log.error('Firecrawl scrape error:', error);
        return { success: false, error: error.message };
      }

      return data;
    } catch (err) {
      log.error('Firecrawl scrape exception:', err);
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Unknown error' 
      };
    }
  },

  /**
   * Enrich an organization by scraping its website
   */
  async enrichOrganization(
    organizationId: string, 
    options?: { updateDatabase?: boolean; autoDetectWebsite?: boolean }
  ): Promise<EnrichResponse> {
    try {
      const { data, error } = await supabase.functions.invoke('firecrawl-enrich-organization', {
        body: { 
          organizationId,
          updateDatabase: options?.updateDatabase ?? true,
          autoDetectWebsite: options?.autoDetectWebsite ?? true,
        },
      });

      if (error) {
        log.error('Firecrawl enrich error:', error);
        return { success: false, organizationId, error: error.message };
      }

      return data;
    } catch (err) {
      log.error('Firecrawl enrich exception:', err);
      return { 
        success: false, 
        organizationId,
        error: err instanceof Error ? err.message : 'Unknown error' 
      };
    }
  },

  /**
   * Enrich organization by URL (without organization ID)
   */
  async enrichByUrl(
    websiteUrl: string,
    options?: { updateDatabase?: boolean }
  ): Promise<EnrichResponse> {
    try {
      const { data, error } = await supabase.functions.invoke('firecrawl-enrich-organization', {
        body: { 
          websiteUrl,
          updateDatabase: options?.updateDatabase ?? false,
        },
      });

      if (error) {
        log.error('Firecrawl enrich by URL error:', error);
        return { success: false, error: error.message };
      }

      return data;
    } catch (err) {
      log.error('Firecrawl enrich by URL exception:', err);
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Unknown error' 
      };
    }
  },

  /**
   * Batch enrich multiple organizations with detailed tracking
   */
  async batchEnrich(
    organizationIds: string[],
    options?: { 
      updateDatabase?: boolean;
      autoDetectWebsite?: boolean;
      onProgress?: (current: number, total: number, currentOrg?: string) => void;
      onResult?: (result: EnrichResponse) => void;
    }
  ): Promise<BatchEnrichResult> {
    const results: EnrichResponse[] = [];
    const failedOrganizations: { id: string; name: string; error: string }[] = [];
    let success = 0;
    let failed = 0;
    let timedOut = 0;
    let websitesDetected = 0;

    for (let i = 0; i < organizationIds.length; i++) {
      const orgId = organizationIds[i];
      let retryCount = 0;
      const maxRetries = 1;
      
      while (retryCount <= maxRetries) {
        try {
          const result = await this.enrichOrganization(orgId, { 
            updateDatabase: options?.updateDatabase ?? true,
            autoDetectWebsite: options?.autoDetectWebsite ?? true,
          });
          
          // Retry on timeout (only once)
          if (!result.success && result.error?.toLowerCase().includes('timeout') && retryCount < maxRetries) {
            log.log(`🔄 Retrying ${result.organizationName} after timeout...`);
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          
          results.push(result);
          options?.onResult?.(result);
          
          if (result.success) {
            success++;
            if (result.detectedWebsite) {
              websitesDetected++;
            }
          } else {
            failed++;
            
            if (result.error?.toLowerCase().includes('timeout')) {
              timedOut++;
            }
            
            failedOrganizations.push({
              id: orgId,
              name: result.organizationName || 'Onbekend',
              error: result.error || 'Unknown error',
            });
          }
          
          // Pass orgId for reliable matching
          options?.onProgress?.(i + 1, organizationIds.length, orgId);
          
          // Small delay to avoid rate limiting
          if (i < organizationIds.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          break; // Success, exit retry loop
        } catch (err) {
          failed++;
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          
          results.push({ 
            success: false, 
            organizationId: orgId,
            error: errorMsg,
          });
          
          failedOrganizations.push({
            id: orgId,
            name: 'Onbekend',
            error: errorMsg,
          });
          
          break; // Exit retry loop on exception
        }
      }
    }

    return { success, failed, timedOut, websitesDetected, results, failedOrganizations };
  },
};
