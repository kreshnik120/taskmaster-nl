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

interface EnrichResult {
  organizationId: string;
  organizationName: string;
  success: boolean;
  error?: string;
  extracted?: ExtractedData;
  updatedFields?: string[];
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

async function enrichSingleOrganization(
  supabase: any,
  apiKey: string,
  organization: any,
  formattedUrl: string,
  updateDatabase: boolean
): Promise<EnrichResult> {
  const result: EnrichResult = {
    organizationId: organization.id,
    organizationName: organization.name,
    success: false,
    updatedFields: [],
  };

  try {
    console.log(`🔥 Enriching ${organization.name} from: ${formattedUrl}`);
    
    // Scrape with timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ['markdown', 'html'],
        onlyMainContent: false,
        waitFor: 3000,
        timeout: 40000,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      result.error = errorData.error || `HTTP ${response.status}`;
      console.error(`❌ Firecrawl failed for ${organization.name}:`, result.error);
      return result;
    }

    const scrapeResult = await response.json();
    const content = scrapeResult.data || scrapeResult;
    const markdown = content.markdown || '';
    const html = content.html || '';
    
    if (!markdown && !html) {
      result.error = 'Empty scrape result';
      return result;
    }
    
    // Extract data
    const extractedData = extractDataFromContent(markdown, html);
    result.extracted = extractedData;
    
    console.log(`📊 ${organization.name}: ${extractedData.emails.length} emails, ${extractedData.phones.length} phones, sectors: ${extractedData.sectors.join(', ') || 'none'}`);

    // Update database if requested
    if (updateDatabase) {
      // 1. Update client_organizations (email, logo)
      const orgUpdates: Record<string, any> = {};
      
      if (extractedData.emails.length > 0 && !organization.centrale_facturatie_email) {
        orgUpdates.centrale_facturatie_email = extractedData.emails[0];
        result.updatedFields!.push('email');
      }
      
      if (extractedData.logoUrl && !organization.logo_url) {
        orgUpdates.logo_url = extractedData.logoUrl;
        result.updatedFields!.push('logo');
      }
      
      if (Object.keys(orgUpdates).length > 0) {
        orgUpdates.updated_at = new Date().toISOString();
        
        const { error: updateError } = await supabase
          .from('client_organizations')
          .update(orgUpdates)
          .eq('id', organization.id);
        
        if (updateError) {
          console.error(`❌ Failed to update ${organization.name}:`, updateError);
        }
      }
      
      // 2. Update first location's telefoon if missing
      if (extractedData.phones.length > 0) {
        const { data: locations } = await supabase
          .from('client_locations')
          .select('id, telefoon')
          .eq('client_org_id', organization.id)
          .is('telefoon', null)
          .limit(1);
        
        if (locations && locations.length > 0) {
          const { error: locUpdateError } = await supabase
            .from('client_locations')
            .update({ 
              telefoon: extractedData.phones[0],
              updated_at: new Date().toISOString(),
            })
            .eq('id', locations[0].id);
          
          if (!locUpdateError) {
            result.updatedFields!.push('telefoon');
            console.log(`✅ Updated location telefoon for ${organization.name}`);
          }
        }
      }
      
      // 3. Store enrichment in knowledge base
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
      
      const { data: existingKb } = await supabase
        .from('ai_knowledge_base')
        .select('id')
        .eq('org_id', organization.org_id)
        .eq('category', 'org_profile')
        .eq('key', knowledgeKey)
        .maybeSingle();
      
      if (existingKb) {
        await supabase
          .from('ai_knowledge_base')
          .update({
            value: knowledgeValue,
            source_url: formattedUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingKb.id);
      } else {
        await supabase
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
      }
    }

    result.success = true;
    console.log(`✅ ${organization.name} enriched successfully`);
    return result;
    
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      result.error = 'Timeout - website te traag';
    } else {
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }
    console.error(`❌ ${organization.name} failed:`, result.error);
    return result;
  }
}

Deno.serve(async (req) => {
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
    
    // Single organization enrichment
    if (organizationId) {
      const { data: org, error: orgError } = await supabase
        .from('client_organizations')
        .select('*')
        .eq('id', organizationId)
        .single();
      
      if (orgError || !org) {
        return errorResponse(`Organization not found: ${organizationId}`, 404);
      }
      
      let urlToScrape = org.website || websiteUrl;
      if (!urlToScrape) {
        return errorResponse('Organization has no website URL', 400);
      }
      
      // Format URL
      let formattedUrl = urlToScrape.trim();
      if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = `https://${formattedUrl}`;
      }

      const result = await enrichSingleOrganization(supabase, apiKey, org, formattedUrl, updateDatabase);
      
      return jsonResponse({
        success: result.success,
        organizationId: result.organizationId,
        organizationName: result.organizationName,
        websiteUrl: formattedUrl,
        extracted: result.extracted,
        updatedFields: result.updatedFields,
        error: result.error,
      });
    }
    
    // URL-only enrichment (no organization)
    if (websiteUrl) {
      let formattedUrl = websiteUrl.trim();
      if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = `https://${formattedUrl}`;
      }
      
      console.log('🔥 Firecrawl enriching URL:', formattedUrl);
      
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: formattedUrl,
          formats: ['markdown', 'html'],
          onlyMainContent: false,
          waitFor: 3000,
          timeout: 40000,
        }),
      });

      const scrapeResult = await response.json();
      
      if (!response.ok) {
        return errorResponse(scrapeResult.error || `Scrape failed`, response.status);
      }

      const content = scrapeResult.data || scrapeResult;
      const extractedData = extractDataFromContent(content.markdown || '', content.html || '');

      return jsonResponse({
        success: true,
        websiteUrl: formattedUrl,
        extracted: extractedData,
        metadata: content.metadata,
      });
    }

    return errorResponse('Invalid request', 400);
  } catch (error) {
    console.error('❌ Error in firecrawl-enrich-organization:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to enrich organization';
    return errorResponse(errorMessage, 500);
  }
});
