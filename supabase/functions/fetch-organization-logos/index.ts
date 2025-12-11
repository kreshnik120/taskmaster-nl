import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createAdminClient();

    const { organizationId, fetchAll, includeNameLookup } = await req.json();

    console.log(`[fetch-organization-logos] Starting - organizationId: ${organizationId}, fetchAll: ${fetchAll}, includeNameLookup: ${includeNameLookup}`);

    // Get organizations to process - include those without website if name lookup is enabled
    let query = supabase
      .from('client_organizations')
      .select('id, name, website, logo_url');

    if (organizationId) {
      query = query.eq('id', organizationId);
    } else if (!fetchAll) {
      // Only fetch for orgs without logos
      query = query.is('logo_url', null);
    }

    // If not doing name lookup, only get orgs with websites
    if (!includeNameLookup) {
      query = query.not('website', 'is', null);
    }

    const { data: organizations, error: orgError } = await query.limit(100);

    if (orgError) {
      console.error('[fetch-organization-logos] Error fetching organizations:', orgError);
      throw orgError;
    }

    console.log(`[fetch-organization-logos] Found ${organizations?.length || 0} organizations to process`);

    const results = {
      processed: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      details: [] as Array<{ name: string; status: string; error?: string }>
    };

    for (const org of organizations || []) {
      results.processed++;

      try {
        let domain: string | null = null;
        let websiteUrl: string | null = null;

        // Try to get domain from website URL
        if (org.website) {
          let tempUrl = org.website.trim();
          if (!tempUrl.startsWith('http://') && !tempUrl.startsWith('https://')) {
            tempUrl = 'https://' + tempUrl;
          }
          websiteUrl = tempUrl;
          try {
            domain = new URL(tempUrl).hostname;
          } catch {
            console.log(`[fetch-organization-logos] Invalid URL for ${org.name}: ${tempUrl}`);
          }
        }

        // If no domain from website, try name-based lookup
        if (!domain && includeNameLookup) {
          // Generate potential domain from organization name
          const cleanName = org.name
            .toLowerCase()
            .replace(/stichting\s*/gi, '')
            .replace(/[''`]/g, '')
            .replace(/\s+/g, '')
            .replace(/[^a-z0-9]/g, '');
          
          // Try common Dutch healthcare organization domain patterns
          const potentialDomains = [
            `${cleanName}.nl`,
            `www.${cleanName}.nl`,
          ];
          
          console.log(`[fetch-organization-logos] Name-based lookup for ${org.name} - trying: ${potentialDomains.join(', ')}`);
          domain = potentialDomains[0];
          websiteUrl = `https://${domain}`;
        }

        if (!domain) {
          results.skipped++;
          results.details.push({ name: org.name, status: 'skipped', error: 'No website URL and name lookup disabled' });
          continue;
        }

        console.log(`[fetch-organization-logos] Processing ${org.name} - domain: ${domain}`);

        // Try multiple logo sources in order of preference
        const logoSources = [
          // Clearbit Logo API (high quality, best for organizations)
          `https://logo.clearbit.com/${domain}`,
          // Google Favicon service (most reliable fallback)
          `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
          // DuckDuckGo favicon service
          `https://icons.duckduckgo.com/ip3/${domain}.ico`,
          // Direct favicon
          `${websiteUrl}/favicon.ico`,
        ];

        let logoBlob: Blob | null = null;
        let contentType = 'image/png';
        let sourceUsed = '';

        for (const source of logoSources) {
          try {
            console.log(`[fetch-organization-logos] Trying source: ${source}`);
            
            const response = await fetch(source, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; LogoFetcher/1.0)',
              },
            });

            if (response.ok) {
              const blob = await response.blob();
              
              // Check if we got a valid image (not empty or error page)
              if (blob.size > 100 && blob.type.startsWith('image/')) {
                logoBlob = blob;
                contentType = blob.type || 'image/png';
                sourceUsed = source;
                console.log(`[fetch-organization-logos] Success from ${source} - size: ${blob.size}, type: ${contentType}`);
                break;
              }
            }
          } catch (fetchError) {
            console.log(`[fetch-organization-logos] Failed to fetch from ${source}:`, fetchError);
          }
        }

        if (!logoBlob) {
          results.failed++;
          results.details.push({ name: org.name, status: 'failed', error: 'No valid logo found from any source' });
          continue;
        }

        // Determine file extension
        const ext = contentType.includes('png') ? 'png' : 
                    contentType.includes('svg') ? 'svg' :
                    contentType.includes('ico') ? 'ico' : 'jpg';

        const fileName = `${org.id}.${ext}`;

        // Upload to Supabase Storage
        const arrayBuffer = await logoBlob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        const { error: uploadError } = await supabase.storage
          .from('organization-logos')
          .upload(fileName, uint8Array, {
            contentType,
            upsert: true,
          });

        if (uploadError) {
          console.error(`[fetch-organization-logos] Upload error for ${org.name}:`, uploadError);
          results.failed++;
          results.details.push({ name: org.name, status: 'failed', error: uploadError.message });
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('organization-logos')
          .getPublicUrl(fileName);

        // Update organization record
        const { error: updateError } = await supabase
          .from('client_organizations')
          .update({ logo_url: urlData.publicUrl })
          .eq('id', org.id);

        if (updateError) {
          console.error(`[fetch-organization-logos] Update error for ${org.name}:`, updateError);
          results.failed++;
          results.details.push({ name: org.name, status: 'failed', error: updateError.message });
          continue;
        }

        results.success++;
        results.details.push({ name: org.name, status: 'success' });
        console.log(`[fetch-organization-logos] Successfully processed ${org.name} from ${sourceUsed}`);

      } catch (orgError) {
        console.error(`[fetch-organization-logos] Error processing ${org.name}:`, orgError);
        results.failed++;
        results.details.push({ name: org.name, status: 'failed', error: String(orgError) });
      }
    }

    console.log(`[fetch-organization-logos] Complete - processed: ${results.processed}, success: ${results.success}, failed: ${results.failed}`);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[fetch-organization-logos] Fatal error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
