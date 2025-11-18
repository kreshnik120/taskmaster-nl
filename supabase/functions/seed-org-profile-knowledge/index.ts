import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ✅ Check Authorization header EERST
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('❌ No Authorization header in request');
      return new Response(
        JSON.stringify({ 
          error: 'No authorization header', 
          hint: 'Ensure you are logged in and the session is active' 
        }), 
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('✅ Authorization header found, creating Supabase client...');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const supabaseServiceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ✅ Verify user met betere error message
    console.log('🔐 Verifying user authentication...');
    const accessToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(accessToken);
    
    if (authError) {
      console.error('❌ Auth verification failed:', authError);
      return new Response(
        JSON.stringify({ 
          error: 'Authentication failed', 
          details: authError.message || 'Unknown auth error' 
        }), 
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    if (!user) {
      console.error('❌ No user found in token');
      return new Response(
        JSON.stringify({ error: 'No user found - token may be expired' }), 
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`✅ User authenticated: ${user.id}`)

    console.log('🌱 Starting org_profile knowledge seeding...');

    // Get user's org
    const { data: userOrg } = await supabaseClient
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    if (!userOrg?.org_id) {
      return new Response(JSON.stringify({ error: 'No organization found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch all org_profiles for this org
    const { data: orgProfiles, error: profilesError } = await supabaseClient
      .from('org_profiles')
      .select('*')
      .eq('org_id', userOrg.org_id);

    if (profilesError) {
      console.error('Error fetching org_profiles:', profilesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch org_profiles' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!orgProfiles || orgProfiles.length === 0) {
      return new Response(JSON.stringify({ message: 'No org_profiles found to seed', created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📦 Found ${orgProfiles.length} org_profiles to seed`);

    const createdItems = [];
    const errors = [];

    // Create knowledge items for each org_profile
    for (const profile of orgProfiles) {
      const key = `company_facts:${profile.brand_name}`;
      
      // Check if this knowledge item already exists
      const { data: existingItem } = await supabaseServiceClient
        .from('ai_knowledge_base')
        .select('id')
        .eq('org_id', userOrg.org_id)
        .eq('category', 'org_profile')
        .eq('key', key)
        .maybeSingle();

      if (existingItem) {
        console.log(`⏭️  Skipping ${key} - already exists`);
        continue;
      }

      // Build value with all company facts
      const value = {
        brand_name: profile.brand_name,
        kvk_number: profile.kvk_number,
        business_type: profile.business_type,
        primary_domain: profile.primary_domain,
        services: profile.services || [],
        excluded_services: profile.excluded_services || [],
        description: `Geverifieerde bedrijfsgegevens voor ${profile.brand_name}. KvK: ${profile.kvk_number}. Bedrijfstype: ${profile.business_type}.`
      };

      // Insert knowledge item
      const { data: knowledgeItem, error: insertError } = await supabaseServiceClient
        .from('ai_knowledge_base')
        .insert({
          org_id: userOrg.org_id,
          user_id: user.id,
          category: 'org_profile',
          key: key,
          value: JSON.stringify(value),
          confidence_score: 0.98,
          validation_status: 'verified',
          source: 'org_profile_seed',
          role_tags: ['admin', 'manager', 'planner', 'professional'],
        })
        .select()
        .single();

      if (insertError) {
        console.error(`❌ Failed to insert ${key}:`, insertError);
        errors.push({ key, error: insertError.message });
        continue;
      }

      console.log(`✅ Created knowledge item: ${key}`);
      createdItems.push(knowledgeItem);

      // Generate embedding for this item
      try {
        const embeddingResponse = await supabaseServiceClient.functions.invoke('generate-embedding', {
          body: { knowledge_id: knowledgeItem.id }
        });

        if (embeddingResponse.error) {
          console.error(`⚠️  Failed to generate embedding for ${key}:`, embeddingResponse.error);
        } else {
          console.log(`🧠 Generated embedding for ${key}`);
        }
      } catch (embError) {
        console.error(`⚠️  Embedding generation failed for ${key}:`, embError);
      }
    }

    console.log(`🎉 Seeding complete: ${createdItems.length} items created, ${errors.length} errors`);

    return new Response(JSON.stringify({
      success: true,
      created: createdItems.length,
      errors: errors.length,
      items: createdItems.map(item => ({ id: item.id, key: item.key })),
      errorDetails: errors
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Seed function error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
