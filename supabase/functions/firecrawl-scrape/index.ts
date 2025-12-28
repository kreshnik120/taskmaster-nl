import { corsHeaders, handleCors, jsonResponse, errorResponse, createAdminClient } from "../_shared/core.ts";
import { isUrlAllowedForScraping } from "../_shared/healthcare-mappings.ts";

interface ScrapeRequest {
  url: string;
  formats?: string[];
  onlyMainContent?: boolean;
  waitFor?: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { url, formats = ['markdown'], onlyMainContent = true, waitFor } = await req.json() as ScrapeRequest;

    if (!url) {
      return errorResponse('URL is required', 400);
    }

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    // === SSRF PROTECTION ===
    const urlValidation = isUrlAllowedForScraping(formattedUrl, { 
      allowAnyDutchDomain: true,
      strictMode: false 
    });

    if (!urlValidation.allowed) {
      console.warn(`🚫 SSRF Protection: Blocked scrape attempt for ${formattedUrl} - ${urlValidation.reason}`);
      
      // Log security event
      try {
        const supabase = createAdminClient();
        await supabase.from('system_events').insert({
          event_type: 'security_alert',
          severity: 'high',
          title: '🚫 SSRF Attempt Blocked - Firecrawl Scrape',
          details: {
            blocked_url: formattedUrl,
            original_url: url,
            reason: urlValidation.reason,
            source_ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
            user_agent: req.headers.get('user-agent'),
          },
        });
      } catch (logError) {
        console.error('Failed to log security event:', logError);
      }
      
      return errorResponse(`URL niet toegestaan: ${urlValidation.reason}`, 403);
    }

    // Use sanitized URL if provided
    formattedUrl = urlValidation.sanitizedUrl || formattedUrl;

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return errorResponse('Firecrawl connector not configured. Please connect Firecrawl in Settings → Connectors.', 500);
    }

    console.log('🔥 Firecrawl scraping URL:', formattedUrl);

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats,
        onlyMainContent,
        waitFor,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Firecrawl API error:', data);
      return errorResponse(data.error || `Request failed with status ${response.status}`, response.status);
    }

    console.log('✅ Firecrawl scrape successful for:', formattedUrl);
    
    return jsonResponse({
      success: true,
      data: data.data || data,
      metadata: data.data?.metadata || data.metadata,
    });
  } catch (error) {
    console.error('❌ Error in firecrawl-scrape:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to scrape';
    return errorResponse(errorMessage, 500);
  }
});
