import { corsHeaders, handleCors, jsonResponse, errorResponse, createAdminClient } from "../_shared/core.ts";

interface EnrichRequest {
  organizationId?: string;
  websiteUrl?: string;
  updateDatabase?: boolean;
  autoDetectWebsite?: boolean; // New: auto-detect website if missing
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
  detectedWebsite?: string;
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

// Known organization name to website mappings
const KNOWN_WEBSITES: Record<string, string> = {
  'amarant': 'https://www.amarant.nl',
  's heeren loo': 'https://www.sheerenloo.nl',
  'sheeren loo': 'https://www.sheerenloo.nl',
  'heerenloo': 'https://www.sheerenloo.nl',
  'pluryn': 'https://www.pluryn.nl',
  'pro persona': 'https://www.propersona.nl',
  'propersona': 'https://www.propersona.nl',
  'leger des heils': 'https://www.legerdesheils.nl',
  'humanitas': 'https://www.humanitas.nl',
  'lunet': 'https://www.lunetzorg.nl',
  'prisma': 'https://www.prismanet.nl',
  'swz': 'https://www.swzzorg.nl',
  'fokus': 'https://www.fokuswonen.nl',
  'siza': 'https://www.siza.nl',
  'driestroom': 'https://www.dedriestroom.nl',
  'cello': 'https://www.cello.nl',
  'dichterbij': 'https://www.dichterbij.nl',
  'philadelphia': 'https://www.philadelphia.nl',
  'cordaan': 'https://www.cordaan.nl',
  'ons tweede thuis': 'https://www.onstweedethuis.nl',
  'gemiva': 'https://www.gemiva-svg.nl',
  'esdege reigersdaal': 'https://www.esdege-reigersdaal.nl',
  'abrona': 'https://www.abrona.nl',
  'middin': 'https://www.middin.nl',
  'reinaerde': 'https://www.reinaerde.nl',
  'trajectum': 'https://www.trajectum.nl',
};

/**
 * Try to detect/validate a website URL for an organization
 */
async function detectWebsiteUrl(orgName: string): Promise<string | null> {
  // Clean up organization name
  const cleanName = orgName
    .toLowerCase()
    .replace(/stichting\s+/gi, '')
    .replace(/zorg\s*b\.?v\.?/gi, '')
    .replace(/b\.?v\.?/gi, '')
    .replace(/[^a-z0-9\s]/gi, '')
    .trim();
  
  console.log(`🔍 Detecting website for: "${orgName}" (cleaned: "${cleanName}")`);
  
  // 1. Check known mappings first
  for (const [key, url] of Object.entries(KNOWN_WEBSITES)) {
    if (cleanName.includes(key) || key.includes(cleanName.split(' ')[0])) {
      console.log(`✅ Found known website: ${url}`);
      return url;
    }
  }
  
  // 2. Generate potential URLs to try
  const nameParts = cleanName.split(/\s+/).filter(p => p.length > 2);
  const primaryName = nameParts[0] || cleanName.replace(/\s+/g, '');
  
  const potentialUrls = [
    `https://www.${primaryName}.nl`,
    `https://${primaryName}.nl`,
    `https://www.${primaryName}zorg.nl`,
    `https://www.${cleanName.replace(/\s+/g, '')}.nl`,
  ];
  
  // 3. Try each URL with a HEAD request
  for (const url of potentialUrls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok || response.status === 301 || response.status === 302) {
        console.log(`✅ Validated website: ${url} (status: ${response.status})`);
        return url;
      }
    } catch (e) {
      // URL doesn't work, try next
    }
  }
  
  console.log(`❌ No website found for: ${orgName}`);
  return null;
}

// Blacklist patterns for bad descriptions (cookies, navigation, etc.)
const DESCRIPTION_BLACKLIST = [
  /cookie/i,
  /accepteren/i,
  /privacy.*beleid/i,
  /alle rechten voorbehouden/i,
  /copyright/i,
  /navigatie/i,
  /hoofdnavigatie/i,
  /hoofdinhoud/i,
  /menu/i,
  /inloggen/i,
  /zoeken/i,
  /home\s*\|/i,
  /^\s*[\|\-•]\s*/,
  /skip to/i,
  /ga naar/i,
  /naar\s+(hoofd|de|het|een|content)/i,  // "Naar hoofdinhoud", "Naar de website"
  /naar\s+\w+\s*\]/i,                     // "Naar hoofdnavigatiemenu]"
  /javascript/i,
  /404/i,
  /pagina niet gevonden/i,
  /close\s*menu/i,
  /for\s*sale/i,
  /get\s*this\s*domain/i,
  /domain.*is.*for.*sale/i,
  /\]\s*\[/,                               // Multiple markdown links together "][" 
  /\]\s*\(/,                               // Incomplete markdown link cleanup "](..."
  /^\s*\[/,                                // Starts with markdown link
];

// Keywords that indicate good "about us" content
const ABOUT_KEYWORDS = [
  'over ons', 'wie zijn wij', 'onze missie', 'onze visie', 
  'wij bieden', 'wij ondersteunen', 'onze organisatie',
  'specialiseren', 'zorgorganisatie', 'hulpverlening',
  'cliënten', 'bewoners', 'medewerkers',
];

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
  
  // IMPROVED: Extract description with quality filtering
  const description = extractQualityDescription(content);
  
  return {
    emails: emails.slice(0, 5), // Limit to 5
    phones: phones.slice(0, 3), // Limit to 3
    addresses: [...new Set(addresses)].slice(0, 2),
    logoUrl,
    sectors: detectedSectors,
    description,
  };
}

