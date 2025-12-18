import { corsHeaders, handleCors, jsonResponse, errorResponse, createAdminClient } from "../_shared/core.ts";

interface EnrichRequest {
  organizationId?: string;
  websiteUrl?: string;
  updateDatabase?: boolean;
}

interface ExtractedData {
  emails: string[];
  phones: string[];
  addresses: string[];
  logoUrl: string | null;
  sectors: string[];
  description: string | null;
}

// Regex patterns for data extraction
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+31|0031|0)[\s.-]?(?:[1-9][0-9]|[1-9])[\s.-]?(?:[0-9][\s.-]?){6,8}/g;
const POSTCODE_REGEX = /\b[1-9][0-9]{3}\s?[A-Z]{2}\b/gi;

// Sector keywords
const SECTOR_KEYWORDS: Record<string, string[]> = {
  'GHZ': ['gehandicaptenzorg', 'verstandelijke beperking', 'lvb', 'gehandicapt', 'beperking', 'zorginstelling'],
  'GGZ': ['geestelijke gezondheidszorg', 'ggz', 'psychiatrie', 'psychische', 'mentale gezondheid'],
  'VVT': ['verpleeghuiszorg', 'thuiszorg', 'verzorgingshuis', 'ouderenzorg', 'vvt'],
  'Jeugdzorg': ['jeugdzorg', 'jeugdhulp', 'jongeren', 'kinderen', 'gezinnen'],
  'Ziekenhuis': ['ziekenhuis', 'kliniek', 'medisch centrum', 'academisch'],
};

