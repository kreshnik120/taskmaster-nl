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
  websiteUrl?: string;
  extracted?: {
    emails: string[];
    phones: string[];
    addresses: string[];
    logoUrl: string | null;
    sectors: string[];
    description: string | null;
  };
  updated?: any;
  error?: string;
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
    options?: { updateDatabase?: boolean }
  ): Promise<EnrichResponse> {
    try {
      const { data, error } = await supabase.functions.invoke('firecrawl-enrich-organization', {
        body: { 
          organizationId,
          updateDatabase: options?.updateDatabase ?? true,
        },
      });

      if (error) {
        console.error('Firecrawl enrich error:', error);
        return { success: false, error: error.message };
      }

      return data;
    } catch (err) {
      console.error('Firecrawl enrich exception:', err);
      return { 
        success: false, 
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
   * Batch enrich multiple organizations
   */
  async batchEnrich(
    organizationIds: string[],
    options?: { updateDatabase?: boolean; onProgress?: (current: number, total: number) => void }
  ): Promise<{ success: number; failed: number; results: EnrichResponse[] }> {
    const results: EnrichResponse[] = [];
    let success = 0;
    let failed = 0;

    for (let i = 0; i < organizationIds.length; i++) {
      const orgId = organizationIds[i];
      
      try {
        const result = await this.enrichOrganization(orgId, { 
          updateDatabase: options?.updateDatabase ?? true 
        });
        
        results.push(result);
        
        if (result.success) {
          success++;
        } else {
          failed++;
        }
        
        options?.onProgress?.(i + 1, organizationIds.length);
        
        // Small delay to avoid rate limiting
        if (i < organizationIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        failed++;
        results.push({ 
          success: false, 
          organizationId: orgId,
          error: err instanceof Error ? err.message : 'Unknown error' 
        });
      }
    }

    return { success, failed, results };
  },
};