/**
 * Check if text still contains garbage patterns after cleaning
 */
function containsGarbagePatterns(text: string): boolean {
  const garbagePatterns = [
    /\[[^\]]+\]\([^)]+\)/,           // Markdown links [text](url)
    /\]\s*\(/,                        // Broken markdown link ](
    /https?:\/\/[^\s]+/,             // Raw URLs
    /naar.*navigatie/i,              // Navigation patterns
    /naar.*inhoud/i,
    /naar.*menu/i,
    /cookie/i,
    /\]\s*\[/,                        // Multiple markdown patterns ][
  ];
  return garbagePatterns.some(p => p.test(text));
}

/**
 * Extract a quality description by filtering out cookie banners, navigation, etc.
 */
function extractQualityDescription(content: string): string | null {
  // Clean markdown: remove links, images, headers symbols - multiple passes
  let cleanContent = content
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')   // [text](url) -> text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')       // Remove images
    .replace(/\[[^\]]*\]\s*\([^)]*\)/g, '')     // More aggressive link removal
    .replace(/\]\s*\([^)]*\)/g, '')             // Remove orphan ](url) patterns
    .replace(/\[[^\]]*\]/g, '')                 // Remove remaining [text] 
    .replace(/^#+\s*/gm, '')                    // Remove header markers
    .replace(/\*\*([^*]+)\*\*/g, '$1')          // Remove bold
    .replace(/\*([^*]+)\*/g, '$1')              // Remove italic
    .replace(/`[^`]+`/g, '')                    // Remove code
    .replace(/https?:\/\/[^\s]+/g, '')          // Remove raw URLs
    .trim();
  
  // Split into paragraphs
  const paragraphs = cleanContent.split(/\n\n+/);
  
  // Score and filter paragraphs
  const scoredParagraphs = paragraphs
    .map(p => p.trim())
    .filter(p => {
      // Minimum length
      if (p.length < 80) return false;
      // Maximum length  
      if (p.length > 600) return false;
      // Must have at least 10 words
      if (p.split(/\s+/).length < 10) return false;
      // Check blacklist
      if (DESCRIPTION_BLACKLIST.some(pattern => pattern.test(p))) return false;
      // Double-check for garbage patterns that survived cleaning
      if (containsGarbagePatterns(p)) return false;
      // Should not be just a list of links/items
      if ((p.match(/\|/g) || []).length > 3) return false;
      if ((p.match(/•/g) || []).length > 3) return false;
      // Should not have too many brackets (indicates markdown failures)
      if ((p.match(/[\[\]]/g) || []).length > 2) return false;
      return true;
    })
    .map(p => {
      let score = 0;
      const pLower = p.toLowerCase();
      
      // Boost for "about us" keywords
      ABOUT_KEYWORDS.forEach(kw => {
        if (pLower.includes(kw)) score += 10;
      });
      
      // Boost for sector keywords
      Object.values(SECTOR_KEYWORDS).flat().forEach(kw => {
        if (pLower.includes(kw)) score += 5;
      });
      
      // Penalize short paragraphs
      if (p.length < 120) score -= 5;
      
      // Boost medium-length paragraphs (ideal for descriptions)
      if (p.length >= 150 && p.length <= 400) score += 10;
      
      // Penalize paragraphs with too many special characters
      const specialChars = (p.match(/[|•→←↑↓\[\]]/g) || []).length;
      score -= specialChars * 2;
      
      return { text: p, score };
    })
    .sort((a, b) => b.score - a.score);
  
  // Return best paragraph if it has a positive score
  const best = scoredParagraphs[0];
  if (best && best.score > 0) {
    console.log(`📝 Best description (score ${best.score}): "${best.text.substring(0, 60)}..."`);
    return best.text;
  }
  
  console.log(`⚠️ No quality description found (${scoredParagraphs.length} candidates)`);
  return null;
}

async function enrichSingleOrganization(
  supabase: any,
  apiKey: string,
  organization: any,
  formattedUrl: string,
  updateDatabase: boolean,
  autoDetectWebsite: boolean = true
): Promise<EnrichResult> {
  const result: EnrichResult = {
    organizationId: organization.id,
    organizationName: organization.name,
    success: false,
    updatedFields: [],
  };

  // Auto-detect website if none provided
  let urlToScrape = formattedUrl;
  if (!urlToScrape && autoDetectWebsite) {
    const detectedUrl = await detectWebsiteUrl(organization.name);
    if (detectedUrl) {
      urlToScrape = detectedUrl;
      result.detectedWebsite = detectedUrl;
      
      // Update organization with detected website
      if (updateDatabase) {
        const { error: websiteUpdateError } = await supabase
          .from('client_organizations')
          .update({ 
            website: detectedUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', organization.id);
        
        if (!websiteUpdateError) {
          result.updatedFields!.push('website');
          console.log(`✅ Updated website for ${organization.name}: ${detectedUrl}`);
        }
      }
    } else {
      result.error = 'Geen website gevonden';
      return result;
    }
  }

  if (!urlToScrape) {
    result.error = 'Geen website URL beschikbaar';
    return result;
  }

  try {
    console.log(`🔥 Enriching ${organization.name} from: ${urlToScrape}`);
    
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
        url: urlToScrape,
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
      // 1. Update client_organizations (email, logo, website)
      const orgUpdates: Record<string, any> = {};
      
      if (extractedData.emails.length > 0 && !organization.centrale_facturatie_email) {
        orgUpdates.centrale_facturatie_email = extractedData.emails[0];
        result.updatedFields!.push('email');
      }
      
      if (extractedData.logoUrl && !organization.logo_url) {
        orgUpdates.logo_url = extractedData.logoUrl;
        result.updatedFields!.push('logo');
      }
      
      // Store website if we detected it
      if (result.detectedWebsite && !organization.website) {
        orgUpdates.website = result.detectedWebsite;
      }
      
      if (Object.keys(orgUpdates).length > 0) {
        orgUpdates.updated_at = new Date().toISOString();
        
        const { error: updateError } = await supabase
          .from('client_organizations')
          .update(orgUpdates)
          .eq('id', organization.id);
        
        if (updateError) {
          console.error(`❌ Failed to update ${organization.name}:`, updateError);
        } else {
          console.log(`✅ Updated org fields: ${Object.keys(orgUpdates).join(', ')}`);
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
      
      // 3. Store enrichment in ai_knowledge_base (FIXED: use correct org_id)
      const knowledgeKey = `org_enrichment_${organization.id}`;
      const knowledgeValue = {
        organization_id: organization.id,
        organization_name: organization.name,
        website: urlToScrape,
        extracted_emails: extractedData.emails,
        extracted_phones: extractedData.phones,
        extracted_addresses: extractedData.addresses,
        detected_sectors: extractedData.sectors,
        logo_url: extractedData.logoUrl,
        description: extractedData.description,
        enriched_at: new Date().toISOString(),
      };
      
      // FIXED: Use the bureau org_id (ABCzorg/CitoZorg), not the client org's own id
      const bureauOrgId = organization.org_id;
      
      console.log(`💾 Saving to ai_knowledge_base with org_id: ${bureauOrgId}, key: ${knowledgeKey}`);
      
      const { data: existingKb, error: kbSelectError } = await supabase
        .from('ai_knowledge_base')
        .select('id')
        .eq('org_id', bureauOrgId)
        .eq('category', 'org_profile')
        .eq('key', knowledgeKey)
        .maybeSingle();
      
      if (kbSelectError) {
        console.error(`❌ KB select error:`, kbSelectError);
      }
      
      if (existingKb) {
        const { error: kbUpdateError } = await supabase
          .from('ai_knowledge_base')
          .update({
            value: knowledgeValue,
            source_url: urlToScrape,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingKb.id);
        
        if (kbUpdateError) {
          console.error(`❌ KB update error:`, kbUpdateError);
        } else {
          result.updatedFields!.push('knowledge_base');
          console.log(`✅ Updated ai_knowledge_base for ${organization.name}`);
        }
      } else {
        const { error: kbInsertError } = await supabase
          .from('ai_knowledge_base')
          .insert({
            org_id: bureauOrgId,
            category: 'org_profile',
            key: knowledgeKey,
            value: knowledgeValue,
            source: 'firecrawl',
            source_url: urlToScrape,
            confidence_score: 0.8,
            validation_status: 'auto_validated',
          });
        
        if (kbInsertError) {
          console.error(`❌ KB insert error:`, kbInsertError);
        } else {
          result.updatedFields!.push('knowledge_base');
          console.log(`✅ Inserted ai_knowledge_base for ${organization.name}`);
        }
      }
    }

    result.success = true;
    console.log(`✅ ${organization.name} enriched successfully. Updated: ${result.updatedFields?.join(', ') || 'none'}`);
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
    const { organizationId, websiteUrl, updateDatabase = true, autoDetectWebsite = true } = await req.json() as EnrichRequest;

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
      
      // Format URL if provided
      if (urlToScrape) {
        urlToScrape = urlToScrape.trim();
        if (!urlToScrape.startsWith('http://') && !urlToScrape.startsWith('https://')) {
          urlToScrape = `https://${urlToScrape}`;
        }
      }

      // Pass autoDetectWebsite flag - function will auto-detect if no URL
      const result = await enrichSingleOrganization(
        supabase, 
        apiKey, 
        org, 
        urlToScrape || '', 
        updateDatabase,
        autoDetectWebsite
      );
      
      return jsonResponse({
        success: result.success,
        organizationId: result.organizationId,
        organizationName: result.organizationName,
        websiteUrl: urlToScrape || result.detectedWebsite,
        detectedWebsite: result.detectedWebsite,
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
