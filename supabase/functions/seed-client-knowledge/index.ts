import { corsHeaders, handleCors, createAnonClient, jsonResponse, errorResponse } from '../_shared/core.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return errorResponse('Authenticatie vereist', 401);
    }

    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    // Use anon client with user's auth for RLS
    const supabaseClient = createAnonClient(authHeader);

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(accessToken);
    
    if (userError || !user) {
      console.error('Auth error:', userError);
      return errorResponse('Authenticatie gefaald', 401);
    }

    console.log('User authenticated:', user.id);

    // Get user's org_id
    const { data: userOrg } = await supabaseClient
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();
    
    if (!userOrg) {
      return errorResponse('Geen organisatie gevonden', 400);
    }

    const userOrgId = userOrg.org_id;

    // Fetch all sublocations with hierarchy
    const { data: sublocations, error: sublocationsError } = await supabaseClient
      .from('client_sublocations')
      .select(`
        id, naam, sector, doelgroep, gezochte_functies, plaats, is_active,
        location:client_locations!inner(
          id, naam,
          organization:client_organizations!inner(id, name, org_id)
        )
      `)
      .eq('is_active', true);

    if (sublocationsError) {
      console.error('Error fetching sublocations:', sublocationsError);
      throw sublocationsError;
    }

    // Map sublocations to client format for knowledge base
    const clients = (sublocations || []).map((sub: any) => ({
      id: sub.id,
      name: sub.naam,
      company: sub.location?.organization?.name || '',
      sector: sub.sector,
      doelgroep: sub.doelgroep,
      gezochte_functies: sub.gezochte_functies,
      plaats: sub.plaats,
      org_id: sub.location?.organization?.org_id,
      location_name: sub.location?.naam
    }));

    console.log(`Found ${clients?.length || 0} werklocaties to process`);

    let seedCount = 0;
    const errors: string[] = [];
    const upsertedIds: string[] = []; // Track nieuwe/updated IDs voor embedding generation

    // Process each client and add to knowledge base
    for (const client of clients || []) {
      try {
        // Create a comprehensive knowledge entry for this sublocation (werklocatie)
        const clientKnowledge = {
          id: client.id,
          name: client.name,
          company: client.company,
          sector: client.sector,
          doelgroep: client.doelgroep,
          gezochte_functies: client.gezochte_functies,
          plaats: client.plaats,
          location_name: client.location_name,
        };

        // Insert into knowledge base
        const { data: inserted, error: insertError } = await supabaseClient
          .from('ai_knowledge_base')
          .upsert({
            user_id: user.id,
            org_id: userOrgId,
            category: 'business_rule',
            key: `client_${client.company.toLowerCase().replace(/\s+/g, '_')}`,
            value: clientKnowledge,
            confidence_score: 1.0,
            source: 'client_database',
            usage_count: 0,
            last_used_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,org_id,category,key'
          })
          .select('id')
          .single();

        if (insertError) {
          console.error(`Error inserting client ${client.company}:`, insertError);
          errors.push(`${client.company}: ${insertError.message}`);
        } else {
          seedCount++;
          if (inserted?.id) upsertedIds.push(inserted.id);
          console.log(`✓ Seeded client: ${client.company}`);
        }
      } catch (err) {
        console.error(`Error processing client ${client.company}:`, err);
        errors.push(`${client.company}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Also create a summary knowledge entry with all clients
    if (clients && clients.length > 0) {
      try {
        const { data: summary } = await supabaseClient
          .from('ai_knowledge_base')
          .upsert({
            user_id: user.id,
            org_id: userOrgId,
            category: 'business_rule',
            key: 'all_clients_summary',
            value: {
              total_werklocaties: clients.length,
              werklocaties: clients.map(c => ({
                company: c.company,
                name: c.name,
                sector: c.sector,
                id: c.id
              }))
            },
            confidence_score: 1.0,
            source: 'client_database',
            usage_count: 0,
            last_used_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,org_id,category,key'
          })
          .select('id')
          .single();
        
        if (summary?.id) upsertedIds.push(summary.id);
        console.log('✓ Created all_clients_summary');
      } catch (err) {
        console.error('Error creating summary:', err);
      }
    }

    // ✅ STAP 1: Trigger embeddings voor alle ge-upsertte items in batches
    if (upsertedIds.length > 0) {
      console.log(`🔄 Triggering embedding generation for ${upsertedIds.length} items...`);
      const batchSize = 5;
      for (let i = 0; i < upsertedIds.length; i += batchSize) {
        const batch = upsertedIds.slice(i, i + batchSize);
        const promises = batch.map(id => 
          supabaseClient.functions.invoke('generate-embedding', {
            body: { knowledge_id: id }
          }).catch(err => console.warn(`⚠️ Embedding trigger failed for ${id}:`, err))
        );
        await Promise.all(promises);
        if (i + batchSize < upsertedIds.length) {
          await new Promise(r => setTimeout(r, 200)); // 200ms delay tussen batches
        }
      }
      console.log(`✅ Triggered embeddings for ${upsertedIds.length} items`);
    }

    const response = {
      success: true,
      total_clients: clients?.length || 0,
      seeded: seedCount,
      errors: errors.length > 0 ? errors : undefined,
      message: `✅ Succesvol ${seedCount} van ${clients?.length || 0} clients toegevoegd aan AI knowledge base${errors.length > 0 ? ` (${errors.length} fouten)` : ''}`
    };

    console.log('Seeding complete:', response);

    return jsonResponse(response);

  } catch (error) {
    console.error('Seed client knowledge error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