function extractDataFromContent(markdown: string, html?: string): ExtractedData {
  const content = markdown || '';
  
  // Extract emails
  const emails = [...new Set(content.match(EMAIL_REGEX) || [])].filter(
    email => !email.includes('example') && !email.includes('test@')
  );
  
  // Extract phone numbers
  const phones = [...new Set(content.match(PHONE_REGEX) || [])].map(
    phone => phone.replace(/[\s.-]/g, '')
  );
  
  // Extract addresses (basic - look for postcodes)
  const postcodes = content.match(POSTCODE_REGEX) || [];
  const addresses: string[] = [];
  postcodes.forEach(pc => {
    // Try to find context around postcode
    const index = content.indexOf(pc);
    if (index > 0) {
      const contextBefore = content.substring(Math.max(0, index - 100), index);
      const contextAfter = content.substring(index, Math.min(content.length, index + 50));
      const addressMatch = (contextBefore + contextAfter).match(/[A-Za-z\s]+\d+[\s,]+\d{4}\s?[A-Z]{2}/);
      if (addressMatch) {
        addresses.push(addressMatch[0].trim());
      }
    }
  });
  
  // Extract logo URL from HTML
  let logoUrl: string | null = null;
  if (html) {
    // Look for og:image meta tag
    const ogImageMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
    if (ogImageMatch) {
      logoUrl = ogImageMatch[1];
    }
    // Fallback: look for logo in img tags
    if (!logoUrl) {
      const logoImgMatch = html.match(/<img[^>]+(?:class|id|alt)[^>]*logo[^>]*src="([^"]+)"/i) ||
                          html.match(/<img[^>]+src="([^"]+)"[^>]*(?:class|id|alt)[^>]*logo/i);
      if (logoImgMatch) {
        logoUrl = logoImgMatch[1];
      }
    }
  }
  
  // Detect sectors from content
  const contentLower = content.toLowerCase();
  const detectedSectors: string[] = [];
  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    if (keywords.some(kw => contentLower.includes(kw))) {
      detectedSectors.push(sector);
    }
  }
  
  // Extract description (first meaningful paragraph)
  const paragraphs = content.split(/\n\n+/).filter(p => p.length > 50 && p.length < 500);
  const description = paragraphs[0]?.trim() || null;
  
  return {
    emails: emails.slice(0, 5), // Limit to 5
    phones: phones.slice(0, 3), // Limit to 3
    addresses: [...new Set(addresses)].slice(0, 2),
    logoUrl,
    sectors: detectedSectors,
    description,
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { organizationId, websiteUrl, updateDatabase = true } = await req.json() as EnrichRequest;

    if (!organizationId && !websiteUrl) {
      return errorResponse('Either organizationId or websiteUrl is required', 400);
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return errorResponse('Firecrawl connector not configured. Please connect Firecrawl in Settings → Connectors.', 500);
    }

    const supabase = createAdminClient();
    let organization: any = null;
    let urlToScrape = websiteUrl;

    // If organizationId provided, fetch organization and its website
    if (organizationId) {
      const { data: org, error: orgError } = await supabase
        .from('client_organizations')
        .select('*')
        .eq('id', organizationId)
        .single();
      
      if (orgError || !org) {
        return errorResponse(`Organization not found: ${organizationId}`, 404);
      }
      
      organization = org;
      urlToScrape = org.website || websiteUrl;
      
      if (!urlToScrape) {
        return errorResponse('Organization has no website URL', 400);
      }
    }

    // Format URL
    let formattedUrl = urlToScrape!.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('🔥 Firecrawl enriching organization from:', formattedUrl);

    // Scrape website with multiple formats
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ['markdown', 'html'],
        onlyMainContent: false, // Get full page for contact info
        waitFor: 3000,
        timeout: 60000, // 60 second timeout for slow healthcare websites
      }),
    });

    const scrapeResult = await response.json();

    if (!response.ok) {
      console.error('❌ Firecrawl API error:', scrapeResult);
      return errorResponse(scrapeResult.error || `Scrape failed with status ${response.status}`, response.status);
    }

    const content = scrapeResult.data || scrapeResult;
    const markdown = content.markdown || '';
    const html = content.html || '';
    
    // Extract data from scraped content
    const extractedData = extractDataFromContent(markdown, html);
    
    console.log('📊 Extracted data:', {
      emails: extractedData.emails.length,
      phones: extractedData.phones.length,
      addresses: extractedData.addresses.length,
      logoUrl: !!extractedData.logoUrl,
      sectors: extractedData.sectors,
    });

    // Update database if requested and organization exists
    let updatedOrganization = organization;
    if (updateDatabase && organization) {
      const updates: Record<string, any> = {};
      
      // Only update if we found better data
      if (extractedData.emails.length > 0 && !organization.centrale_facturatie_email) {
        updates.centrale_facturatie_email = extractedData.emails[0];
      }
      
      if (extractedData.logoUrl && !organization.logo_url) {
        updates.logo_url = extractedData.logoUrl;
      }
      
      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        
        const { data: updated, error: updateError } = await supabase
          .from('client_organizations')
          .update(updates)
          .eq('id', organization.id)
          .select()
          .single();
        
        if (updateError) {
          console.error('❌ Failed to update organization:', updateError);
        } else {
          updatedOrganization = updated;
          console.log('✅ Updated organization with:', Object.keys(updates));
        }
      }
      
      // Store enrichment in knowledge base (select-then-upsert pattern)
      const knowledgeKey = `org_enrichment_${organization.id}`;
      const knowledgeValue = {
        organization_id: organization.id,
        organization_name: organization.name,
        website: formattedUrl,
        extracted_emails: extractedData.emails,
        extracted_phones: extractedData.phones,
        extracted_addresses: extractedData.addresses,
        detected_sectors: extractedData.sectors,
        logo_url: extractedData.logoUrl,
        description: extractedData.description,
        enriched_at: new Date().toISOString(),
      };
      
      // Check if knowledge item exists
      const { data: existingKb } = await supabase
        .from('ai_knowledge_base')
        .select('id')
        .eq('org_id', organization.org_id)
        .eq('category', 'org_profile')
        .eq('key', knowledgeKey)
        .maybeSingle();
      
      if (existingKb) {
        // Update existing
        const { error: updateKbError } = await supabase
          .from('ai_knowledge_base')
          .update({
            value: knowledgeValue,
            source_url: formattedUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingKb.id);
        
        if (updateKbError) {
          console.error('❌ Failed to update knowledge base:', updateKbError);
        }
      } else {
        // Insert new
        const { error: insertKbError } = await supabase
          .from('ai_knowledge_base')
          .insert({
            org_id: organization.org_id,
            category: 'org_profile',
            key: knowledgeKey,
            value: knowledgeValue,
            source: 'firecrawl',
            source_url: formattedUrl,
            confidence_score: 0.8,
            validation_status: 'auto_validated',
          });
        
        if (insertKbError) {
          console.error('❌ Failed to insert to knowledge base:', insertKbError);
        }
      }
    }

    return jsonResponse({
      success: true,
      organizationId: organization?.id,
      websiteUrl: formattedUrl,
      extracted: extractedData,
      updated: updatedOrganization,
      metadata: content.metadata,
    });
  } catch (error) {
    console.error('❌ Error in firecrawl-enrich-organization:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to enrich organization';
    return errorResponse(errorMessage, 500);
  }
});
