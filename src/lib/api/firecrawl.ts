import { supabase } from '@/integrations/supabase/client';

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
  extracted?: {
    emails: string[];
    phones: string[];
    addresses: string[];
    logoUrl: string | null;
    sectors: string[];
    description: string | null;
  };
  updatedFields?: string[];
  updated?: any;
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
        console.error('Firecrawl scrape error:', error);
        return { success: false, error: error.message };
      }

      return data;
    } catch (err) {
      console.error('Firecrawl scrape exception:', err);
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
        console.error('Firecrawl enrich error:', error);
        return { success: false, organizationId, error: error.message };
      }

      return data;
    } catch (err) {
      console.error('Firecrawl enrich exception:', err);
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
        console.error('Firecrawl enrich by URL error:', error);
        return { success: false, error: error.message };
      }

      return data;
    } catch (err) {
      console.error('Firecrawl enrich by URL exception:', err);
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
      
      try {
        const result = await this.enrichOrganization(orgId, { 
          updateDatabase: options?.updateDatabase ?? true,
          autoDetectWebsite: options?.autoDetectWebsite ?? true,
        });
        
        results.push(result);
        options?.onResult?.(result);
        
        if (result.success) {
          success++;
          // Track auto-detected websites
          if (result.detectedWebsite) {
            websitesDetected++;
          }
        } else {
          failed++;
          
          // Track timeout separately
          if (result.error?.toLowerCase().includes('timeout')) {
            timedOut++;
          }
          
          failedOrganizations.push({
            id: orgId,
            name: result.organizationName || 'Onbekend',
            error: result.error || 'Unknown error',
          });
        }
        
        options?.onProgress?.(i + 1, organizationIds.length, result.organizationName);
        
        // Small delay to avoid rate limiting
        if (i < organizationIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
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
      }
    }

    return { success, failed, timedOut, websitesDetected, results, failedOrganizations };
  },
};
