import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

interface SmartLookupRequest {
  query: string;           // "CitoZorg" of "96202807"
  query_type?: 'naam' | 'kvk_nummer' | 'auto';
  force_refresh?: boolean;
  org_id: string;
}

interface SmartLookupResponse {
  source: 'knowledge_base' | 'kvk_cache' | 'kvk_api';
  data: any;
  freshness: {
    last_updated: string;
    expires_at: string;
    is_fresh: boolean;
  };
  cost_saved: number;
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // 🔒 SECURITY: Validate input with Zod schema
    const KvkLookupRequestSchema = z.object({
      query: z.string().min(1).max(500).refine(
        val => !/[<>{}\\]/.test(val),
        { message: "Query contains invalid characters" }
      ),
      query_type: z.enum(['naam', 'kvk_nummer', 'auto']).optional(),
      force_refresh: z.boolean().optional().default(false),
      org_id: z.string().uuid()
    });

    const rawBody = await req.json();
    const validation = KvkLookupRequestSchema.safeParse(rawBody);
    
    if (!validation.success) {
      const errors = validation.error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      console.error('❌ Validation failed:', errors);
      return errorResponse(`Validation failed: ${errors}`, 400);
    }
    
    const { query, force_refresh, org_id } = validation.data;

    const supabase = createAdminClient();

    console.log(`🔍 Smart KVK Lookup: "${query}" (org: ${org_id})`);

