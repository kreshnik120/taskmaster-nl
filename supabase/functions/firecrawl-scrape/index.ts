import { corsHeaders, handleCors, jsonResponse, errorResponse } from "../_shared/core.ts";

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

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return errorResponse('Firecrawl connector not configured. Please connect Firecrawl in Settings → Connectors.', 500);
    }

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
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