    // ========== TIER 1: KNOWLEDGE BASE CHECK ==========
    if (!force_refresh) {
      console.log('🔍 Tier 1: Checking knowledge base...');
      const { data: kbItems, error: kbError } = await supabase
        .from('ai_knowledge_base')
        .select('*')
        .eq('org_id', org_id)
        .or(`value->>naam.ilike.%${query}%,value->>kvk_nummer.eq.${query}`)
        .is('deleted_at', null)
        .order('last_kvk_check', { ascending: false, nullsFirst: false })
        .limit(1);

      if (kbError) {
        console.error('KB lookup error:', kbError);
      }

      if (kbItems && kbItems.length > 0) {
        const item = kbItems[0];
        const daysSinceCheck = item.last_kvk_check 
          ? Math.floor((Date.now() - new Date(item.last_kvk_check).getTime()) / (1000 * 60 * 60 * 24))
          : 999;
        
        if (daysSinceCheck <= (item.data_freshness_days || 90)) {
          console.log(`✅ Tier 1 HIT: Data is ${daysSinceCheck} days old (fresh)`);
          return new Response(JSON.stringify({
            source: 'knowledge_base',
            data: item.value,
            freshness: {
              last_updated: item.last_kvk_check,
              expires_at: new Date(new Date(item.last_kvk_check).getTime() + (item.data_freshness_days || 90) * 24 * 60 * 60 * 1000).toISOString(),
              is_fresh: true
            },
            cost_saved: 0.30
          } as SmartLookupResponse), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } else {
          console.log(`⚠️ Tier 1: Data gevonden maar oud (${daysSinceCheck} dagen), checking tier 2...`);
        }
      }
    }

    // ========== TIER 2: KVK CACHE CHECK ==========
    const kvkNummer = await extractKvKNumber(query, org_id, supabase);
    if (kvkNummer && !force_refresh) {
      console.log('🔍 Tier 2: Checking KVK cache...');
      const { data: cacheHit, error: cacheError } = await supabase
        .from('kvk_validation_cache')
        .select('*')
        .eq('kvk_nummer', kvkNummer)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (cacheError && cacheError.code !== 'PGRST116') {
        console.error('Cache lookup error:', cacheError);
      }

      if (cacheHit) {
        console.log('✅ Tier 2 HIT: Using cached KVK data');
        
        // Update hit count + last_accessed
        await supabase
          .from('kvk_validation_cache')
          .update({ 
            hit_count: cacheHit.hit_count + 1,
            last_accessed_at: new Date().toISOString()
          })
          .eq('id', cacheHit.id);
        
        return new Response(JSON.stringify({
          source: 'kvk_cache',
          data: normalizeKvKResponse(cacheHit.api_response),
          freshness: {
            last_updated: cacheHit.cached_at,
            expires_at: cacheHit.expires_at,
            is_fresh: true
          },
          cost_saved: 0.30
        } as SmartLookupResponse), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ========== TIER 3: KVK API CALL (LAATSTE REDMIDDEL) ==========
    if (!kvkNummer) {
      throw new Error('Kan KVK nummer niet bepalen voor API call');
    }
    
    console.log('🌐 Tier 3: Calling KVK API (€0.30 cost)...');
    const kvkApiKey = Deno.env.get('KVK_API_KEY');
    
    if (!kvkApiKey) {
      throw new Error('KVK_API_KEY not configured');
    }

    const kvkResponse = await fetch(`https://api.kvk.nl/api/v1/basisprofielen/${kvkNummer}`, {
      headers: { 'apiKey': kvkApiKey }
    });
    
    if (!kvkResponse.ok) {
      throw new Error(`KVK API error: ${kvkResponse.status} ${await kvkResponse.text()}`);
    }
    
    const kvkData = await kvkResponse.json();
    
    // Sla op in BEIDE caches:
    
    // 1. KVK Cache (secondary)
    await supabase
      .from('kvk_validation_cache')
      .upsert({
        kvk_nummer: kvkNummer,
        org_id,
        api_response: kvkData,
        cached_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        hit_count: 0
      });
    
    // 2. Knowledge Base (primary) - AUTO-CATEGORISEER ALLES
    const normalizedData = normalizeKvKResponse(kvkData);
    await autoStoreKvKData(normalizedData, org_id, kvkNummer, kvkData, supabase);
    
    console.log('✅ Tier 3: Data opgehaald en opgeslagen voor toekomstig gebruik');
    
    return new Response(JSON.stringify({
      source: 'kvk_api',
      data: normalizedData,
      freshness: {
        last_updated: new Date().toISOString(),
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        is_fresh: true
      },
      cost_saved: 0
    } as SmartLookupResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in kvk-smart-lookup:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage,
      details: 'Check function logs for more info'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// ========== HELPER FUNCTIONS ==========

async function extractKvKNumber(query: string, orgId: string, supabase: any): Promise<string | null> {
  // Direct KVK nummer check (8 cijfers)
  const kvkMatch = query.match(/\b(\d{8})\b/);
  if (kvkMatch) {
    return kvkMatch[1];
  }

  // Zoek in knowledge base
  const { data } = await supabase
    .from('ai_knowledge_base')
    .select('value')
    .eq('org_id', orgId)
    .ilike('value->>naam', `%${query}%`)
    .is('deleted_at', null)
    .limit(1)
    .single();

  if (data?.value?.kvk_nummer) {
    return data.value.kvk_nummer;
  }

  return null;
}

function normalizeKvKResponse(kvkData: any): any {
  return {
    naam: kvkData.naam || kvkData.handelsnaam?.[0] || '',
    kvk_nummer: kvkData.kvkNummer || '',
    bezoekadres: kvkData.adressen?.[0]?.volledigAdres || 
                 `${kvkData.adressen?.[0]?.straatnaam || ''} ${kvkData.adressen?.[0]?.huisnummer || ''}`.trim(),
    postcode: kvkData.adressen?.[0]?.postcode || '',
    plaats: kvkData.adressen?.[0]?.plaats || '',
    straatnaam: kvkData.adressen?.[0]?.straatnaam || '',
    huisnummer: kvkData.adressen?.[0]?.huisnummer || '',
    type_onderneming: kvkData.rechtsvorm || '',
    hoofdactiviteit: kvkData.hoofdactiviteiten?.[0] || '',
    totaal_werkzame_personen: kvkData.totaalWerkzamePersonen || 0,
    startdatum: kvkData.startdatum || null,
    telefoonnummer: kvkData.telefoonnummer || null,
    email: kvkData.emailadres || null,
    website: kvkData.websites?.[0] || null
  };
}

async function autoStoreKvKData(
  normalizedData: any, 
  orgId: string, 
  kvkNummer: string, 
  rawKvkData: any,
  supabase: any
): Promise<void> {
  console.log('🤖 Auto-categorizing KVK data into knowledge base...');
  
  const bedrijfsnaam = normalizedData.naam;
  const now = new Date().toISOString();
  
  const categoriesToStore = [
    {
      category: 'org_profile',
      key: `bedrijfsinformatie_${bedrijfsnaam.toLowerCase().replace(/\s+/g, '_')}_volledig`,
      value: {
        naam: normalizedData.naam,
        kvk_nummer: kvkNummer,
        bezoekadres: normalizedData.bezoekadres,
        postcode: normalizedData.postcode,
        plaats: normalizedData.plaats,
        type_onderneming: normalizedData.type_onderneming,
        hoofdactiviteit: normalizedData.hoofdactiviteit,
        totaal_werkzame_personen: normalizedData.totaal_werkzame_personen,
        startdatum: normalizedData.startdatum
      },
      data_freshness_days: 180 // KVK nummer wijzigt bijna nooit
    },
    {
      category: 'contactgegevens',
      key: `contact_${bedrijfsnaam.toLowerCase().replace(/\s+/g, '_')}`,
      value: {
        bedrijf: normalizedData.naam,
        telefoonnummer: normalizedData.telefoonnummer,
        email: normalizedData.email,
        website: normalizedData.website
      },
      data_freshness_days: 30 // Contact wijzigt vaker
    },
    {
      category: 'adresgegevens',
      key: `adres_${bedrijfsnaam.toLowerCase().replace(/\s+/g, '_')}`,
      value: {
        bedrijf: normalizedData.naam,
        bezoekadres: normalizedData.bezoekadres,
        postcode: normalizedData.postcode,
        plaats: normalizedData.plaats,
        straatnaam: normalizedData.straatnaam,
        huisnummer: normalizedData.huisnummer
      },
      data_freshness_days: 90 // Adres kan wijzigen bij verhuizing
    }
  ];
  
  for (const item of categoriesToStore) {
    await supabase.from('ai_knowledge_base').upsert({
      org_id: orgId,
      category: item.category,
      key: item.key,
      value: item.value,
      source_type: 'kvk_api',
      source: `KVK API - Basisprofiel ${kvkNummer}`,
      validation_status: 'verified',
      last_kvk_check: now,
      data_freshness_days: item.data_freshness_days,
      kvk_source_data: rawKvkData,
      confidence_score: 1.0
    }, {
      onConflict: 'org_id,key',
      ignoreDuplicates: false
    });
  }
  
  console.log(`✅ Auto-stored ${categoriesToStore.length} knowledge items from KVK`);
}
